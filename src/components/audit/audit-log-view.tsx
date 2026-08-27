"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  ArrowUpRightIcon,
  BadgeCheckIcon,
  HistoryIcon,
  Loader2Icon,
  LockKeyholeIcon,
  PencilLineIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonGroup, SkeletonLine } from "@/components/ui/skeleton";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_GROUPS,
  type AuditAction,
  type AuditEntry,
  auditRecordRef,
  describeAuditEntry,
  formatAuditTimestamp,
  formatRelativeTime,
} from "@/lib/audit";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * How often the "4 minutes ago" labels are recomputed.
 *
 * A relative time is a claim that expires. This screen is left open on a clinic
 * tablet, and a row that still says "just now" an hour later is not a stale
 * render — it is the audit trail stating something false about when a colleague
 * touched a patient record.
 */
const TICK_MS = 30_000;

const PAGE_SIZE = 25;

type LoadState = "loading" | "ready" | "error" | "forbidden";

interface AuditPayload {
  entries?: AuditEntry[];
  nextCursor?: string | null;
  total?: number | null;
  error?: string;
}

export interface AuditLogViewProps {
  /** Match the surrounding document outline; this is a section, not a page. */
  headingLevel?: 2 | 3;
  className?: string;
}

/**
 * Who did what to which record, and when.
 *
 * `audit_log` has been recording every insert, update, delete and sign-off
 * since migration 0004 and nothing has ever shown it, which makes it evidence
 * nobody can check. This renders it as sentences: the raw row carries a table
 * name, an action enum, an array of column names and a jsonb blob, none of
 * which a doctor should have to read. The jsonb in particular never arrives —
 * the API narrows it to a short phrase server-side.
 *
 * Owner-only, and the API enforces that independently of wherever this mounts.
 */
export function AuditLogView({ headingLevel = 2, className }: AuditLogViewProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * A failed *next* page, kept apart from a failed first page.
   *
   * Replacing the list with a retry panel because page four timed out would
   * throw away the three pages the owner has already read and scrolled
   * through. The rows they have stay on screen; only the button reports.
   */
  const [moreError, setMoreError] = useState<string | null>(null);

  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState<AuditAction | "all">("all");

  const [now, setNow] = useState(() => Date.now());

  const headingId = useId();
  const entityFilterId = useId();
  const actionFilterId = useId();
  // Every response carries the number of the request that asked for it, so a
  // slow first page cannot land on top of the filtered list that replaced it.
  const requestRef = useRef(0);

  const summaryRef = useRef<HTMLParagraphElement>(null);
  /**
   * Set when a "Load older entries" press turned out to have loaded the last
   * page. The button unmounts with the keyboard focus still on it, and the
   * browser then drops focus to `<body>` — which returns the owner to the top
   * of the settings page with no way back to the row they were reading. Focus
   * goes to the count line instead, which is the thing their press changed.
   */
  const focusSummary = useRef(false);

  const filtered = entity !== "all" || action !== "all";

  const load = useCallback(
    async (cursor: string | null, signal?: AbortSignal) => {
      const ticket = ++requestRef.current;
      setBusy(true);
      setMoreError(null);
      if (!cursor) setState("loading");

      const fail = (text: string) => {
        if (cursor) setMoreError(text);
        else {
          setState("error");
          setMessage(text);
        }
      };

      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (entity !== "all") params.set("entity", entity);
      if (action !== "all") params.set("action", action);
      if (cursor) params.set("cursor", cursor);

      try {
        const response = await fetch(`/api/audit?${params}`, { cache: "no-store", signal });
        const payload = (await response.json()) as AuditPayload;
        if (ticket !== requestRef.current) return;

        if (response.status === 403) {
          setState("forbidden");
          setMessage(payload.error ?? "Only the clinic owner can view the audit trail.");
          return;
        }
        // The API's own sentence, which is already written for a doctor. Anything
        // thrown past this point is a transport failure, and `cause.message`
        // there is the browser's wording ("Failed to fetch") — not something to
        // put in front of someone trying to work out who changed a chart.
        if (!response.ok) {
          fail(payload.error ?? "Could not load the audit trail.");
          return;
        }

        const page = payload.entries ?? [];
        const next = payload.nextCursor ?? null;
        focusSummary.current = Boolean(cursor) && next === null;
        setEntries((current) => (cursor ? [...current, ...page] : page));
        setNextCursor(next);
        if (!cursor) setTotal(payload.total ?? null);
        setState("ready");
        setMessage(null);
        // One instant for the whole list, refreshed on every load: rows fetched
        // in different pages otherwise age against different clocks.
        setNow(Date.now());
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (ticket !== requestRef.current) return;
        console.error("[audit-log-view]", cause);
        fail("The audit trail didn’t load. Check your connection and try again.");
      } finally {
        if (ticket === requestRef.current) setBusy(false);
      }
    },
    [action, entity],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Deferred a tick: `load` sets state on its first line, and a synchronous
    // setState inside an effect costs an extra render before the first paint.
    const timer = window.setTimeout(() => void load(null, controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // After the render that removed the button, not inside `load`, which runs
  // before the appended rows and the new count are on screen.
  useEffect(() => {
    if (!focusSummary.current) return;
    focusSummary.current = false;
    summaryRef.current?.focus();
  }, [entries]);

  const rows = useMemo(
    () =>
      entries.map((entry) => {
        const sentence = describeAuditEntry(entry);
        const ref = auditRecordRef(entry.entityId);
        return {
          entry,
          sentence,
          // Composed as one string rather than as separated spans: an
          // `aria-hidden` separator between two spans removes the whitespace a
          // screen reader needs, and reads "visit numberrecord 3f2a91cc".
          meta: [sentence.fields, entry.context, ref && `record ${ref}`]
            .filter(Boolean)
            .join(" · "),
          relative: formatRelativeTime(entry.at, now),
          absolute: formatAuditTimestamp(entry.at),
        };
      }),
    [entries, now],
  );

  function clearFilters() {
    setEntity("all");
    setAction("all");
  }

  const Heading = `h${headingLevel}` as "h2" | "h3";

  /**
   * Rendered outside the state branch, and as the same element in both, so React
   * keeps one region mounted across every transition — a live region that
   * arrives with its words already inside is not reliably announced. The lock
   * panel below replaces the whole section, so a region living inside it would
   * be a fresh node holding a 403 nobody hears.
   */
  const status = (
    <p className="sr-only" role="status" aria-live="polite">
      {moreError ?? spokenStatus(state, rows.length, total, filtered, message)}
    </p>
  );

  if (state === "forbidden") {
    return (
      <>
        {status}
        <section
          aria-labelledby={headingId}
          className={cn("surface-card rounded-2xl p-5 text-center", className)}
        >
          <span className="mx-auto mb-3 grid size-10 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground">
            <LockKeyholeIcon className="size-5" aria-hidden />
          </span>
          <Heading id={headingId} className="text-sm font-semibold">
            The audit trail is for the clinic owner
          </Heading>
          <p className="mx-auto mt-1 max-w-prose text-sm leading-5 text-muted-foreground">
            {message} It names which colleague opened or changed each record, so only the person
            accountable for the clinic can read it.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      {status}
      <section aria-labelledby={headingId} className={cn("space-y-3", className)}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="section-kicker">
              <ShieldCheckIcon className="size-3.5" aria-hidden />
              Accountability
            </span>
            <Heading id={headingId} className="mt-1 text-lg font-semibold tracking-[-0.01em]">
              Audit trail
            </Heading>
            <p className="mt-1 max-w-prose text-sm leading-5 text-muted-foreground">
              Every record created, changed, signed off, opened or exported in this clinic, newest
              first.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void load(null)}
          >
            {busy && state !== "loading" ? (
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <HistoryIcon className="size-3.5" aria-hidden />
            )}
            Refresh
          </Button>
        </header>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-40">
            <label
              htmlFor={entityFilterId}
              className="mb-1 block text-xs font-semibold text-muted-foreground"
            >
              Record type
            </label>
            {/* `Button` carries the coarse-pointer minimum in its base variant;
                `Select` does not, and its `h-10` is 40px — under the 44px a
                thumb needs. These two are the only controls on this screen that
                render short on a clinic tablet. */}
            <Select
              id={entityFilterId}
              value={entity}
              onChange={(event) => setEntity(event.target.value)}
              className="[@media(pointer:coarse)]:min-h-11"
            >
              <option value="all">All records</option>
              {AUDIT_ENTITY_GROUPS.map((group) => (
                <option key={group.value} value={group.value}>
                  {group.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-0 flex-1 basis-40">
            <label
              htmlFor={actionFilterId}
              className="mb-1 block text-xs font-semibold text-muted-foreground"
            >
              What happened
            </label>
            <Select
              id={actionFilterId}
              value={action}
              onChange={(event) => setAction(event.target.value as AuditAction | "all")}
              className="[@media(pointer:coarse)]:min-h-11"
            >
              <option value="all">Anything</option>
              {AUDIT_ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {AUDIT_ACTION_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          {filtered ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
            >
              <XIcon className="size-3.5" aria-hidden />
              Clear
            </Button>
          ) : null}
        </div>

        {state === "loading" ? (
          <SkeletonGroup className="surface-card divide-y divide-border rounded-2xl">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex gap-3 px-3.5 py-3">
                <Skeleton className="size-8 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5 py-1">
                  <SkeletonLine className="w-[70%]" />
                  <SkeletonLine className="w-[40%]" />
                </div>
              </div>
            ))}
          </SkeletonGroup>
        ) : state === "error" ? (
          <EmptyState
            kind="error"
            headingLevel={headingLevel === 2 ? 3 : 4}
            title="Couldn’t load the audit trail"
            description={
              <>
                {message} Nothing has been lost — the trail is written by the database itself, and
                this is a problem reading it back.
              </>
            }
            announce="off"
            retrying={busy}
            onRetry={() => void load(null)}
          />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              kind="filtered"
              headingLevel={headingLevel === 2 ? 3 : 4}
              title="Nothing matches those filters"
              description="No activity of that kind has been recorded. Widen the filters to see the rest of the trail."
              announce="off"
              onClearFilters={clearFilters}
            />
          ) : (
            <EmptyState
              kind="first-run"
              headingLevel={headingLevel === 2 ? 3 : 4}
              title="Nothing recorded yet"
              description="The trail fills itself as the clinic works — every saved visit, chart edit and sign-off lands here. There is nothing to do to start it."
              announce="off"
              action={null}
            />
          )
        ) : (
          <>
            <ol className="surface-card divide-y divide-border rounded-2xl">
              {rows.map(({ entry, sentence, meta, relative, absolute }) => (
                <li key={entry.id} className="flex gap-3 px-3.5 py-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border",
                      ACTION_TONES[entry.action],
                    )}
                  >
                    <ActionIcon action={entry.action} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-5">
                      <span className="font-semibold text-foreground">{sentence.actor}</span>{" "}
                      <span className="text-muted-foreground">{sentence.predicate}</span>
                    </p>

                    {meta ? (
                      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{meta}</p>
                    ) : null}
                  </div>

                  {/* The absolute time is in the accessible name of the `<time>`
                      itself, not only in the tooltip: a tooltip that appears on
                      hover is not reachable on a touch screen, and "4 minutes
                      ago" is the one thing in this row that stops being true.
                      No `tabIndex` on it, deliberately: it is not interactive,
                      and a stop per row puts 25 bare dates — 100 after three
                      "Load older" presses — between the filters and the only
                      button on the screen. Assistive tech reads the stamp from
                      the row without one. */}
                  <span className="relative shrink-0">
                    <time
                      dateTime={entry.at}
                      className="peer tnum block px-1 py-0.5 text-right text-xs font-medium text-muted-foreground"
                    >
                      <span aria-hidden>{relative}</span>
                      <span className="sr-only">{absolute}</span>
                    </time>
                    <span
                      aria-hidden
                      className="surface-elevated pointer-events-none absolute top-full right-0 z-20 mt-1 hidden rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap text-foreground peer-hover:block"
                    >
                      {absolute}
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p ref={summaryRef} tabIndex={-1} className="text-xs text-muted-foreground">
                Showing <span className="tnum font-semibold">{formatCount(rows.length)}</span>
                {total !== null ? (
                  <>
                    {" of "}
                    <span className="tnum font-semibold">{formatCount(total)}</span>
                  </>
                ) : null}{" "}
                {(total ?? rows.length) === 1 ? "entry" : "entries"}
                {filtered ? " matching these filters" : ""}
              </p>

              {moreError ? (
                <p className="order-last w-full text-xs leading-4 font-medium text-destructive">
                  {moreError}
                </p>
              ) : null}

              {nextCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void load(nextCursor)}
                >
                  {busy ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
                  Load older entries
                </Button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </>
  );
}

/**
 * Colour never carries the difference on its own: each action also has its own
 * glyph, and the sentence beside it says the word.
 */
const ACTION_TONES: Record<AuditAction, string> = {
  insert: "border-primary/20 bg-primary-soft text-primary",
  update: "border-warning/25 bg-warning-soft text-warning",
  commit: "border-money/25 bg-money-soft text-money",
  delete: "border-destructive/25 bg-destructive-soft text-destructive",
  read: "border-border bg-secondary text-muted-foreground",
  export: "border-border bg-secondary text-muted-foreground",
};

function ActionIcon({ action }: { action: AuditAction }) {
  const className = "size-4";
  switch (action) {
    case "insert":
      return <PlusIcon className={className} aria-hidden />;
    case "update":
      return <PencilLineIcon className={className} aria-hidden />;
    case "commit":
      return <BadgeCheckIcon className={className} aria-hidden />;
    case "delete":
      return <XIcon className={className} aria-hidden />;
    case "read":
      return <SearchIcon className={className} aria-hidden />;
    case "export":
      return <ArrowUpRightIcon className={className} aria-hidden />;
  }
}

function spokenStatus(
  state: LoadState,
  shown: number,
  total: number | null,
  filtered: boolean,
  message: string | null,
): string {
  if (state === "loading") return "Loading the audit trail.";
  if (state === "error") return message ?? "Could not load the audit trail.";
  if (state === "forbidden") return message ?? "";
  if (shown === 0) {
    return filtered ? "No audit entries match those filters." : "No audit entries recorded yet.";
  }
  const scope = filtered ? " matching these filters" : "";
  const of = total !== null ? ` of ${formatCount(total)}` : "";
  return `Showing ${formatCount(shown)}${of} audit ${shown === 1 ? "entry" : "entries"}${scope}, newest first.`;
}
