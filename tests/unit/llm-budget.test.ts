import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

/**
 * The retry policy in `src/lib/llm/index.ts`, run rather than grepped.
 *
 * It cannot be imported. `@/lib/env` is an alias the unit runner does not
 * resolve, and `./types` declares `LlmError`'s fields as constructor parameter
 * properties, which strip-only type stripping refuses outright — so no amount
 * of aliasing would make `node --test` load this module. What is available is
 * the source text, so the loop's own body is read out of the file and run in a
 * `node:vm` context whose globals are the stubs below: a provider that fails to
 * order, and a clock that only moves when that provider says it did. Every
 * number the loop decides with is parsed out of the same file, so tuning a
 * budget re-aims these tests instead of slipping past them.
 *
 * The alternative — keeping a copy of the policy in the test — passes forever
 * while production drifts, which for a path that only runs when something is
 * already going wrong is the same as no test at all.
 *
 * If a later edit puts a type annotation inside `generateStructured`'s body the
 * vm compile throws and every test in this file fails at once. That is the
 * intended failure mode: loud, and pointing at the right file.
 */

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/**
 * Several of the comments in these files quote the literals being searched for
 * ("`fast` turns a spoken question into…"), and one of them is a worked example
 * of the arithmetic. Parsing prose as code finds the wrong numbers.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const LLM_INDEX = stripComments(read("src/lib/llm/index.ts"));
const LLM_TYPES = stripComments(read("src/lib/llm/types.ts"));

function numberFrom(source: string, name: string): number {
  const match = new RegExp(`\\b${name}\\s*=\\s*([0-9_]+)`).exec(source);
  assert.ok(match, `${name} is no longer a numeric constant in src/lib/llm/index.ts`);
  return Number(match![1].replace(/_/g, ""));
}

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

const MAX_ATTEMPTS = numberFrom(LLM_INDEX, "MAX_ATTEMPTS");
const BACKOFF_MS = numberFrom(LLM_INDEX, "BACKOFF_MS");
const MIN_ATTEMPT_MS = numberFrom(LLM_INDEX, "MIN_ATTEMPT_MS");

const NEVER_RETRY = (() => {
  const match = /NEVER_RETRY[^=]*=\s*new Set\(\[([^\]]*)\]\)/.exec(LLM_INDEX);
  assert.ok(match, "NEVER_RETRY is no longer a literal Set in src/lib/llm/index.ts");
  return new Set([...match![1].matchAll(/"([a-z_]+)"/g)].map((code) => code[1]));
})();

interface TierBudget {
  attempt: number;
  total: number;
}

const TIERS = (() => {
  const match = /export type Tier\s*=([^;]+);/.exec(LLM_TYPES);
  assert.ok(match, "the Tier union is no longer declared in src/lib/llm/types.ts");
  return [...match![1].matchAll(/"([a-z_]+)"/g)].map((tier) => tier[1]);
})();

const BUDGET_MS: Record<string, TierBudget> = Object.fromEntries(
  TIERS.map((tier) => {
    const match = new RegExp(
      `\\b${tier}:\\s*\\{\\s*attempt:\\s*([0-9_]+),\\s*total:\\s*([0-9_]+)`,
    ).exec(LLM_INDEX);
    assert.ok(match, `BUDGET_MS has no entry for the "${tier}" tier`);
    return [
      tier,
      {
        attempt: Number(match![1].replace(/_/g, "")),
        total: Number(match![2].replace(/_/g, "")),
      },
    ];
  }),
);

const GENERATE_BODY = bodyOf(LLM_INDEX, /export async function generateStructured\b/);

/**
 * Stands in for `LlmError`, which this runner cannot import (see the top of the
 * file). The loop only ever reads `code` and `retryable` off it and checks its
 * own `instanceof`, so injecting this class as that identifier exercises the
 * real branch — and the shape is pinned against the real class below.
 */
class FakeLlmError extends Error {
  code: string;
  retryable: boolean;

  constructor(code: string, retryable: boolean) {
    super(`test double: ${code}`);
    this.name = "LlmError";
    this.code = code;
    this.retryable = retryable;
  }
}

interface Outcome {
  /** Virtual milliseconds this attempt burns. `"budget"` means all of them. */
  spends: number | "budget";
  /** Thrown when present; the attempt otherwise succeeds. */
  throws?: unknown;
}

interface Run {
  /** The `timeoutMs` handed to each attempt, in order. */
  deadlines: number[];
  /** Each backoff actually waited out. */
  backoffs: number[];
  warnings: string[];
  /** Virtual milliseconds from entry to settle. */
  elapsed: number;
  value?: unknown;
  failure?: unknown;
}

/**
 * The last outcome repeats, so `[{ … }]` means "fails this way every time".
 */
async function callWithBudget(tier: string, outcomes: Outcome[]): Promise<Run> {
  const clock = { now: 1_700_000_000_000 };
  const start = clock.now;
  const deadlines: number[] = [];
  const backoffs: number[] = [];
  const warnings: string[] = [];
  let index = 0;

  const provider = {
    name: "stub",
    generate(request: unknown, options: { timeoutMs: number }) {
      deadlines.push(options.timeoutMs);
      const outcome = outcomes[Math.min(index, outcomes.length - 1)];
      index++;
      clock.now += outcome.spends === "budget" ? options.timeoutMs : outcome.spends;
      if (outcome.throws) return Promise.reject(outcome.throws);
      return Promise.resolve({ value: { ok: true }, model: "stub" });
    },
  };

  const generateStructured = runInNewContext(
    `(async function (request) {\n${GENERATE_BODY}\n})`,
    {
      getLlmProvider: () => provider,
      BUDGET_MS,
      MAX_ATTEMPTS,
      BACKOFF_MS,
      MIN_ATTEMPT_MS,
      NEVER_RETRY,
      LlmErrorClass: FakeLlmError,
      Date: { now: () => clock.now },
      // Waiting is virtual: the clock jumps by exactly what the loop asked to
      // sleep for, so a budget assertion measures the policy and not the
      // machine the suite happens to run on.
      setTimeout: (resume: () => void, ms: number) => {
        backoffs.push(ms);
        clock.now += ms;
        queueMicrotask(resume);
      },
      console: { warn: (line: string) => warnings.push(line) },
    },
  ) as (request: { tier: string; schemaName: string }) => Promise<unknown>;

  const run: Run = { deadlines, backoffs, warnings, elapsed: 0 };
  try {
    run.value = await generateStructured({ tier, schemaName: "TestSchema" });
  } catch (failure) {
    run.failure = failure;
  }
  run.elapsed = clock.now - start;
  return run;
}

function retryable(code: string): FakeLlmError {
  return new FakeLlmError(code, true);
}

test("the test double matches the error class the loop actually branches on", () => {
  assert.match(
    LLM_TYPES,
    /class LlmError extends Error[\s\S]*readonly code:[\s\S]*readonly retryable/,
    "FakeLlmError stands in for LlmError; if LlmError's fields change it stops standing in for anything",
  );
});

test("every tier has a budget it can spend inside", () => {
  for (const tier of TIERS) {
    const budget = BUDGET_MS[tier];
    assert.ok(
      budget.attempt <= budget.total,
      `${tier}: one attempt may not be allowed longer than the whole call`,
    );
    assert.ok(
      budget.attempt >= MIN_ATTEMPT_MS,
      `${tier}: a tier whose attempts are shorter than MIN_ATTEMPT_MS can never start one`,
    );
  }
});

test("a call that succeeds is handed its tier's attempt budget and returns unchanged", async () => {
  for (const tier of TIERS) {
    const budget = BUDGET_MS[tier];
    const run = await callWithBudget(tier, [{ spends: 40 }]);

    assert.deepEqual(run.deadlines, [Math.min(budget.attempt, budget.total)]);
    assert.deepEqual(run.backoffs, [], `${tier}: nothing failed, nothing should have waited`);
    assert.deepEqual(run.value, { value: { ok: true }, model: "stub" });
  }
});

test("a retry is handed what the budget has left, not a fresh full slice", async () => {
  let everShrank = false;

  for (const tier of TIERS) {
    const budget = BUDGET_MS[tier];
    const run = await callWithBudget(tier, [
      { spends: "budget", throws: retryable("timeout") },
      { spends: 40 },
    ]);

    const left = budget.total - budget.attempt - BACKOFF_MS;
    assert.deepEqual(
      run.deadlines,
      [budget.attempt, Math.min(budget.attempt, left)],
      `${tier}: the second attempt must be bounded by what is left of the total`,
    );
    assert.deepEqual(run.backoffs, [BACKOFF_MS]);
    everShrank ||= run.deadlines[1] < run.deadlines[0];
  }

  assert.ok(
    everShrank,
    "no tier is configured such that a retry is ever cut short — the `Math.min` " +
      "against the deadline is then dead code, and the budget it protects is unproven",
  );
});

test("the total budget is never exceeded, whatever the provider does with its attempts", async () => {
  for (const tier of TIERS) {
    const budget = BUDGET_MS[tier];
    const run = await callWithBudget(tier, [
      { spends: "budget", throws: retryable("rate_limited") },
    ]);

    assert.ok(
      run.elapsed <= budget.total,
      `${tier}: spent ${run.elapsed}ms against a ${budget.total}ms budget`,
    );
    assert.ok(
      run.deadlines.every((deadline) => deadline >= MIN_ATTEMPT_MS),
      `${tier}: an attempt was started with less time than MIN_ATTEMPT_MS`,
    );
    assert.ok(
      run.deadlines.length < MAX_ATTEMPTS,
      `${tier}: the attempt cap stopped this run, so the budget guard is untested by it`,
    );
    assert.ok(run.failure instanceof FakeLlmError, `${tier}: the last error must reach the caller`);
  }
});

test("a retry that could not finish inside the budget is not started at all", async () => {
  for (const tier of TIERS) {
    const budget = BUDGET_MS[tier];

    // A provider that overruns the deadline it was given: the vendor timeout is
    // the vendor's own promise, and a stalled socket or a slow body can miss it.
    // One millisecond past this point a retry could no longer run for
    // MIN_ATTEMPT_MS, which is the whole condition under test.
    const tooLate = budget.total - BACKOFF_MS - MIN_ATTEMPT_MS + 1;
    const late = await callWithBudget(tier, [{ spends: tooLate, throws: retryable("timeout") }]);

    assert.equal(late.deadlines.length, 1, `${tier}: a second attempt was started with no room`);
    assert.deepEqual(
      late.backoffs,
      [],
      `${tier}: the doctor waited out a backoff for an attempt that was never going to run`,
    );
    assert.deepEqual(late.warnings, [], `${tier}: a retry was logged that did not happen`);

    // And one millisecond the other side of it, to pin the boundary rather than
    // the direction: the retry runs, with exactly the minimum it is worth.
    const justInTime = await callWithBudget(tier, [
      { spends: tooLate - 1, throws: retryable("timeout") },
      { spends: 10 },
    ]);

    assert.deepEqual(justInTime.backoffs, [BACKOFF_MS], `${tier}: the retry should have run`);
    assert.deepEqual(justInTime.deadlines, [budget.attempt, MIN_ATTEMPT_MS]);
  }
});

test("a non-retryable failure is not retried", async () => {
  for (const code of ["invalid_output", "provider_error", "truncated"]) {
    const run = await callWithBudget(TIERS[0], [
      { spends: 10, throws: new FakeLlmError(code, false) },
    ]);

    assert.equal(run.deadlines.length, 1, `${code}: retried despite retryable=false`);
    assert.deepEqual(run.backoffs, []);
    assert.equal((run.failure as FakeLlmError).code, code);
  }
});

test("a refusal and a rejected key are never retried, even flagged retryable", async () => {
  // The belt described in NEVER_RETRY: an adapter that gets `retryable` wrong
  // should cost latency, not send a content filter the same clinical text three
  // times, or a rejected key into a vendor's abuse controls.
  assert.ok(NEVER_RETRY.has("blocked"), "a content filter refuses the same transcript every time");
  assert.ok(NEVER_RETRY.has("auth"), "a rejected key is a deployment problem, not a blip");

  for (const code of NEVER_RETRY) {
    const run = await callWithBudget(TIERS[0], [{ spends: 10, throws: retryable(code) }]);

    assert.equal(run.deadlines.length, 1, `${code}: retried despite being in NEVER_RETRY`);
    assert.deepEqual(run.backoffs, []);
  }
});

test("the backoff doubles, stops at the attempt cap, and costs less than one attempt", async () => {
  const tier = TIERS[0];
  // Instant failures: the budget can never stop this loop, so what does is the
  // attempt cap — the case that cap exists for.
  const run = await callWithBudget(tier, [{ spends: 0, throws: retryable("rate_limited") }]);

  const expected = Array.from({ length: MAX_ATTEMPTS - 1 }, (_, index) => BACKOFF_MS * 2 ** index);
  assert.deepEqual(run.deadlines.length, MAX_ATTEMPTS);
  assert.deepEqual(run.backoffs, expected);
  assert.equal(run.warnings.length, MAX_ATTEMPTS - 1, "each retry should leave an operator a line");
  assert.match(run.warnings[0], /rate_limited/);

  const waited = run.backoffs.reduce((sum, ms) => sum + ms, 0);
  const shortestAttempt = Math.min(...TIERS.map((name) => BUDGET_MS[name].attempt));
  assert.ok(
    waited < shortestAttempt,
    `retries wait ${waited}ms in total, more than the ${shortestAttempt}ms a whole attempt gets`,
  );
});

test("anything that is not an LlmError leaves the loop untouched", async () => {
  // A bug in an adapter, not a provider failure. Retrying it would spend the
  // budget reproducing it, and swallowing it would hide it.
  const bug = new TypeError("cannot read properties of undefined");

  // And an error from a neighbouring layer: `SttError` carries the same two
  // field names and reaches this app through the same routes. Retry policy is
  // per-layer — an STT timeout marked retryable means "fail over to the other
  // engine", not "call the model again" — so the class, not the shape, is what
  // this loop is allowed to act on.
  const lookAlike = Object.assign(new Error("a retryable failure from elsewhere"), {
    code: "rate_limited",
    retryable: true,
  });

  for (const thrown of [bug, lookAlike]) {
    const run = await callWithBudget(TIERS[0], [{ spends: 10, throws: thrown }]);

    assert.equal(run.failure, thrown);
    assert.equal(run.deadlines.length, 1);
    assert.deepEqual(run.backoffs, []);
  }
});

function routeFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return routeFiles(join(directory, entry.name));
    return entry.name === "route.ts" ? [join(directory, entry.name)] : [];
  });
}

function maxDurationOf(routePath: string): number {
  const match = /export const maxDuration\s*=\s*(\d+)/.exec(stripComments(read(routePath)));
  assert.ok(match, `${routePath} reaches a model without declaring a maxDuration`);
  return Number(match![1]) * 1000;
}

test("every route that reaches a model can afford one call per tier", async () => {
  // The prompt modules, found rather than listed: a fourth one added next to
  // extract/recall/intent should be held to this too.
  const promptModules = readdirSync(join(ROOT, "src/lib/llm"))
    .filter((name) => name.endsWith(".ts") && name !== "index.ts")
    .filter((name) => read(`src/lib/llm/${name}`).includes("generateStructured("))
    .map((name) => `@/lib/llm/${name.replace(/\.ts$/, "")}`);
  assert.ok(promptModules.length > 0, "no module calls generateStructured — has it been renamed?");

  const routes = routeFiles("src/app/api").filter((routePath) =>
    promptModules.some((module) => read(routePath).includes(module)),
  );
  assert.ok(routes.length > 0, "no route reaches a model");

  // Both routes that classify then extract spend one call from each tier inside
  // a single request; none spends two from the same one. A budget that no
  // longer fits is not a slower answer — the platform kills the function and
  // the doctor loses the consultation to a blank error.
  const worstCase = TIERS.reduce((sum, tier) => sum + BUDGET_MS[tier].total, 0);

  for (const routePath of routes) {
    const ceiling = maxDurationOf(routePath);
    assert.ok(
      worstCase <= ceiling,
      `${routePath}: model budgets total ${worstCase}ms against maxDuration ${ceiling}ms, ` +
        "leaving nothing for the database round trips either side",
    );
  }
});
