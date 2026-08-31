import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import { practiceTable } from "@/lib/supabase/practice";

export const GET = withDoctor(async ({ doctor, supabase }) => {
  const [labs, stock] = await Promise.all([
    practiceTable(supabase, "lab_cases")
      .select("id, patient_id, lab_name, work_type, tooth_notation, shade, status, sent_at, due_at, patient:patients!lab_cases_patient_id_fkey(id, full_name)")
      .eq("clinic_id", doctor.clinic_id)
      .not("status", "in", "(fitted,cancelled)")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(50),
    practiceTable(supabase, "inventory_stock")
      .select("id, sku, name, category, unit, reorder_level, on_hand, nearest_expiry")
      .eq("clinic_id", doctor.clinic_id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);
  if (labs.error || stock.error) {
    console.error("[operations] list failed", labs.error ?? stock.error);
    throw new ApiError("Could not load practice operations.", 500);
  }
  return NextResponse.json({ labCases: labs.data ?? [], stock: stock.data ?? [] }, { headers: { "Cache-Control": "no-store" } });
});

