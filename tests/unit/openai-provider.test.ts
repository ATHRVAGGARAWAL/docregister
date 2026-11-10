import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import OpenAI from "openai";
import { z } from "zod/v4";

const require = createRequire(import.meta.url);

// Exercise the production adapter and real SDK with an isolated HTTP transport.
// Transpilation handles the app's server-only marker and Next.js import alias.
function loadModule(file: string, imports: Record<string, unknown>, env = {}) {
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(source, {
    exports, process: { env },
    require: (name: string) => name === "server-only" ? {} : imports[name] ?? require(name),
  });
  return exports;
}

const types = loadModule("src/lib/llm/types.ts", {});
const request = {
  system: "Extract the test name.", user: "Name: Test", schema: z.object({ name: z.string() }),
  schemaName: "test_name", tier: "fast" as const, maxOutputTokens: 128,
};

function setup(body: unknown, status = 200) {
  const calls: { body: Record<string, unknown>; options: Record<string, unknown> }[] = [];
  class Client extends OpenAI {
    constructor(options: Record<string, unknown>) {
      super({ ...options, apiKey: "test-key", fetch: async (_url, init) => {
        calls.push({ body: JSON.parse(String(init?.body)), options });
        return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      } });
    }
  }
  const adapterModule = loadModule("src/lib/llm/openai.ts", {
    openai: Client, "@/lib/env": { env: { openaiApiKey: "test-key" } }, "./types": types,
  }, { OPENAI_BASE_URL: "https://provider.example/openai/v1" });
  const Provider = adapterModule.OpenAIProvider as new () => {
    generate: (req: typeof request | Omit<typeof request, "tier"> & { tier: "precise" }, options: { timeoutMs: number }) => Promise<{
      value: { name: string }; model: string; usage: { cacheRead: number };
    }>;
  };
  return { provider: new Provider(), calls };
}

function completed(text = '{"name":"Test"}') {
  return { id: "resp_test", object: "response", status: "completed", model: "gpt-6-astra",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }],
    usage: { input_tokens: 20, output_tokens: 5, input_tokens_details: { cached_tokens: 10 } } };
}

test("OpenAI validates structured output and preserves tier, privacy, and retry settings", async () => {
  const { provider, calls } = setup(completed());
  const result = await provider.generate(request, { timeoutMs: 1000 });
  assert.equal(result.value.name, "Test");
  assert.equal(result.model, "gpt-6-astra");
  assert.equal(result.usage.cacheRead, 10);
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].body.model, "gpt-6-astra");
  assert.deepEqual(calls[0].body.reasoning, { effort: "low" });
  assert.equal(calls[0].options.maxRetries, 0);
  const text = calls[0].body.text as { format: { type: string; strict: boolean } };
  assert.equal(text.format.type, "json_schema");
  assert.equal(text.format.strict, true);
  await provider.generate({ ...request, tier: "precise" }, { timeoutMs: 1000 });
  assert.deepEqual(calls[1].body.reasoning, { effort: "medium" });
});

test("OpenAI rejects malformed or schema-invalid output", async () => {
  for (const text of ['not json', '{"name":42}']) {
    await assert.rejects(setup(completed(text)).provider.generate(request, { timeoutMs: 1000 }),
      { code: "invalid_output", retryable: false });
  }
});

test("OpenAI distinguishes refusal and exhausted output budgets", async () => {
  const refusal = { ...completed(), output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] };
  await assert.rejects(setup(refusal).provider.generate(request, { timeoutMs: 1000 }), { code: "blocked", retryable: false });
  const incomplete = { ...completed(), status: "incomplete", incomplete_details: { reason: "max_output_tokens" } };
  await assert.rejects(setup(incomplete).provider.generate(request, { timeoutMs: 1000 }), { code: "truncated" });
});

test("OpenAI classifies HTTP errors without exposing provider response text", async () => {
  for (const [status, code, retryable] of [[401, "auth", false], [429, "rate_limited", true], [500, "provider_error", true]] as const) {
    const { provider } = setup({ error: { message: "private transcript", code: "test_error" } }, status);
    await assert.rejects(provider.generate(request, { timeoutMs: 1000 }), (error: unknown) => {
      const value = error as { code: string; retryable: boolean; message: string };
      assert.equal(value.code, code);
      assert.equal(value.retryable, retryable);
      assert.ok(!value.message.includes("private transcript"));
      return true;
    });
  }
});
