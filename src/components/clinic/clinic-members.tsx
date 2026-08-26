"use client";

import { useCallback, useEffect, useState } from "react";

import {
  BadgeCheckIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  UsersRoundIcon,
} from "@/components/icons";
import { formatVisitDay } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  full_name: string;
  role: "owner" | "doctor" | "staff";
  membership_status: "pending" | "active";
  requested_at: string;
  approved_at: string | null;
  speciality: string | null;
}

/**
 * Who shares this register, and the one control that lets someone new in.
 *
 * Approving is the single most consequential action in the app: it hands a
 * stranger every chart, every prescription and every rupee in the clinic. The
 * copy says that in those terms rather than "grant access", because a doctor
 * tapping quickly between patients should not have to infer what a role name
 * implies.
 */
export function ClinicMembers({ isOwner }: { isOwner: boolean }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/clinic/members");
      const payload = await readBody(response, "Could not load your clinic members.");
      setMembers((payload as { members: Member[] }).members);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your clinic members.");
    }
  }, []);

  useEffect(() => {
    // Aborted on unmount so a slow response cannot land on a settings panel the
    // doctor has already navigated away from.
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/clinic/members", { signal: controller.signal });
        const payload = await readBody(response, "Could not load your clinic members.");
        if (!controller.signal.aborted) {
          setMembers((payload as { members: Member[] }).members);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Could not load your clinic members.",
        );
      }
    })();
    return () => controller.abort();
  }, []);

  async function act(id: string, action: "approve" | "decline") {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/clinic/members/${encodeURIComponent(id)}`, {
        method: action === "approve" ? "POST" : "DELETE",
      });
      await readBody(response, "That did not work. Try again.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = members?.filter((m) => m.membership_status === "pending") ?? [];
  const active = members?.filter((m) => m.membership_status === "active") ?? [];

  return (
    <section className="slip rounded-2xl p-5 sm:p-6" aria-busy={members === null}>
      <header className="flex items-center gap-3">
        <span className="bg-secondary grid size-9 shrink-0 place-items-center rounded-lg" aria-hidden>
          <UsersRoundIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Clinic members</h2>
          <p className="text-muted-foreground text-xs">
            Everyone here shares one register.
          </p>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 mt-4 flex gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed"
        >
          <CircleAlertIcon className="text-destructive mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      {members === null && !error && (
        <p className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
          <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
          Loading members…
        </p>
      )}

      {pending.length > 0 && (
        <div className="mt-5">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.14em]">
            Waiting to join ({pending.length})
          </h3>

          {/* Stated before the buttons, not after: this is the moment the
              decision is made, and "approve" on its own does not convey that it
              is retroactive and total. */}
          <p className="well mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed">
            Approving someone gives them every patient record in this clinic, including
            visits recorded before they asked to join. Only approve people you know work
            here.
          </p>

          <ul className="mt-3 space-y-2">
            {pending.map((member) => (
              <li key={member.id} className="well rounded-xl px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{member.full_name}</p>
                    <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                      <CalendarClockIcon className="size-3 shrink-0" aria-hidden />
                      Asked {formatVisitDay(member.requested_at) ?? "recently"}
                    </p>
                  </div>
                </div>

                {isOwner ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === member.id}
                      onClick={() => void act(member.id, "approve")}
                      className="pressable bg-primary text-primary-foreground h-11 flex-1 rounded-lg text-sm font-medium disabled:opacity-60"
                    >
                      {busyId === member.id ? "Working…" : `Approve ${firstName(member.full_name)}`}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === member.id}
                      onClick={() => void act(member.id, "decline")}
                      className="pressable border-border h-11 rounded-lg border px-4 text-sm font-medium disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Only the clinic owner can approve this.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {active.length > 0 && (
        <div className="mt-5">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.14em]">
            Active ({active.length})
          </h3>
          <ul className="mt-2 space-y-1.5">
            {active.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{member.full_name}</span>
                  {member.speciality && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {member.speciality}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    member.role === "owner"
                      ? "bg-primary-soft text-primary"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {member.role === "owner" ? (
                    <span className="flex items-center gap-1">
                      <BadgeCheckIcon className="size-3" aria-hidden />
                      Owner
                    </span>
                  ) : (
                    member.role
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {members !== null && pending.length === 0 && active.length <= 1 && !error && (
        <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
          You are the only person here. Anyone who signs up with this clinic&rsquo;s exact name
          will appear above for you to approve.
        </p>
      )}
    </section>
  );
}

/** "Approve Aditi" reads as a decision about a person; "Approve" reads as a form control. */
function firstName(full: string): string {
  const cleaned = full.replace(/^(dr\.?|prof\.?)\s+/i, "").trim();
  return cleaned.split(/\s+/)[0] || cleaned;
}

/** Parse only once the response is known to be JSON; an HTML 502 must not surface as a SyntaxError. */
async function readBody(response: Response, fallback: string): Promise<unknown> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = (payload as { error?: unknown } | null)?.error;
    throw new Error(typeof error === "string" ? error : fallback);
  }
  return payload;
}
