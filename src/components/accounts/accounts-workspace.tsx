"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  CalendarRangeIcon,
  CheckIcon,
  Clock3Icon,
  LoaderCircleIcon,
  PlusIcon,
  ReceiptTextIcon,
  SearchIcon,
  WalletCardsIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatINR, todayInIndia } from "@/lib/format";
import type {
  AccountEntry,
  AccountEntryKind,
  AccountEntryStatus,
  AccountPaymentMethod,
  AccountsPayload,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
] as const;

const KIND_TABS: ReadonlyArray<{ label: string; value: "all" | AccountEntryKind }> = [
  { label: "All", value: "all" },
  { label: "Income", value: "income" },
  { label: "Expenses", value: "expense" },
];

const STATUS_TABS: ReadonlyArray<{ label: string; value: "all" | AccountEntryStatus }> = [
  { label: "All statuses", value: "all" },
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
];

const PAYMENT_LABELS: Record<AccountPaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
};

const EMPTY: AccountsPayload = {
  entries: [],
  summary: { received_paise: 0, pending_paise: 0, expenses_paise: 0, net_paise: 0 },
  totalCount: 0,
};

/** Dedicated income and expense ledger, adapted from 21st.dev data cards, badge tabs, and dense table blocks. */
export function AccountsWorkspace() {
  const [data, setData] = useState<AccountsPayload>(EMPTY);
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState<"all" | AccountEntryKind>("all");
  const [status, setStatus] = useState<"all" | AccountEntryStatus>("all");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ days: String(days), limit: "200" });
    if (kind !== "all") params.set("kind", kind);
    if (status !== "all") params.set("status", status);
    if (appliedQuery) params.set("q", appliedQuery);
    try {
      const response = await fetch(`/api/accounts?${params}`, { cache: "no-store", signal });
      const payload = (await response.json()) as AccountsPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load accounts.");
      setData(payload);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Could not load accounts.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [appliedQuery, days, kind, status]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  async function markPaid(entry: AccountEntry) {
    setError(null);
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Could not update this entry.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this entry.");
    }
  }

  const badges = useMemo(() => ({
    all: data.totalCount,
    income: data.entries.filter((entry) => entry.kind === "income").length,
    expense: data.entries.filter((entry) => entry.kind === "expense").length,
  }), [data.entries, data.totalCount]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarRangeIcon className="size-3.5" aria-hidden />
            Doctor-scoped ledger
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Income and expenses live here, separate from clinical records.
          </p>
        </div>
        <Button size="lg" onClick={() => setEntryOpen(true)}>
          <PlusIcon aria-hidden /> Add entry
        </Button>
      </section>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t update accounts</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SummaryCards payload={data} loading={loading} />

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-flat">
        <div className="border-b border-border p-4 sm:p-5">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedQuery(query.trim());
            }}
          >
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search category, person, method, or note"
                aria-label="Search accounts"
                className="h-11 pl-10"
              />
            </div>
            <Button type="submit" size="lg" variant="outline">Search</Button>
          </form>

          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 xl:flex-row xl:items-center xl:justify-between">
            <BadgeTabs
              label="Entry type"
              items={KIND_TABS.map((item) => ({ ...item, badge: badges[item.value] }))}
              value={kind}
              onChange={(value) => setKind(value as typeof kind)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <BadgeTabs
                label="Payment status"
                items={STATUS_TABS}
                value={status}
                onChange={(value) => setStatus(value as typeof status)}
              />
              <div className="well inline-flex items-center gap-1 p-1" role="group" aria-label="Accounts date range">
                {RANGES.map((range) => (
                  <button
                    key={range.days}
                    type="button"
                    aria-pressed={days === range.days}
                    onClick={() => setDays(range.days)}
                    className={cn(
                      "h-7 rounded-sm px-2.5 text-[11px] font-medium transition-colors",
                      days === range.days ? "border border-border bg-card text-foreground shadow-flat" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Ledger entries={data.entries} loading={loading} onAdd={() => setEntryOpen(true)} onMarkPaid={markPaid} />
      </section>

      <AccountEntrySheet
        open={entryOpen}
        onOpenChange={setEntryOpen}
        onSaved={async () => {
          setEntryOpen(false);
          await load();
        }}
      />
    </div>
  );
}

function SummaryCards({ payload, loading }: { payload: AccountsPayload; loading: boolean }) {
  const cards = [
    { label: "Received", value: payload.summary.received_paise, hint: "Paid income", icon: ArrowDownLeftIcon, tone: "text-primary bg-primary/10" },
    { label: "Pending", value: payload.summary.pending_paise, hint: "Still to collect", icon: Clock3Icon, tone: "text-money bg-money/10" },
    { label: "Expenses", value: payload.summary.expenses_paise, hint: "Paid expenses", icon: ArrowUpRightIcon, tone: "text-destructive bg-destructive/10" },
    { label: "Net", value: payload.summary.net_paise, hint: "Received minus expenses", icon: WalletCardsIcon, tone: "text-foreground bg-secondary" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="list">
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          role="listitem"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: index * 0.04 }}
        >
          <Card className="h-full gap-3 py-4">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-xs text-muted-foreground">{card.label}</CardTitle>
              <span className={cn("grid size-8 place-items-center rounded-lg", card.tone)}><card.icon className="size-4" aria-hidden /></span>
            </CardHeader>
            <CardContent>
              <p className={cn("tnum text-2xl font-semibold tracking-tight", card.label === "Pending" && "text-money")}>
                {loading ? "—" : formatPaise(card.value)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function BadgeTabs({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: ReadonlyArray<{ label: string; value: string; badge?: number }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="well inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto p-1" role="group" aria-label={label}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            aria-pressed={active}
            className={cn(
              "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-3 text-xs font-medium transition-colors",
              active ? "border border-border bg-card text-foreground shadow-flat" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={item.badge}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0 }}
                  className="tnum rounded-full bg-secondary px-1.5 py-0.5 text-[10px] leading-none text-secondary-foreground"
                >
                  {item.badge}
                </motion.span>
              </AnimatePresence>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Ledger({
  entries,
  loading,
  onAdd,
  onMarkPaid,
}: {
  entries: AccountEntry[];
  loading: boolean;
  onAdd: () => void;
  onMarkPaid: (entry: AccountEntry) => void;
}) {
  if (loading && entries.length === 0) {
    return <div className="grid min-h-64 place-items-center"><p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden />Loading ledger…</p></div>;
  }
  if (entries.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground"><ReceiptTextIcon className="size-5" aria-hidden /></span>
        <h2 className="mt-4 text-sm font-semibold">No account entries found</h2>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Add income or an expense, or adjust the filters to see a different part of the ledger.</p>
        <Button type="button" size="sm" className="mt-4" onClick={onAdd}><PlusIcon aria-hidden />Add first entry</Button>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-secondary/55 text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            <tr><th className="px-5 py-3 font-medium">Date</th><th className="px-3 py-3 font-medium">Entry</th><th className="px-3 py-3 font-medium">Method</th><th className="px-3 py-3 font-medium">Status</th><th className="px-5 py-3 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => (
              <tr key={entry.id} className="transition-colors hover:bg-secondary/30">
                <td className="whitespace-nowrap px-5 py-3.5 text-xs text-muted-foreground">{formatEntryDate(entry.occurred_at)}</td>
                <td className="min-w-64 px-3 py-3.5"><p className="font-medium">{entry.category}</p><p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{[entry.counterparty, entry.note].filter(Boolean).join(" · ") || (entry.kind === "income" ? "Income" : "Expense")}</p></td>
                <td className="whitespace-nowrap px-3 py-3.5 text-xs text-muted-foreground">{entry.payment_method ? PAYMENT_LABELS[entry.payment_method] : "—"}</td>
                <td className="px-3 py-3.5"><StatusCell entry={entry} onMarkPaid={onMarkPaid} /></td>
                <td className={cn("tnum whitespace-nowrap px-5 py-3.5 text-right font-semibold", entry.kind === "income" ? "text-money" : "text-destructive")}>
                  {entry.kind === "expense" ? "−" : "+"}{formatPaise(entry.amount_paise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="font-medium">{entry.category}</p><p className="mt-1 truncate text-xs text-muted-foreground">{entry.counterparty || entry.note || formatEntryDate(entry.occurred_at)}</p></div>
              <p className={cn("tnum shrink-0 font-semibold", entry.kind === "income" ? "text-money" : "text-destructive")}>{entry.kind === "expense" ? "−" : "+"}{formatPaise(entry.amount_paise)}</p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{formatEntryDate(entry.occurred_at)}{entry.payment_method ? ` · ${PAYMENT_LABELS[entry.payment_method]}` : ""}</p><StatusCell entry={entry} onMarkPaid={onMarkPaid} /></div>
          </li>
        ))}
      </ul>
    </>
  );
}

function StatusCell({ entry, onMarkPaid }: { entry: AccountEntry; onMarkPaid: (entry: AccountEntry) => void }) {
  if (entry.status === "paid") return <Badge variant="secondary"><CheckIcon aria-hidden />Paid</Badge>;
  return <Button type="button" size="sm" variant="outline" className="h-7 text-xs text-money" onClick={() => onMarkPaid(entry)}><Clock3Icon aria-hidden />Mark paid</Button>;
}

function AccountEntrySheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<AccountEntryKind>("income");
  const [status, setStatus] = useState<AccountEntryStatus>("paid");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Consultation");
  const [method, setMethod] = useState<AccountPaymentMethod | "">("");
  const [counterparty, setCounterparty] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayInIndia);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeKind(next: AccountEntryKind) {
    setKind(next);
    setCategory(next === "income" ? "Consultation" : "Supplies");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          status,
          amount,
          category,
          paymentMethod: method || undefined,
          counterparty: counterparty || undefined,
          note: note || undefined,
          occurredAt: new Date(`${date}T12:00:00+05:30`).toISOString(),
          idempotencyKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Could not save the account entry.");
      setAmount("");
      setCounterparty("");
      setNote("");
      setIdempotencyKey(newIdempotencyKey());
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the account entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add account entry</SheetTitle>
          <SheetDescription>Record income or an expense in the financial ledger.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="contents">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
            <div className="well grid grid-cols-2 gap-1 p-1" role="group" aria-label="Entry type">
              {(["income", "expense"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={kind === value} onClick={() => changeKind(value)} className={cn("h-9 rounded-sm text-sm font-medium capitalize", kind === value ? "border border-border bg-card shadow-flat" : "text-muted-foreground")}>{value}</button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount" htmlFor="account-amount"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span><Input id="account-amount" required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="tnum pl-7 text-money" placeholder="0.00" /></div></Field>
              <Field label="Date" htmlFor="account-date"><Input id="account-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="account-category"><Input id="account-category" required maxLength={120} value={category} onChange={(event) => setCategory(event.target.value)} list="account-categories" /><datalist id="account-categories">{(kind === "income" ? ["Consultation", "Procedure", "Certificate", "Other income"] : ["Supplies", "Rent", "Utilities", "Staff", "Equipment", "Other expense"]).map((item) => <option key={item} value={item} />)}</datalist></Field>
              <Field label="Status" htmlFor="account-status"><select id="account-status" value={status} onChange={(event) => setStatus(event.target.value as AccountEntryStatus)} className="well h-10 w-full px-3 text-sm text-foreground outline-none"><option value="paid">Paid</option><option value="pending">Pending</option></select></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment method" htmlFor="account-method"><select id="account-method" value={method} onChange={(event) => setMethod(event.target.value as AccountPaymentMethod | "")} className="well h-10 w-full px-3 text-sm text-foreground outline-none"><option value="">Not specified</option>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Person or business" htmlFor="account-counterparty"><Input id="account-counterparty" maxLength={300} value={counterparty} onChange={(event) => setCounterparty(event.target.value)} placeholder={kind === "income" ? "Patient or payer" : "Vendor or payee"} /></Field>
            </div>
            <Field label="Note" htmlFor="account-note"><Textarea id="account-note" maxLength={2000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional details" /></Field>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !amount.trim() || !category.trim()}>{saving ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <BanknoteIcon aria-hidden />}Save entry</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}

function formatPaise(value: number): string {
  return formatINR(value / 100);
}

function formatEntryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `account-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
