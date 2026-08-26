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
} from "@/components/icons";

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

/** Dedicated income and expense ledger with compact, responsive transaction cards. */
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
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="grid size-6 place-items-center rounded-full border border-primary/20 bg-primary-soft">
              <CalendarRangeIcon className="size-3.5" aria-hidden />
            </span>
            Practice finance
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Accounts</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A private, doctor-scoped view of cash flow without touching clinical records.
          </p>
        </div>
        <Button size="lg" onClick={() => setEntryOpen(true)} className="rounded-xl">
          <PlusIcon aria-hidden /> Add entry
        </Button>
      </section>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Couldn’t update accounts</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SummaryCards payload={data} loading={loading} />

      <section className="surface-card overflow-hidden rounded-[1.65rem] border-border bg-card">
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
                className="surface-inset h-11 rounded-xl border-border bg-background pl-10 shadow-none"
              />
            </div>
            <Button type="submit" size="lg" variant="outline" className="rounded-xl border-border bg-secondary">Search</Button>
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
              <div className="surface-inset inline-flex items-center gap-1 rounded-full p-1" role="group" aria-label="Accounts date range">
                {RANGES.map((range) => (
                  <button
                    key={range.days}
                    type="button"
                    aria-pressed={days === range.days}
                    onClick={() => setDays(range.days)}
                    className={cn(
                      "h-8 touch-manipulation rounded-full px-2.5 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11",
                      days === range.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
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
    { label: "Received", value: payload.summary.received_paise, hint: "Paid income", icon: ArrowDownLeftIcon, tone: "text-primary bg-primary-soft" },
    { label: "Pending", value: payload.summary.pending_paise, hint: "Still to collect", icon: Clock3Icon, tone: "text-money bg-money-soft" },
    { label: "Expenses", value: payload.summary.expenses_paise, hint: "Paid expenses", icon: ArrowUpRightIcon, tone: "text-destructive bg-destructive-soft" },
    { label: "Net", value: payload.summary.net_paise, hint: "Received minus expenses", icon: WalletCardsIcon, tone: "text-foreground bg-secondary" },
  ];
  // Two across from the narrowest screen up. These four numbers are one
  // reading — received, pending, expenses, and the net they produce — and
  // stacking them full-width pushed Net off the bottom of a phone, so the
  // figure the other three add up to was the one you had to scroll for.
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" role="list">
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          role="listitem"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: index * 0.04 }}
        >
          <Card className="surface-card group relative h-full gap-3 overflow-hidden rounded-[1.35rem] border-border bg-card py-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:bg-card">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{card.label}</CardTitle>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-[0.8rem] border border-border", card.tone)}><card.icon className="size-4" aria-hidden /></span>
            </CardHeader>
            <CardContent>
              <p className={cn("tnum text-xl font-semibold tracking-[-0.045em] sm:text-2xl", card.label === "Pending" && "text-money")}>
                {loading ? "—" : formatPaise(card.value)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
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
    <div className="surface-inset inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full p-1" role="group" aria-label={label}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            aria-pressed={active}
            className={cn(
              "relative inline-flex h-7 shrink-0 touch-manipulation items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
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
                  className="tnum rounded-full bg-secondary px-1.5 py-0.5 text-xs leading-none text-current"
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
    <ul className="grid gap-2.5 p-3 sm:p-4 lg:grid-cols-2" aria-label="Account entries">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="surface-inset group relative overflow-hidden rounded-[1.2rem] p-4 transition-[border-color,background-color,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-secondary"
        >
          <span
            className={cn(
              "absolute inset-y-4 left-0 w-0.5 rounded-r-full",
              entry.kind === "income" ? "bg-money" : "bg-destructive",
            )}
            aria-hidden
          />
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-[0.85rem] border border-border", entry.kind === "income" ? "bg-money-soft text-money" : "bg-destructive-soft text-destructive")}>
                {entry.kind === "income" ? <ArrowDownLeftIcon className="size-4" aria-hidden /> : <ArrowUpRightIcon className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-[-0.015em]">{entry.category}</p>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {[entry.counterparty, entry.note].filter(Boolean).join(" · ") || (entry.kind === "income" ? "Income" : "Expense")}
                </p>
              </div>
            </div>
            <p className={cn("tnum shrink-0 text-base font-semibold tracking-[-0.03em]", entry.kind === "income" ? "text-money" : "text-destructive")}>
              {entry.kind === "expense" ? "−" : "+"}{formatPaise(entry.amount_paise)}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{formatEntryDate(entry.occurred_at)}</span>
              {entry.payment_method && <><span aria-hidden>·</span><span>{PAYMENT_LABELS[entry.payment_method]}</span></>}
            </p>
            <StatusCell entry={entry} onMarkPaid={onMarkPaid} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusCell({ entry, onMarkPaid }: { entry: AccountEntry; onMarkPaid: (entry: AccountEntry) => void }) {
  if (entry.status === "paid") return <Badge variant="secondary" className="border-money/30 bg-money-soft text-money"><CheckIcon aria-hidden />Paid</Badge>;
  return <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-money hover:bg-money-soft hover:text-money" onClick={() => onMarkPaid(entry)}><Clock3Icon aria-hidden />Mark paid</Button>;
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
      <SheetContent className="surface-elevated overflow-hidden border-border bg-card sm:max-w-lg">
        <SheetHeader className="relative border-b border-border pr-14 sm:px-6 sm:pt-6 sm:pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-[0.95rem] border border-primary/20 bg-primary-soft text-primary">
              <BanknoteIcon className="size-4.5" aria-hidden />
            </span>
            <div>
              <SheetTitle className="text-lg tracking-[-0.025em]">Add account entry</SheetTitle>
              <SheetDescription className="mt-1">Record income or an expense in the financial ledger.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={submit} className="contents">
          <div className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="surface-inset grid grid-cols-2 gap-1 rounded-full p-1" role="group" aria-label="Entry type">
              {(["income", "expense"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={kind === value} onClick={() => changeKind(value)} className={cn("h-9 touch-manipulation rounded-full text-sm font-medium capitalize transition-colors [@media(pointer:coarse)]:min-h-11", kind === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>{value}</button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount" htmlFor="account-amount"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span><Input id="account-amount" required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="tnum pl-7 text-money" placeholder="0.00" /></div></Field>
              <Field label="Date" htmlFor="account-date"><Input id="account-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="account-category"><Input id="account-category" required maxLength={120} value={category} onChange={(event) => setCategory(event.target.value)} list="account-categories" /><datalist id="account-categories">{(kind === "income" ? ["Consultation", "Procedure", "Certificate", "Other income"] : ["Supplies", "Rent", "Utilities", "Staff", "Equipment", "Other expense"]).map((item) => <option key={item} value={item} />)}</datalist></Field>
              <Field label="Status" htmlFor="account-status"><select id="account-status" value={status} onChange={(event) => setStatus(event.target.value as AccountEntryStatus)} className="surface-inset h-10 w-full rounded-lg px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"><option value="paid">Paid</option><option value="pending">Pending</option></select></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment method" htmlFor="account-method"><select id="account-method" value={method} onChange={(event) => setMethod(event.target.value as AccountPaymentMethod | "")} className="surface-inset h-10 w-full rounded-lg px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"><option value="">Not specified</option>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Person or business" htmlFor="account-counterparty"><Input id="account-counterparty" maxLength={300} value={counterparty} onChange={(event) => setCounterparty(event.target.value)} placeholder={kind === "income" ? "Patient or payer" : "Vendor or payee"} /></Field>
            </div>
            <Field label="Note" htmlFor="account-note"><Textarea id="account-note" maxLength={2000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional details" /></Field>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
          <SheetFooter className="relative border-border bg-card sm:px-6">
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
