import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { summariseFinance } from "../../src/lib/practice/finance.ts";

test("finance overview counts only activity attached to financially valid invoices", () => {
  // The route excludes draft and void invoices before this reducer receives
  // data. Their payment/refund rows must therefore be absent rather than
  // changing the cash or outstanding totals.
  const overview = summariseFinance([
    {
      status: "issued",
      invoice_items: [{ quantity: 1, unit_price_paise: 10_000, discount_paise: 500, tax_paise: 500 }],
      payments: [{ amount_paise: 4_000, refunds: [{ amount_paise: 1_000 }] }],
    },
    {
      status: "paid",
      invoice_items: [{ quantity: 2, unit_price_paise: 2_500, discount_paise: 0, tax_paise: 0 }],
      payments: [{ amount_paise: 5_000 }],
    },
  ]);

  assert.deepEqual(overview, {
    invoiced_paise: 15_000,
    collected_paise: 9_000,
    refunded_paise: 1_000,
    outstanding_paise: 7_000,
    open_invoices: 1,
  });
});

test("finance overview scopes payments through non-draft invoices", () => {
  const source = readFileSync("src/app/api/finance/overview/route.ts", "utf8");
  assert.match(source, /\.not\("status", "in", "\(draft,void\)"\)/);
  assert.match(source, /payments!payments_invoice_id_fkey/);
  assert.match(source, /refunds!refunds_payment_id_fkey/);
});
