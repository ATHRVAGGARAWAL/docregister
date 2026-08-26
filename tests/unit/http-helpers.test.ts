import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { join } from "node:path";
import { test } from "node:test";

import { NextResponse } from "next/server.js";

/**
 * The helpers a route reaches for before it touches the database.
 *
 * They are small enough to read as self-evidently correct, which is why they
 * had no tests. What they actually decide is what a doctor sees when a payload
 * is malformed: whether it comes back as a 400 naming the field, or as a 500
 * that reads like the clinic's server broke — and whether the value they typed
 * is echoed back into a browser console next to their patient's name.
 *
 * `withDoctor`, which is the other half of this module, is covered in
 * `api-contract.test.ts`.
 */

const ROOT = process.cwd();

/**
 * `module.stripTypeScriptTypes` is newer than this repo's `@types/node` (v20),
 * so its signature has to be written out here. `transform` mode is the half
 * that matters: `strip` mode refuses the same parameter property the runner
 * refuses.
 */
const nodeTypeScript = nodeModule as unknown as {
  stripTypeScriptTypes?: (code: string, options: { mode: "strip" | "transform" }) => string;
};

function transformTypeScript(source: string): string {
  const strip = nodeTypeScript.stripTypeScriptTypes;
  if (!strip) throw new Error("node:module has no stripTypeScriptTypes — this needs a newer Node");
  return strip(source, { mode: "transform" });
}

/**
 * Run a server module in this process.
 *
 * `http.ts` cannot be imported. The unit runner strips types rather than
 * compiling them, and `ApiError`'s `readonly status` constructor parameter is
 * not erasable syntax — Node rejects the file with
 * `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` before any of it runs. It also imports
 * through `@/`, which the runner does not alias.
 *
 * So the source is put through Node's own TypeScript transform, which does
 * emit parameter properties, and its handful of import statements are rewired
 * to the table the caller passes. Everything under test is then the real text
 * of the module, running as itself in this realm.
 *
 * (`api-contract.test.ts` carries this loader too. The runner's glob is
 * `tests/unit/*.test.ts`, so a shared module beside them would be left alone —
 * worth extracting if a third file ever needs it.)
 */
function load(relativePath: string, imports: Record<string, unknown>): Record<string, unknown> {
  const js = transformTypeScript(readFileSync(join(ROOT, relativePath), "utf8"));

  const exported = [
    ...js.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm),
  ].map((match) => match[1]);
  assert.ok(exported.length > 0, `${relativePath}: no exported values found`);

  const body = js
    // A bare `import "server-only"` is a bundler marker with no runtime half.
    .replace(/^import\s+"[^"]+";$/gm, "")
    .replace(/^import\s+\{([^}]+)\}\s+from\s+"([^"]+)";$/gm, 'const {$1} = __import("$2");')
    .replace(/^export\s+/gm, "");

  // Anything this rewriter did not understand would otherwise reach `new
  // Function` as a syntax error pointing at a line number in generated code.
  const leftover = body.match(/^\s*(?:import|export)\b.*$/gm);
  assert.equal(leftover, null, `${relativePath}: unhandled module syntax: ${leftover?.join(" / ")}`);

  const factory = new Function(
    "__import",
    // ESM is strict-mode; the transformed body has to keep running under the
    // same rules it was written for.
    `"use strict";\n${body}\nreturn { ${exported.join(", ")} };`,
  ) as (resolve: (specifier: string) => unknown) => Record<string, unknown>;

  return factory((specifier) => {
    const substitute = imports[specifier];
    assert.ok(substitute, `${relativePath}: nothing registered for "${specifier}"`);
    return substitute;
  });
}

const http = load("src/lib/api/http.ts", {
  "next/server": { NextResponse },
  "@/lib/llm/types": load("src/lib/llm/types.ts", {}),
  "@/lib/stt/types": load("src/lib/stt/types.ts", {}),
  // Nothing below reaches `withDoctor`, so a session is never resolved here.
  "@/lib/supabase/server": {
    getCurrentDoctor: () => assert.fail("a helper asked for the signed-in doctor"),
    getSupabaseServerClient: () => assert.fail("a helper asked for a database client"),
  },
});

type ApiErrorConstructor = new (message: string, status?: number) => Error & { status: number };

const ApiError = http.ApiError as ApiErrorConstructor;
const jsonError = http.jsonError as (message: string, status?: number) => Response;
const readBody = http.readBody as <T>(request: Request) => Promise<T>;
const requireString = http.requireString as (value: unknown, field: string) => string;

function post(body: BodyInit): Request {
  return new Request("http://clinic.test/api/encounters/extract", { method: "POST", body });
}

/** The rejection of an `ApiError`-throwing call, or a failure if it resolved. */
async function rejection(run: () => Promise<unknown>): Promise<Error & { status: number }> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof ApiError, `threw ${String(error)} rather than an ApiError`);
    return error;
  }
  return assert.fail("expected a rejection");
}

test("a body that is not JSON is the caller's 400, not the server's 500", async () => {
  // The distinction is `ApiError` or not: `withDoctor` answers an `ApiError`
  // with its own status and message, and anything else with a 500 and "something
  // went wrong on our end". A truncated request body is the client's problem,
  // and a doctor told the server broke will stop rather than retry.
  for (const body of ["{oops", "", "<html>", '{"unterminated": "'])
    assert.equal((await rejection(() => readBody(post(body)))).status, 400, `body: ${body}`);
});

test("the JSON parser's own text never reaches the caller", async () => {
  // `SyntaxError: Unexpected token o in JSON at position 1` quotes the payload
  // back, and the payload on this route is a consultation.
  const error = await rejection(() => readBody(post('{"patient_name": "Sunita Devi"')));

  assert.equal(error.message, "Expected a JSON body.");
  assert.doesNotMatch(error.message, /Unexpected|position|SyntaxError|Sunita/);
});

test("a body that parses is handed on exactly as it arrived", async () => {
  // `readBody` is a parser, not a validator — every field is re-checked at its
  // point of use. Trimming or defaulting here would hide a missing field from
  // the check that is supposed to catch it.
  const sent = { transcriptId: " 7f3a ", age_years: 0, prescription: [], notes: null };

  assert.deepEqual(await readBody(post(JSON.stringify(sent))), sent);
});

test("requireString trims what it returns", async () => {
  // A name arriving as "  Sunita Devi\n" from a mobile keyboard must not reach
  // the register with the whitespace attached, where it looks identical on
  // screen to the same name typed cleanly and is not equal to it.
  assert.equal(requireString("  Sunita Devi\n", "patient_name"), "Sunita Devi");
  assert.equal(requireString("\t7f3a-2b ", "transcriptId"), "7f3a-2b");
  assert.equal(requireString("Amoxicillin 500 mg", "drug_name"), "Amoxicillin 500 mg");
});

test("requireString rejects everything that is not text a doctor typed", async () => {
  // Without this guard a number or an object stops at the next `.trim()` with a
  // TypeError, and `withDoctor` can only report that as "something went wrong on
  // our end" — the doctor is told the server broke when a field was left blank.
  for (const value of [undefined, null, 42, 0, true, false, {}, [], " ", "", "\n\t "]) {
    const error = await rejection(async () => requireString(value, "diagnosis"));

    assert.equal(error.status, 400, `accepted ${JSON.stringify(value) ?? "undefined"}`);
    assert.equal(error.message, "`diagnosis` is required.");
  }
});

test("a rejected value is never quoted back in the error", async () => {
  // The rejected value is whatever the doctor typed, and this message reaches a
  // browser console and a server log. The field name is enough to fix the call.
  const phone = await rejection(async () => requireString(9876543210, "phone"));
  const patient = await rejection(async () =>
    requireString({ full_name: "Sunita Devi" }, "patient_name"),
  );

  assert.equal(phone.message, "`phone` is required.");
  assert.doesNotMatch(phone.message, /9876543210/);
  assert.doesNotMatch(patient.message, /Sunita/);
});

test("an ApiError carries a status a route can choose, defaulting to 400", async () => {
  assert.equal(new ApiError("Draft not found.", 404).status, 404);
  assert.equal(new ApiError("`text` is required.").status, 400);
  assert.equal(new ApiError("x").name, "ApiError");
  assert.ok(new ApiError("x") instanceof Error, "must survive an `instanceof Error` guard");
});

test("every error response is JSON shaped { error }", async () => {
  // Every client helper in this app reads `body.error`. A response that is not
  // JSON surfaces to the doctor as `Unexpected token '<'`.
  const response = jsonError("Draft not found.", 404);
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(body, { error: "Draft not found." });
  assert.equal(jsonError("x").status, 400);
});

test("PGRST_NO_ROWS is PostgREST's code, not one this app chose", async () => {
  // Pinned because the constant is only ever compared against a value PostgREST
  // produces. A typo here is invisible: every `.single()` miss silently becomes
  // "the database is broken" — a 500 on a draft that is simply not there.
  assert.equal(http.PGRST_NO_ROWS, "PGRST116");
});
