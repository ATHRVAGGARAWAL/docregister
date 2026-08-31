import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as nodeModule from "node:module";
import { join, relative } from "node:path";
import { test } from "node:test";
import { inspect } from "node:util";

import { NextResponse } from "next/server.js";

/**
 * What `/api` promises a caller.
 *
 * Two halves. The first runs the real `withDoctor` against stubbed session and
 * database seams: who gets in, what a spent rate limit does, and what a doctor
 * is told when a handler throws. Most of those branches only run once something
 * has already gone wrong, which is why nothing exercised them — and the shape of
 * the mistake they make is a route answering a database outage with "not found",
 * sending a doctor off to re-dictate a consultation that was never lost.
 *
 * The second half reads the route files, because two of the guarantees belong to
 * the whole surface rather than to any one function: that a route cannot be
 * added without a session behind it, and that a query error is not turned into a
 * missing row. One route still does the latter; it is named at the bottom.
 *
 * `stt-mapping.test.ts` pins the *text* of the two error-mapping switches. This
 * file asks the different question: that a provider failure thrown inside a
 * handler reaches that mapping at all, rather than falling through to the
 * generic 500, and that what comes back is a response and not a log line.
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
 * of the module, running as itself in this realm — including both error
 * classes, so the `instanceof` branches are the genuine ones.
 *
 * (`http-helpers.test.ts` carries this loader too. The runner's glob is
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

/* ---- The seams `withDoctor` reaches ------------------------------------ */

/** Shaped like a `doctors` row, and compared by identity below. */
const DOCTOR = {
  id: "11111111-1111-4111-8111-111111111111",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  full_name: "Dr Meera Nair",
  membership_status: "active",
};

interface RpcCall {
  fn: string;
  args: unknown;
}

/** Whatever `consume_rate_limit` should answer next. */
let rpcReply: { data?: unknown; error?: { code: string; message: string } | null } = { data: true };
let rpcCalls: RpcCall[] = [];
let session: () => Promise<unknown> = async () => DOCTOR;
let client: () => Promise<unknown> = async () => supabase;

const supabase = {
  rpc(fn: string, args: unknown) {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcReply);
  },
};

const llmTypes = load("src/lib/llm/types.ts", {});
const sttTypes = load("src/lib/stt/types.ts", {});
const http = load("src/lib/api/http.ts", {
  "next/server": { NextResponse },
  "@/lib/llm/types": llmTypes,
  "@/lib/stt/types": sttTypes,
  // Indirected rather than swapped: `http.ts` destructures these once at load.
  "@/lib/supabase/server": {
    getCurrentDoctor: () => session(),
    getSupabaseServerClient: () => client(),
  },
});

type LlmErrorConstructor = new (message: string, code?: string) => Error;
type SttErrorConstructor = new (message: string, code?: string, retryable?: boolean) => Error;

const LlmError = llmTypes.LlmError as LlmErrorConstructor;
const SttError = sttTypes.SttError as SttErrorConstructor;
const ApiError = http.ApiError as new (message: string, status?: number) => Error;

interface RouteContext {
  doctor: unknown;
  supabase: unknown;
  request: Request;
  params: unknown;
}

type Handler = (context: RouteContext) => Promise<Response> | Response;

const withDoctor = http.withDoctor as (
  handler: Handler,
  options?: { rateLimit?: string },
) => (request: Request, context?: { params?: Promise<unknown> }) => Promise<Response>;

interface Call {
  status: number;
  /** The parsed response body — every client in this app reads `body.error`. */
  body: Record<string, unknown>;
  headers: Headers;
  /** Contexts the handler was called with; empty when it never ran. */
  handled: RouteContext[];
  /** Everything `withDoctor` wrote to `console.error` during the call. */
  logs: string;
}

/** Fresh each time: a `Response` body can only be read once. */
const ok = () => NextResponse.json({ ok: true });

async function call(
  handler: Handler = ok,
  options: { rateLimit?: string } = {},
  init: { request?: Request; params?: Promise<unknown> } = {},
): Promise<Call> {
  const handled: RouteContext[] = [];
  const logs: string[] = [];
  const wrapped = withDoctor((context) => {
    handled.push(context);
    return handler(context);
  }, options);

  rpcCalls = [];
  const restore = console.error;
  // `withDoctor` logs the provider's own text on every mapped failure, which is
  // both the point and, left alone, several screens of noise per run.
  console.error = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === "string" ? arg : inspect(arg))).join(" "));
  };

  try {
    const request =
      init.request ?? new Request("http://clinic.test/api/encounters/extract", { method: "POST" });
    const response = await wrapped(request, init.params ? { params: init.params } : {});

    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
      headers: response.headers,
      handled,
      logs: logs.join("\n"),
    };
  } finally {
    console.error = restore;
  }
}

function resetSeams(): void {
  session = async () => DOCTOR;
  client = async () => supabase;
  rpcReply = { data: true };
}

/* ---- Who gets in ------------------------------------------------------- */

test("an unauthenticated request is told to sign in, and nothing else runs", async () => {
  resetSeams();
  session = async () => null;

  const result = await call(undefined, { rateLimit: "extract" });

  assert.equal(result.status, 401);
  assert.equal(result.body.error, "Sign in to continue.");
  assert.deepEqual(result.handled, [], "the handler ran without a doctor");
  // The bucket is keyed on `auth.uid()`, so an anonymous flood would otherwise
  // spend whichever doctor's tokens the database happened to resolve.
  assert.deepEqual(rpcCalls, [], "an anonymous request spent a rate-limit token");
});

test("a session that cannot be resolved is a 401, not a 500", async () => {
  // Either seam can throw: `cookies()` outside a request scope, a Supabase
  // client that cannot be constructed because an env var is missing, a network
  // error reading the `doctors` row. All of them mean the same thing to the
  // doctor — sign in again — and none of them should read as a crash.
  for (const failing of ["session", "client"]) {
    resetSeams();
    const boom = new Error("getaddrinfo ENOTFOUND db.abcdefgh.supabase.co");
    if (failing === "session") session = async () => Promise.reject(boom);
    else client = async () => Promise.reject(boom);

    const result = await call();

    assert.equal(result.status, 401, failing);
    assert.equal(result.body.error, "Could not verify your session.");
    assert.deepEqual(result.handled, [], `${failing}: the handler ran anyway`);
    assert.doesNotMatch(JSON.stringify(result.body), /supabase|ENOTFOUND/i);
  }
});

test("the handler is handed the doctor the database returned, not one the caller named", async () => {
  resetSeams();
  const request = new Request("http://clinic.test/api/encounters/extract", {
    method: "POST",
    body: JSON.stringify({ clinic_id: "33333333-3333-4333-8333-333333333333" }),
  });

  const result = await call(undefined, {}, { request });

  assert.equal(result.status, 200);
  assert.equal(result.handled.length, 1);
  // Identity, not shape: every clinic-scoped query in every route reads
  // `doctor.clinic_id` from here, and a body-supplied tenant is the whole
  // cross-clinic-read bug this indirection exists to make impossible.
  assert.equal(result.handled[0].doctor, DOCTOR);
  assert.equal(result.handled[0].supabase, supabase);
  assert.equal(result.handled[0].request, request);
});

test("dynamic params arrive resolved", async () => {
  // `params` is a promise in Next 16. A route that forgot to await it would
  // read `params.id` as undefined and quietly query for nothing.
  resetSeams();

  const withId = await call(undefined, {}, { params: Promise.resolve({ id: "7f3a" }) });
  const withNone = await call();

  assert.deepEqual(withId.handled[0].params, { id: "7f3a" });
  assert.deepEqual(withNone.handled[0].params, {}, "a route with no params must not see undefined");
});

/* ---- What a doctor is told when a handler throws ----------------------- */

test("an ApiError reaches the doctor as the route wrote it", async () => {
  resetSeams();

  for (const [message, status] of [
    ["Draft not found.", 404],
    ["This visit has already been saved to the register.", 409],
    ["That transcript is empty — nothing to extract.", 422],
    ["Could not save your changes.", 500],
  ] as Array<[string, number]>) {
    const result = await call(() => {
      throw new ApiError(message, status);
    });

    assert.equal(result.status, status);
    assert.equal(result.body.error, message);
  }

  const defaulted = await call(() => {
    throw new ApiError("`text` is required.");
  });
  assert.equal(defaulted.status, 400);
});

test("an unexpected failure never carries the record into the browser", async () => {
  resetSeams();
  // A Postgres error quotes the row back. On this app that row is a patient.
  const leak =
    'duplicate key value violates unique constraint "patients_phone_key" ' +
    "DETAIL: Key (clinic_id, phone)=(2222, 9876543210) already exists. PGRST116";

  for (const thrown of [new Error(leak), leak, { code: "23505", details: leak }]) {
    const result = await call(() => {
      throw thrown;
    });

    assert.equal(result.status, 500);
    assert.equal(result.body.error, "Something went wrong on our end. Please try again.");
    assert.doesNotMatch(JSON.stringify(result.body), /9876543210|patients_phone_key|PGRST/);
    // Suppressing it in the response is only safe because it is kept here.
    assert.match(result.logs, /9876543210/, "the detail an operator needs was dropped");
    assert.match(result.logs, /POST \/api\/encounters\/extract/, "the log does not say which route");
  }
});

/* ---- Provider failures ------------------------------------------------- */

/** Comments in these files quote both error codes and doctor-facing sentences. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The members of a string-literal union, wherever it is written. */
function codesIn(relativePath: string, pattern: RegExp, label: string): string[] {
  const match = pattern.exec(stripComments(readFileSync(join(ROOT, relativePath), "utf8")));
  assert.ok(match, `${label} is no longer declared where this test looks for it`);
  const codes = [...match[1].matchAll(/"([a-z_]+)"/g)].map((code) => code[1]);
  assert.ok(codes.length > 1, `${label} has ${codes.length} members — the parse is wrong`);
  return codes;
}

const LLM_CODES = codesIn(
  "src/lib/llm/types.ts",
  /export type LlmErrorCode\s*=([^;]+);/,
  "LlmErrorCode",
);
const STT_CODES = codesIn(
  "src/lib/stt/types.ts",
  /readonly code:([\s\S]*?)readonly retryable/,
  "SttError's code union",
);

/** What the provider's own text looks like, and must never be repeated. */
const PROVIDER_TEXT =
  "429 RESOURCE_EXHAUSTED: quota exceeded for gemini-3-pro-preview " +
  "at generateContent (/var/task/node_modules/@google/genai/dist/index.js:214:11)";

async function answerFor(build: (code: string) => Error, code: string): Promise<Call> {
  resetSeams();
  return call(() => {
    throw build(code);
  });
}

const asLlm = (code: string) => new LlmError(PROVIDER_TEXT, code);
const asStt = (code: string) => new SttError(PROVIDER_TEXT, code);

for (const [label, codes, build, shared] of [
  // `invalid_output` and `provider_error` deliberately land on the same
  // sentence: both mean the model returned nothing usable and the doctor's next
  // move is identical. Anything else sharing it is a code nobody decided about.
  ["LLM", LLM_CODES, asLlm, ["invalid_output", "provider_error"]],
  ["STT", STT_CODES, asStt, ["provider_error"]],
] as Array<[string, string[], (code: string) => Error, string[]]>) {
  test(`${label}: every failure the doctor can act on differently says something different`, async () => {
    // The catch-all, read the only way it can be read from outside: by throwing
    // a code the switch has no case for.
    const fallback = (await answerFor(build, "no_such_code_exists")).body.error;
    const seen = new Map<string, string>();
    const unclassified: string[] = [];

    for (const code of codes) {
      const result = await answerFor(build, code);
      const message = String(result.body.error);

      assert.ok(
        result.status >= 400 && result.status < 600,
        `${code}: answered ${result.status}, which is not a failure`,
      );
      assert.notEqual(
        result.status,
        500,
        `${code}: a provider failure reported as "went wrong on our end" — did the ` +
          `instanceof branch in withDoctor stop matching?`,
      );

      if (message === fallback) {
        unclassified.push(code);
        continue;
      }

      const clash = seen.get(message);
      assert.equal(clash, undefined, `${code} and ${clash} tell the doctor the same thing`);
      seen.set(message, code);
    }

    assert.deepEqual(
      unclassified,
      shared,
      `a ${label} error code is reaching the doctor through the catch-all — give it a ` +
        "sentence, or add it here if the catch-all is genuinely right for it",
    );
  });

  test(`${label}: the provider's own words stay on the server`, async () => {
    for (const code of [...codes, "no_such_code_exists"]) {
      const result = await answerFor(build, code);
      const message = String(result.body.error);

      assert.doesNotMatch(
        message,
        /\b(anthropic|claude|opus|sonnet|haiku|gemini|google|vertex|sarvam|saaras|eleven ?labs|scribe|deepgram|assembly ?ai|open ?ai|whisper|indicconformer|supabase|postgres|postgrest)\b/i,
        `${code} names a vendor: "${message}"`,
      );
      assert.doesNotMatch(message, /\b[1-5]\d{2}\b/, `${code} quotes a status code: "${message}"`);
      assert.doesNotMatch(
        message,
        /PGRST|node_modules|\.tsx?\b|\bat [A-Za-z]\w*[.(]|Error:|\$\{/,
        `${code} leaks an internal: "${message}"`,
      );
      assert.doesNotMatch(message, /RESOURCE_EXHAUSTED|quota/, `${code} repeats the provider`);

      // The doctor's half is useless to an operator, so the log keeps the rest —
      // including which code produced that sentence.
      assert.match(result.logs, /RESOURCE_EXHAUSTED/, `${code}: the provider's text was dropped`);
      assert.ok(result.logs.includes(code), `${code}: the log does not say which code it was`);
    }
  });
}

/* ---- Rate limiting ----------------------------------------------------- */

test("a route that declares no bucket never spends a token", async () => {
  resetSeams();

  const result = await call();

  assert.equal(result.status, 200);
  assert.deepEqual(rpcCalls, []);
});

test("the token is spent before the handler runs, under the action it declared", async () => {
  resetSeams();

  const result = await call(undefined, { rateLimit: "transcribe" });

  assert.equal(result.status, 200);
  assert.deepEqual(rpcCalls, [{ fn: "consume_rate_limit", args: { p_action: "transcribe" } }]);
});

test("an exhausted bucket is a 429 that says when to come back", async () => {
  resetSeams();
  rpcReply = { data: false };

  const result = await call(undefined, { rateLimit: "extract" });

  assert.equal(result.status, 429);
  assert.equal(result.body.error, "You have hit this hour's limit for that action. It resets shortly.");
  assert.equal(result.headers.get("Retry-After"), "3600");
  assert.deepEqual(result.handled, [], "the handler ran after the limit denied it");
});

test("a rate limiter that cannot answer refuses the request", async () => {
  // An abuse control that switches itself off when the database is unhappy is
  // not a control. 503 rather than 500: the request is worth retrying.
  resetSeams();
  rpcReply = { error: { code: "57014", message: "canceling statement due to statement timeout" } };

  const result = await call(undefined, { rateLimit: "commit" });

  assert.equal(result.status, 503);
  assert.deepEqual(result.handled, [], "the handler ran despite an unusable rate limiter");
  assert.doesNotMatch(JSON.stringify(result.body), /statement timeout|57014/);
});

test("a deployment running ahead of migration 0004 still serves the clinic", async () => {
  // The single exception to failing closed. `consume_rate_limit` missing is an
  // operator problem; bricking every route over it turns a missing migration
  // into an outage in a room with patients in it.
  for (const code of ["42883", "PGRST202"]) {
    resetSeams();
    rpcReply = { error: { code, message: "function public.consume_rate_limit(text) does not exist" } };

    const result = await call(undefined, { rateLimit: "recall" });

    assert.equal(result.status, 200, code);
    assert.equal(result.handled.length, 1, `${code}: the request was refused`);
    assert.match(result.logs, /0004_audit_and_limits\.sql/, `${code}: the operator was not told`);
  }
});

/* ---- The shape of the whole /api surface ------------------------------- */

interface RouteFile {
  path: string;
  source: string;
}

function routeFiles(directory: string): RouteFile[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(target);
    if (entry.name !== "route.ts") return [];
    return [{ path: relative(ROOT, target), source: readFileSync(target, "utf8") }];
  });
}

const ROUTES = routeFiles(join(ROOT, "src/app/api"));
const HANDLER = "(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)";

/** Every route that answers without a session, and the reason it may. */
const PUBLIC_ROUTES = new Map([
  ["src/app/api/health/route.ts", "liveness probe for Vercel and uptime checks"],
  ["src/app/api/[...unmatched]/route.ts", "a JSON 404; route names are not privileged"],
  ["src/app/api/maintenance/audio-retention/route.ts", "machine endpoint on a shared secret"],
  [
    "src/app/api/auth/test-login/route.ts",
    "allowlisted test identity protected by a separate high-entropy access code",
  ],
]);

test("the /api surface was found", () => {
  // A floor, not a count: every check below passes trivially against an empty
  // list, so a glob that stops matching must not read as a clean run.
  assert.ok(ROUTES.length > 15, `found ${ROUTES.length} route files`);
  for (const path of PUBLIC_ROUTES.keys()) {
    assert.ok(
      ROUTES.some((route) => route.path === path),
      `${path} is listed as public but no longer exists — drop it from PUBLIC_ROUTES`,
    );
  }
});

test("every route resolves a doctor before it does anything", async () => {
  // The rule `withDoctor` exists to enforce, checked where it can actually be
  // broken: by a new route file that never calls it. "Every route remembered to
  // authenticate" is not a security model, and this app holds patient records.
  const unguarded = ROUTES.filter((route) => !PUBLIC_ROUTES.has(route.path)).flatMap((route) => {
    const wrapped = [...route.source.matchAll(new RegExp(`^export const ${HANDLER}\\s*=\\s*(\\w+)`, "gm"))];
    const bare = [...route.source.matchAll(new RegExp(`^export (?:async )?function ${HANDLER}\\b`, "gm"))];

    return [
      ...wrapped.filter((match) => match[1] !== "withDoctor").map((match) => `${route.path}: ${match[0]}`),
      ...bare.map((match) => `${route.path}: ${match[0]}`),
      ...(wrapped.length + bare.length === 0 ? [`${route.path}: exports no handler`] : []),
    ];
  });

  assert.deepEqual(
    unguarded,
    [],
    "a route handler is not wrapped in withDoctor. If it is deliberately public, " +
      "add it to PUBLIC_ROUTES with the reason.",
  );
});

test("nothing outside http.ts spells PostgREST's no-rows code by hand", () => {
  // A literal "PGRST116" in a route is unsearchable and unexplained; the named
  // constant carries the reason the comparison exists.
  const hardcoded = ROUTES.filter((route) => route.source.includes("PGRST116")).map(
    (route) => route.path,
  );

  assert.deepEqual(hardcoded, [], "import PGRST_NO_ROWS from @/lib/api/http instead");
});

/**
 * Sites that answer a query error with 404, keyed on the condition rather than
 * a line number so that editing the file above them does not move the entry.
 *
 * One known case, and it is a defect rather than a decision: `.single()`
 * reports "no such row" and "the database did not answer" through the same
 * `error`, so an outage tells a doctor the transcript of the consultation they
 * just dictated does not exist. The fix is the comparison every other 404 in
 * this app already makes — `error.code !== PGRST_NO_ROWS` is a 500, and this
 * test measures that they all do. The list must only ever get shorter.
 */
const CONFLATES_MISS_WITH_FAILURE = new Set([
  "src/app/api/encounters/extract/route.ts :: transcriptError || !transcript",
]);

/** The `if (...)` condition on a line, with nesting respected. */
function conditionOn(line: string): string | null {
  const start = line.indexOf("if (");
  if (start < 0) return null;

  let depth = 0;
  for (let index = start + 3; index < line.length; index++) {
    if (line[index] === "(") depth++;
    else if (line[index] === ")" && --depth === 0) return line.slice(start + 4, index);
  }
  return null;
}

test("a database that is down is never reported to a doctor as 'not found'", () => {
  const conflated = ROUTES.flatMap((route) =>
    route.source.split(/\r?\n/).flatMap((line, index) => {
      if (!/new ApiError\(/.test(line) || !/\b404\b/.test(line)) return [];

      const condition = conditionOn(line);
      if (condition === null) {
        return [`${route.path}:${index + 1}: a 404 with no condition this test can read`];
      }

      // An error object may only be consulted through its `.code`. Testing the
      // object itself sweeps a timeout, a dropped connection and an RLS refusal
      // in with the miss.
      const unexamined = [...condition.matchAll(/\b([A-Za-z_$][\w$]*)\b(?!\s*\.\s*code)/g)]
        .map((match) => match[1])
        .filter((name) => /error/i.test(name));

      return unexamined.length === 0 ||
        CONFLATES_MISS_WITH_FAILURE.has(`${route.path} :: ${condition}`)
        ? []
        : [`${route.path}:${index + 1}: 404 on \`${condition}\``];
    }),
  );

  assert.deepEqual(
    conflated,
    [],
    "compare the error's `.code` against PGRST_NO_ROWS and answer a real failure with 500",
  );
});
