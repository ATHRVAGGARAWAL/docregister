"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CalendarClockIcon, CircleCheckIcon, MailIcon } from "@/components/icons";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * What a doctor sees between asking to join a clinic and being let in.
 *
 * Without this screen a pending member reaches the register and finds it empty:
 * no patients, no visits, no money — because `auth_clinic_id()` returns NULL
 * until an owner admits them. An empty clinical register is indistinguishable
 * from a broken one, and a doctor whose first impression is "my colleague's
 * data is missing" will not trust the app with a patient.
 */
export function PendingApproval({
  clinicName,
  doctorName,
  email,
}: {
  clinicName: string | null;
  doctorName: string;
  email: string | null;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-12">
      <div className="slip rounded-2xl p-6 sm:p-8">
        <span
          className="bg-money-soft text-money grid size-11 place-items-center rounded-xl"
          aria-hidden
        >
          <CalendarClockIcon className="size-5" />
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          Waiting for approval
        </h1>

        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {clinicName ? (
            <>
              You asked to join <span className="text-foreground font-medium">{clinicName}</span>.
              Someone who already works there needs to let you in before you can see any
              patient records.
            </>
          ) : (
            <>
              Your request to join a clinic is waiting for someone who already works there to
              approve it.
            </>
          )}
        </p>

        {/* The two things a doctor needs to act on: who to chase, and whether
            they typed the right clinic name in the first place. A wrong name is
            the most likely reason this never resolves, and nothing else on this
            screen would reveal it. */}
        <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Signed in as</dt>
            <dd className="text-right font-medium">{doctorName}</dd>
          </div>
          {email && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-right font-medium break-all">{email}</dd>
            </div>
          )}
          {clinicName && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Clinic</dt>
              <dd className="text-right font-medium">{clinicName}</dd>
            </div>
          )}
        </dl>

        <div className="well mt-6 rounded-xl px-4 py-3.5">
          <p className="flex gap-2.5 text-xs leading-relaxed">
            <MailIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="text-muted-foreground">
              Ask a colleague at {clinicName ?? "the clinic"} to open{" "}
              <span className="text-foreground font-medium">Settings → Clinic members</span> and
              approve you. If that clinic name looks wrong, sign out and sign up again with the
              exact name they use.
            </span>
          </p>
        </div>

        <p className="text-muted-foreground mt-5 flex items-center gap-2 text-xs">
          <CircleCheckIcon className="text-money size-3.5 shrink-0" aria-hidden />
          Nothing from that clinic has been shared with you yet.
        </p>

        <SignOutButton />
      </div>
    </main>
  );
}

function SignOutButton() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  return (
    <button
      type="button"
      disabled={leaving}
      onClick={async () => {
        setLeaving(true);
        // Navigate regardless of the outcome, matching the dashboard: the local
        // session is cleared either way, and leaving a doctor on this screen
        // with nothing said is indistinguishable from a dead button.
        try {
          await getSupabaseBrowserClient().auth.signOut();
        } catch (error) {
          console.error("[pending] sign out failed", error);
        }
        router.replace("/login");
        router.refresh();
      }}
      className="pressable mt-6 h-11 w-full rounded-xl border border-border text-sm font-medium disabled:opacity-60"
    >
      {leaving ? "Signing out…" : "Sign out"}
    </button>
  );
}
