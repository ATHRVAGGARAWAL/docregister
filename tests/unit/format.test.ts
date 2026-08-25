import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatCompactINR,
  formatCount,
  formatDayLong,
  formatDayShort,
  formatINR,
  formatClock,
} from "../../src/lib/format.ts";

/**
 * These are pure, they are on the hot path of every chart tick, and one of them
 * used to throw a RangeError from inside a Recharts `tickFormatter` — which
 * does not blank a tick, it takes down the chart.
 */

test("Indian digit grouping is 2-2-3, not thousands", () => {
  assert.equal(formatINR(125000), "₹1,25,000");
});

test("NaN never reaches the screen", () => {
  assert.equal(formatINR(NaN), "₹0");
  assert.equal(formatCount(NaN), "0");
  assert.equal(formatCompactINR(NaN), "₹0");
  assert.equal(formatINR(null), "₹0");
});

test("an invalid date degrades instead of throwing", () => {
  // Each of these used to throw a RangeError out of Intl.DateTimeFormat.
  assert.doesNotThrow(() => formatDayShort("2026-13-45"));
  assert.doesNotThrow(() => formatDayLong("nonsense"));
  assert.doesNotThrow(() => formatClock("not-a-date"));
  assert.equal(formatDayShort("2026-13-45"), "—");
});

test("a real date still formats in IST", () => {
  assert.equal(formatDayShort("2026-08-24"), "24 Aug");
  // 14:05 UTC is 19:35 in Asia/Kolkata — the bucket boundary that makes an
  // evening consultation land on the right day.
  assert.equal(formatClock("2026-08-24T14:05:00Z"), "7:35 pm");
});

test("compact currency handles the signs and magnitudes it is given", () => {
  assert.equal(formatCompactINR(4500), "₹5k");
  assert.equal(formatCompactINR(-4500), "-₹5k");
  assert.equal(formatCompactINR(1234.56), "₹1k");
});
