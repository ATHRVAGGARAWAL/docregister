"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BanknoteIcon, CircleAlertIcon, LandmarkIcon, LoaderCircleIcon, ReceiptTextIcon } from "@/components/icons";
import { MetricCard, PracticePage, PracticePageHeader, SectionHeading } from "@/components/practice/practice-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import type { FinanceOverview } from "@/lib/practice/types";
import type { AccountEntry, AccountsPayload } from "@/lib/types";

const emptyOverview: FinanceOverview = { invoiced_paise: 0, collected_paise: 0, refunded_paise: 0, outstanding_paise: 0, draft_estimates: 0, open_invoices: 0 };

export function FinanceWorkspace() {
  const [overview, setOverview] = useState<FinanceOverview>(emptyOverview);
  const [ledger, setLedger] = useState<AccountsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingReady, setBillingReady] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      fetch("/api/finance/overview").then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<FinanceOverview>; }),
      fetch("/api/accounts?days=30&limit=10").then(async (response) => { const body = await response.json().catch(() => null) as AccountsPayload & { error?: string }; if (!response.ok) throw new Error(body?.error ?? "Could not load the ledger."); return body; }),
    ]).then(([billing, accounts]) => {
      if (billing.status === "fulfilled") setOverview(billing.value); else setBillingReady(false);
      if (accounts.status === "fulfilled") setLedger(accounts.value); else setError(accounts.reason instanceof Error ? accounts.reason.message : "Could not load the ledger.");
    }).finally(() => setLoading(false));
  }, []);

  return (
    <PracticePage>
      <PracticePageHeader eyebrow="Practice finance" title="Finance" description="Keep clinical plans, patient invoices and the cash ledger distinct—then reconcile them in one place." actions={<Button asChild variant="outline"><Link href="/?view=accounts"><LandmarkIcon aria-hidden />Open legacy ledger</Link></Button>} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Invoiced" value={formatINR(overview.invoiced_paise / 100)} detail={`${overview.open_invoices} open invoice${overview.open_invoices === 1 ? "" : "s"}`} />
        <MetricCard label="Collected" value={formatINR(overview.collected_paise / 100)} detail="Payments recorded against invoices" tone="money" />
        <MetricCard label="Outstanding" value={formatINR(overview.outstanding_paise / 100)} detail="After payments and refunds" tone={overview.outstanding_paise ? "warning" : "default"} />
        <MetricCard label="Draft estimates" value={String(overview.draft_estimates)} detail="Draft or presented" />
      </section>
      {!billingReady && <Alert><CircleAlertIcon aria-hidden /><AlertTitle>Billing setup pending</AlertTitle><AlertDescription>The existing income and expense ledger is still available. Apply migration 0034 to enable estimates, invoices, payments and refunds.</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertTitle>Ledger unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid items-start gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5"><SectionHeading title="Recent money movement" description="The established cash ledger remains the accounting source of truth during migration." /><div className="mt-4 space-y-2">{loading && <p className="py-10 text-center text-sm text-muted-foreground"><LoaderCircleIcon className="mr-2 inline size-4 animate-spin" aria-hidden />Loading finance…</p>}{ledger?.entries.map((entry) => <LedgerRow key={entry.id} entry={entry} />)}{!loading && ledger?.entries.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No ledger activity in the last 30 days.</p>}</div></section>
        <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5"><SectionHeading title="30-day ledger" description="Collected and expense totals from existing verified entries." /><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><FinanceLine icon={BanknoteIcon} label="Received" value={formatINR((ledger?.summary.received_paise ?? 0) / 100)} tone="money" /><FinanceLine icon={ReceiptTextIcon} label="Pending" value={formatINR((ledger?.summary.pending_paise ?? 0) / 100)} tone="warning" /><FinanceLine icon={LandmarkIcon} label="Expenses" value={formatINR((ledger?.summary.expenses_paise ?? 0) / 100)} /><FinanceLine icon={BanknoteIcon} label="Net" value={formatINR((ledger?.summary.net_paise ?? 0) / 100)} tone="money" /></div></section>
      </div>
    </PracticePage>
  );
}

function LedgerRow({ entry }: { entry: AccountEntry }) { return <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{entry.counterparty || entry.category}</p><p className="mt-1 truncate text-xs text-muted-foreground">{entry.category} · {date(entry.occurred_at)}</p></div><div className="text-right"><p className={`tnum text-sm font-semibold ${entry.kind === "income" ? "text-money" : "text-foreground"}`}>{entry.kind === "expense" ? "−" : "+"}{formatINR(entry.amount_paise / 100)}</p><Badge variant="outline" className="mt-1 capitalize">{entry.status}</Badge></div></div>; }
function FinanceLine({ icon: Icon, label, value, tone }: { icon: typeof BanknoteIcon; label: string; value: string; tone?: "money" | "warning" }) { return <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"><span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary"><Icon className="size-4" aria-hidden /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className={`tnum mt-0.5 text-sm font-semibold ${tone === "money" ? "text-money" : tone === "warning" ? "text-warning" : ""}`}>{value}</p></div></div>; }
function date(value: string): string { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value)); }

