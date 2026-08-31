import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  appointmentWriteFailure,
  canTransitionAppointmentStatus,
  isAppointmentStatus,
} from "../../src/lib/practice/appointments.ts";

test("appointment status flow supports the chair workflow and limited corrections", () => {
  assert.equal(canTransitionAppointmentStatus("scheduled", "confirmed"), true);
  assert.equal(canTransitionAppointmentStatus("confirmed", "checked_in"), true);
  assert.equal(canTransitionAppointmentStatus("checked_in", "in_chair"), true);
  assert.equal(canTransitionAppointmentStatus("in_chair", "completed"), true);
  assert.equal(canTransitionAppointmentStatus("checked_in", "confirmed"), true);
  assert.equal(canTransitionAppointmentStatus("in_chair", "checked_in"), true);
});

test("closed appointments cannot be reopened or cancelled", () => {
  for (const terminal of ["completed", "cancelled", "no_show"] as const) {
    assert.equal(canTransitionAppointmentStatus(terminal, "scheduled"), false);
    assert.equal(canTransitionAppointmentStatus(terminal, "cancelled"), terminal === "cancelled");
  }
  assert.equal(canTransitionAppointmentStatus("scheduled", "completed"), false);
  assert.equal(isAppointmentStatus("in_chair"), true);
  assert.equal(isAppointmentStatus("waiting"), false);
});

test("booking conflicts become specific, non-database API messages", () => {
  assert.deepEqual(
    appointmentWriteFailure({
      code: "23P01",
      message: 'conflicting key value violates exclusion constraint "appointments_clinician_no_overlap"',
    }),
    { message: "That clinician is already booked during this time.", status: 409 },
  );
  assert.deepEqual(
    appointmentWriteFailure({
      code: "23P01",
      message: 'conflicting key value violates exclusion constraint "appointments_operatory_no_overlap"',
    }),
    { message: "That operatory is already booked during this time.", status: 409 },
  );
});

test("the database migration owns concurrent overlap and completed-delete protection", () => {
  const sql = readFileSync("supabase/migrations/0036_appointment_integrity.sql", "utf8");
  assert.match(sql, /appointments_clinician_no_overlap[\s\S]*exclude using gist/i);
  assert.match(sql, /appointments_operatory_no_overlap[\s\S]*exclude using gist/i);
  assert.match(sql, /tstzrange\(starts_at, ends_at, '\[\)'\) with &&/i);
  assert.match(sql, /if old\.status = 'completed'/i);
  assert.match(sql, /revoke delete on appointments from authenticated/i);
});
