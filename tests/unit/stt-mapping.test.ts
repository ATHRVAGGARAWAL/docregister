import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

/**
 * What a provider failure turns into by the time a doctor sees it.
 *
 * Two layers, tested together because they are one path: the STT layer decides
 * whether a failure is worth failing over (`SttError.retryable`), and `http.ts`
 * decides what the doctor is told about whatever came out the other end. Both
 * only run when something is already wrong, which is why neither had a test.
 *
 * Read as source and run in a `node:vm` context rather than imported: these
 * modules resolve `@/lib/env`, which the unit runner does not alias, and both
 * error classes declare their fields as constructor parameter properties,
 * which strip-only type stripping refuses outright. The stubs below stand in
 * for the vendor adapters; the branching under test is the real text.
 */

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/**
 * Comments quote the literals this file searches for — `http.ts` has a comment
 * containing a doctor-facing sentence, and `sarvam.ts` has one containing an
 * error code. Parsing prose as code finds the wrong strings.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const HTTP = stripComments(read("src/lib/api/http.ts"));
const STT_TYPES = stripComments(read("src/lib/stt/types.ts"));
const LLM_TYPES = stripComments(read("src/lib/llm/types.ts"));
const LLM_INDEX = stripComments(read("src/lib/llm/index.ts"));

/**
 * The body of a top-level function, located without parsing TypeScript.
 *
 * Braces are counted from the first one that opens at neither paren nor angle
 * depth, which is what skips a return type like `Promise<{ ok: boolean }>` and
 * lands on the body instead.
 */
function bodyOf(source: string, declaration: RegExp): string {
  const start = source.search(declaration);
  assert.ok(start >= 0, `${declaration} not found — has the function been renamed?`);

  let parens = 0;
  let angles = 0;
  let open = start;
  for (; open < source.length; open++) {
    const char = source[open];
    if (char === "(") parens++;
    else if (char === ")") parens--;
    else if (parens === 0 && char === "<") angles++;
    else if (parens === 0 && char === ">") angles = Math.max(0, angles - 1);
    else if (char === "{" && parens === 0 && angles === 0) break;
  }
  assert.ok(open < source.length, `no body brace after ${declaration}`);

  let depth = 0;
  let close = open;
  for (; close < source.length; close++) {
    if (source[close] === "{") depth++;
    else if (source[close] === "}" && --depth === 0) break;
  }
  assert.ok(depth === 0, `unbalanced braces after ${declaration}`);

  return source.slice(open + 1, close);
}

/** The union members of a type, wherever it is written. */
function codesIn(source: string, pattern: RegExp, label: string): string[] {
  const match = pattern.exec(source);
  assert.ok(match, `${label} is no longer declared where this test looks for it`);
  const codes = [...match![1].matchAll(/"([a-z_]+)"/g)].map((code) => code[1]);
  assert.ok(codes.length > 0, `${label} has no members`);
  return codes;
}

interface Answer {
  message: string;
  status: number;
}

interface Mapping {
  cases: Map<string, Answer>;
  fallback: Answer;
}

function mappingIn(functionName: string): Mapping {
  const body = bodyOf(HTTP, new RegExp(`function ${functionName}\\b`));

  const cases = new Map<string, Answer>(
    [...body.matchAll(/case "([a-z_]+)":\s*return \["([^"]+)",\s*(\d+)\]/g)].map((match) => [
      match[1],
      { message: match[2], status: Number(match[3]) },
    ]),
  );

  // A case that stops returning a bare literal would otherwise look to this
  // parser like a code with no message at all, and the failure would point at
  // the wrong file.
  const labels = [...body.matchAll(/case "([a-z_]+)":/g)].map((match) => match[1]);
  assert.deepEqual(
    labels,
    [...cases.keys()],
    `a case in ${functionName} no longer returns a literal message and a status`,
  );

  const fallback = /default:\s*return \["([^"]+)",\s*(\d+)\]/.exec(body);
  assert.ok(fallback, `${functionName} has no default branch — a new code would reach no message`);
  return {
    cases,
    fallback: { message: fallback![1], status: Number(fallback![2]) },
  };
}

const LLM_CODES = codesIn(LLM_TYPES, /export type LlmErrorCode\s*=([^;]+);/, "LlmErrorCode");
const STT_CODES = codesIn(STT_TYPES, /readonly code:([\s\S]*?)readonly retryable/, "SttError.code");

const LLM_MAPPING = mappingIn("llmResponse");
const STT_MAPPING = mappingIn("sttResponse");

function answerFor(mapping: Mapping, code: string): Answer {
  return mapping.cases.get(code) ?? mapping.fallback;
}

test("every STT failure has its own sentence for the doctor", () => {
  // The doctor acts differently on each of these — a busy service is worth
  // retrying, a muted mic is worth re-recording, a rejected key is worth
  // calling someone about — so the mapping is not allowed to collapse two of
  // them into one sentence.
  const seen = new Map<string, string>();

  for (const code of STT_CODES) {
    const answer = answerFor(STT_MAPPING, code);
    assert.ok(answer.message.length > 0, `${code}: no message`);
    assert.ok(
      answer.status >= 400 && answer.status < 600,
      `${code}: ${answer.status} is not a failure status`,
    );

    const clash = seen.get(answer.message);
    assert.equal(clash, undefined, `${code} and ${clash} tell the doctor the same thing`);
    seen.set(answer.message, code);
  }
});

test("only a genuinely unclassified STT failure reaches the catch-all", () => {
  const unclassified = STT_CODES.filter((code) => !STT_MAPPING.cases.has(code));

  assert.deepEqual(
    unclassified,
    ["provider_error"],
    "a new SttError code is reaching the doctor through the default branch. " +
      "Give it a sentence in sttResponse, or add it here if the catch-all is genuinely right for it",
  );
});

test("every LLM failure the doctor can act on differently says something different", () => {
  const seen = new Map<string, string>();

  for (const code of LLM_CODES.filter((code) => LLM_MAPPING.cases.has(code))) {
    const answer = answerFor(LLM_MAPPING, code);
    assert.ok(answer.message.length > 0, `${code}: no message`);
    assert.ok(
      answer.status >= 400 && answer.status < 600,
      `${code}: ${answer.status} is not a failure status`,
    );

    const clash = seen.get(answer.message);
    assert.equal(clash, undefined, `${code} and ${clash} tell the doctor the same thing`);
    seen.set(answer.message, code);
  }

  // `invalid_output` and `provider_error` deliberately share the catch-all:
  // both mean the model did not give us something usable, and the doctor's move
  // is the same either way. The pin is on the *list* — a code added later
  // inherits that sentence silently, and "the assistant could not read that
  // dictation" is wrong for, say, a quota that has run out.
  assert.deepEqual(
    LLM_CODES.filter((code) => !LLM_MAPPING.cases.has(code)),
    ["invalid_output", "provider_error"],
    "a new LlmErrorCode is reaching the doctor through the default branch — decide what it should say",
  );
});

test("no doctor-facing message leaks a provider, a status code or a stack frame", () => {
  // A house rule, pinned here permanently. The provider's own text can quote
  // the request back — which for this app means a patient's name, their
  // symptoms or their prescription — so it stays in the server log, where
  // `withDoctor` already puts it. The doctor gets what happened and what to do.
  const messages = [
    ...LLM_MAPPING.cases.values(),
    ...STT_MAPPING.cases.values(),
    LLM_MAPPING.fallback,
    STT_MAPPING.fallback,
  ]
    .map((answer) => answer.message)
    .concat([...HTTP.matchAll(/jsonError\(\s*"([^"]+)"/g)].map((match) => match[1]));

  assert.ok(messages.length >= STT_CODES.length, "the message parser found almost nothing");

  for (const message of messages) {
    assert.doesNotMatch(
      message,
      /\b(anthropic|claude|opus|sonnet|haiku|gemini|google|vertex|sarvam|saaras|eleven ?labs|scribe|deepgram|assembly ?ai|open ?ai|whisper|indicconformer|supabase|postgres|postgrest)\b/i,
      `names a vendor: "${message}"`,
    );
    assert.doesNotMatch(message, /\b[1-5]\d{2}\b/, `quotes a status code: "${message}"`);
    assert.doesNotMatch(
      message,
      /PGRST|node_modules|\.tsx?\b|\bat [A-Z]\w*\.|Error:|\$\{/,
      `leaks an internal: "${message}"`,
    );
  }
});

/**
 * Stands in for `SttError`, which this runner cannot import (see the top of the
 * file). The failover only reads `retryable` and its own `instanceof`.
 */
class FakeSttError extends Error {
  code: string;
  retryable: boolean;

  constructor(code: string, retryable: boolean) {
    super(`test double: ${code}`);
    this.name = "SttError";
    this.code = code;
    this.retryable = retryable;
  }
}

const attempts: string[] = [];
const behaviour: Record<string, { throws?: unknown; romanText?: string }> = {};
let romanisations = 0;

class StubProvider {
  name: string;
  supportsLive = false;

  constructor(name: string) {
    this.name = name;
  }

  async transcribe(): Promise<Record<string, unknown>> {
    attempts.push(this.name);
    const leg = behaviour[this.name] ?? {};
    if (leg.throws) throw leg.throws;
    return { text: `${this.name} transcript`, romanText: leg.romanText, provider: this.name };
  }
}

// Named to match what `fallbackFor` constructs: it picks the partner engine by
// class, so the swap it performs is only observable through real class names.
class SarvamProvider extends StubProvider {
  constructor() {
    super("sarvam");
  }

  async romanise(): Promise<string> {
    romanisations++;
    return "romanised";
  }
}

class ElevenLabsProvider extends StubProvider {
  constructor() {
    super("elevenlabs");
  }
}

const STT_INDEX = stripComments(read("src/lib/stt/index.ts"));
const FAILOVER = [
  `function fallbackFor(primary) {${bodyOf(STT_INDEX, /function fallbackFor\b/)}}`,
  `async function transcribeWithFailover(input) {${bodyOf(STT_INDEX, /function transcribeWithFailover\b/)}}`,
  "transcribeWithFailover;",
].join("\n");

interface Outcome {
  /** Providers asked to transcribe, in order. */
  attempts: string[];
  result?: { provider?: string; degraded?: boolean };
  failure?: unknown;
}

async function transcribeWith(
  primary: StubProvider,
  env: Record<string, string | undefined>,
): Promise<Outcome> {
  attempts.length = 0;

  const transcribeWithFailover = runInNewContext(FAILOVER, {
    getSttProvider: () => primary,
    SarvamProvider,
    ElevenLabsProvider,
    SttError: FakeSttError,
    process: { env },
  }) as (input: unknown) => Promise<{ provider?: string; degraded?: boolean }>;

  const outcome: Outcome = { attempts };
  try {
    outcome.result = await transcribeWithFailover({ audio: null, mimeType: "audio/webm" });
  } catch (failure) {
    outcome.failure = failure;
  }
  return { ...outcome, attempts: [...attempts] };
}

const BOTH_KEYS = { SARVAM_API_KEY: "sarvam-key", ELEVENLABS_API_KEY: "elevenlabs-key" };

test("a retryable failure reaches the other engine, and the note is marked degraded", async () => {
  behaviour.sarvam = { throws: new FakeSttError("provider_error", true) };
  behaviour.elevenlabs = {};

  const outcome = await transcribeWith(new SarvamProvider(), BOTH_KEYS);

  assert.deepEqual(outcome.attempts, ["sarvam", "elevenlabs"]);
  assert.equal(outcome.result?.provider, "elevenlabs");
  assert.equal(
    outcome.result?.degraded,
    true,
    "a note that came from the weaker engine must say so — silently degrading a clinical record is worse than an error",
  );
});

test("a failure the second engine cannot change is not sent to it", async () => {
  // A rejected key and an unusable recording fail identically on both vendors.
  // The second call costs the doctor the wait and the clinic the request, and
  // ends at the same message.
  for (const code of ["auth", "empty_audio", "unsupported_format"]) {
    const refusal = new FakeSttError(code, false);
    behaviour.sarvam = { throws: refusal };
    behaviour.elevenlabs = {};

    const outcome = await transcribeWith(new SarvamProvider(), BOTH_KEYS);

    assert.deepEqual(outcome.attempts, ["sarvam"], `${code}: failed over anyway`);
    assert.equal(outcome.failure, refusal, `${code}: the original error must reach the doctor`);
  }
});

test("the fallback is whichever engine is not primary", async () => {
  behaviour.elevenlabs = { throws: new FakeSttError("provider_error", true) };
  behaviour.sarvam = {};

  const outcome = await transcribeWith(new ElevenLabsProvider(), BOTH_KEYS);

  assert.deepEqual(
    outcome.attempts,
    ["elevenlabs", "sarvam"],
    "flipping STT_PROVIDER must swap the pair, not delete the safety net",
  );
  assert.equal(outcome.result?.degraded, true);
});

test("without the partner's key there is no second attempt", async () => {
  const stall = new FakeSttError("provider_error", true);
  behaviour.sarvam = { throws: stall };

  const outcome = await transcribeWith(new SarvamProvider(), { SARVAM_API_KEY: "sarvam-key" });

  assert.deepEqual(outcome.attempts, ["sarvam"]);
  assert.equal(outcome.failure, stall);
});

test("the offline mock never fails over to a paid API", async () => {
  // `STT_PROVIDER=mock` is the keyless dev and e2e path. Failing over from it
  // would turn a run with no keys into a live billed request.
  behaviour.mock = { throws: new FakeSttError("provider_error", true) };

  const outcome = await transcribeWith(new StubProvider("mock"), BOTH_KEYS);

  assert.deepEqual(outcome.attempts, ["mock"]);
});

test("a successful primary is not degraded, and Sarvam still romanises", async () => {
  behaviour.sarvam = {};
  romanisations = 0;

  const outcome = await transcribeWith(new SarvamProvider(), BOTH_KEYS);

  assert.deepEqual(outcome.attempts, ["sarvam"]);
  assert.equal(outcome.result?.degraded, false);
  assert.equal(romanisations, 1, "the romanised rendering is what makes a transcript skimmable on a phone");
});

const STT_TIMEOUT_MS = (() => {
  const match = /\bSTT_TIMEOUT_MS\s*=\s*([0-9_]+)/.exec(STT_TYPES);
  assert.ok(match, "STT_TIMEOUT_MS is no longer a numeric constant in src/lib/stt/types.ts");
  return Number(match![1].replace(/_/g, ""));
})();

test("a networked provider always transcribes under a deadline it reports as retryable", () => {
  const providers = readdirSync(join(ROOT, "src/lib/stt"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, source: read(`src/lib/stt/${name}`) }))
    .filter((file) => file.source.includes("implements SttProvider") && file.source.includes("fetch("));
  assert.ok(providers.length > 0, "no networked STT provider found");

  for (const provider of providers) {
    assert.match(
      provider.source,
      /signal: AbortSignal\.timeout\(/,
      `${provider.name}: a request with no deadline holds the route open until the platform kills it`,
    );
    assert.ok(
      provider.source.includes("STT_TIMEOUT_MS"),
      `${provider.name}: its deadline must come from the shared budget, which is what makes two legs fit in one request`,
    );

    const index = provider.source.indexOf("TimeoutError");
    assert.ok(index > 0, `${provider.name}: nothing distinguishes a stall from any other failure`);
    assert.match(
      provider.source.slice(index, index + 300),
      /new SttError\(\s*"[^"]*",\s*"[a-z_]+",\s*true\s*\)/,
      `${provider.name}: a stall must be retryable, or the timeout fails instead of failing over`,
    );
  }
});

test("a transcription and the extraction after it still fit inside their routes", () => {
  const routes = (function walk(directory: string): string[] {
    return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(directory, entry.name))
        : entry.name === "route.ts"
          ? [join(directory, entry.name)]
          : [],
    );
  })("src/app/api").filter((path) => read(path).includes("transcribeWithFailover"));
  assert.ok(routes.length > 0, "no route transcribes");

  // The longest a single model call may take, whichever tier it is.
  const longestModelCall = Math.max(
    ...[...LLM_INDEX.matchAll(/total:\s*([0-9_]+)/g)].map((match) =>
      Number(match[1].replace(/_/g, "")),
    ),
  );

  for (const routePath of routes) {
    const source = stripComments(read(routePath));
    const declared = /export const maxDuration\s*=\s*(\d+)/.exec(source);
    assert.ok(declared, `${routePath} transcribes without declaring a maxDuration`);
    const ceiling = Number(declared![1]) * 1000;

    assert.ok(
      STT_TIMEOUT_MS * 2 <= ceiling,
      `${routePath}: a stalled primary plus its fallback is ${STT_TIMEOUT_MS * 2}ms against a ${ceiling}ms ceiling`,
    );

    // The retry route pays for transcription and extraction in one request.
    // Only one stalled leg is counted here: the double-stall case does not fit
    // and is written down as a known overflow in that route's own comment, so
    // asserting it would pin a decision this test has no business making. What
    // must hold is the ordinary bad day — one slow provider, one full-length
    // extraction — which is what these budgets were sized for.
    if (source.includes("@/lib/llm/extract")) {
      assert.ok(
        STT_TIMEOUT_MS + longestModelCall <= ceiling,
        `${routePath}: one transcription leg plus one extraction is ${STT_TIMEOUT_MS + longestModelCall}ms ` +
          `against a ${ceiling}ms ceiling — the platform kills this route before it can answer`,
      );
    }
  }
});
