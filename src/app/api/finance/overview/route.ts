import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import { summariseFinance, type FinancialInvoice } from "@/lib/practice/finance";
import { practiceTable } from "@/lib/supabase/practice";

export const GET = withDoctor(async ({ doctor, supabase }) => {
  const [invoices, estimates] = await Promise.all([
    practiceTable(supabase, "invoices")
      .select("status, invoice_items!invoice_items_invoice_id_fkey(quantity, unit_price_paise, discount_paise, tax_paise), payments!payments_invoice_id_fkey(amount_paise, refunds!refunds_payment_id_fkey(amount_paise))")
      .eq("clinic_id", doctor.clinic_id)
      // Drafts are not invoices yet, and void invoices no longer have a
      // financial effect. Fetching payments through this scoped invoice set
      // prevents either from changing collected, refunded or outstanding.
      .not("status", "in", "(draft,void)"),
    practiceTable(supabase, "estimates").select("id", { count: "exact", head: true }).eq("clinic_id", doctor.clinic_id).in("status", ["draft", "presented"]),
  ]);
  const failed = [invoices, estimates].find((result) => result.error);
  if (failed?.error) {
    console.error("[finance-overview] query failed", failed.error);
    throw new ApiError("Could not load the finance overview.", 500);
  }

  const overview = summariseFinance((invoices.data ?? []) as FinancialInvoice[]);

  return NextResponse.json({
    ...overview,
    draft_estimates: estimates.count ?? 0,
  }, { headers: { "Cache-Control": "no-store" } });
});
