"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import {
  flattenGroups,
  rankCommandItems,
  type CommandGroupId,
  type CommandItem,
  type RankedCommandItem,
} from "@/components/command/command-items";
import { CommandOption } from "@/components/command/command-option";
import {
  buildCommandItems,
  COMMAND_WORKSPACES,
  type CommandWorkspace,
  type CommandWorkspaceId,
} from "@/components/command/command-sources";
import { useCommandRecents } from "@/components/command/use-command-recents";
import { usePatientSearch } from "@/components/command/use-patient-search";
import { LoaderCircleIcon, SearchIcon, TriangleAlertIcon, XIcon } from "@/components/icons";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import type { RegisterEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * How many rows each group may contribute.
 *
 * The ungrouped total is what the doctor reads past to reach the row they meant,
 * so the open-ended groups are capped. Workspaces and actions are fixed short
 * lists and are left whole.
 */
const GROUP_LIMITS: Partial<Record<CommandGroupId, number>> = {
  recent: 4,
  visits: 5,
  patients: 8,
};

/**
 * Held longer than the patient-search debounce, so a name typed at speed is
 * announced once — as its final count — rather than as a countdown of every
 * intermediate list a screen reader would have to sit through.
 */
const ANNOUNCE_DELAY_MS = 320;

/** Stable: this is a memo dependency, and a fresh `[]` each render would rebuild every row. */
const NO_VISITS: readonly RegisterEntry[] = [];

export interface CommandPaletteProps {
  open: boolean;
  /** Wire straight to `useCommandPalette().setOpen`. */
  onOpenChange: (open: boolean) => void;

  /** Marks its row "Current" rather than hiding it: a palette that silently drops a destination is harder to trust. */
  activeWorkspace?: CommandWorkspaceId;
  onNavigate?: (id: CommandWorkspaceId) => void;
  /** Defaults to every workspace, in sidebar order. */
  workspaces?: readonly CommandWorkspace[];

  /** Whatever the host already holds, newest first. Nothing is fetched for this. */
  recentVisits?: readonly RegisterEntry[];
  onOpenVisit?: (entry: RegisterEntry) => void;

  /** Also switches patient search on: without a handler there is nowhere for a name to lead. */
  onOpenPatient?: (patient: PatientMatch) => void;

  onStartDictation?: () => void;
  onAddAccountEntry?: () => void;
  onExportRegister?: () => void;

  className?: string;
}

/**
 * Cmd-K. One box over everything, reaching every workspace, every patient, the
 * visits the host already has, and the things a doctor starts from cold.
 *
 * Focus stays in the search box the whole time and the highlighted row is
 * pointed at with `aria-activedescendant` — that is what lets a single keystroke
 * both filter the list and move the selection. Radix supplies the modal half:
 * the focus trap, Escape, click-outside, and returning focus to whatever held it
 * when the palette opened.
 *
 * Every row is optional. One appears only when the host passed the handler that
 * gives it somewhere to go.
 */
export function CommandPalette({ open, ...props }: CommandPaletteProps) {
  return (
    <Dialog.Root open={open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        {/* No exit animation on either layer, so closing unmounts the panel in
            the same commit. A palette that lingers on the way out is a palette
            that reopens still holding the last query. */}
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-[var(--scrim)]" />
        <CommandPaletteContent {...props} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Split from `CommandPalette` so that every piece of palette state — the query,
 * the highlight, the patient results, the announcement queue — is owned by a
 * component that only exists while the palette is open. Closing it is what
 * clears them; there is no reset to forget to run.
 */
function CommandPaletteContent({
  onOpenChange,
  activeWorkspace,
  onNavigate,
  workspaces = COMMAND_WORKSPACES,
  recentVisits = NO_VISITS,
  onOpenVisit,
  onOpenPatient,
  onStartDictation,
  onAddAccountEntry,
  onExportRegister,
  className,
}: Omit<CommandPaletteProps, "open">) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;

  const [query, setQuery] = useState("");
  // The query the highlight was placed under travels with it. A highlight is
  // only meaningful against the list it was chosen from, and comparing the two
  // is what retires it — no effect, and no frame where Enter would open the row
  // that has since slid into that position.
  const [highlight, setHighlight] = useState<{ id: string; query: string } | null>(null);
  // Carries a counter because a screen reader treats writing the identical
  // sentence back into a live region as no change at all, and "8 results" about
  // a different eight results has to be spoken again.
  const [status, setStatus] = useState({ id: 0, text: "" });

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const movedByKeyboard = useRef(false);

  const { ids: recentIds, remember } = useCommandRecents();
  const patientSearch = usePatientSearch(query, Boolean(onOpenPatient));
  const trimmed = query.trim();

  const items = useMemo(
    () =>
      buildCommandItems({
        workspaces,
        activeWorkspace,
        onNavigate,
        visits: recentVisits,
        onOpenVisit,
        patients: patientSearch.patients,
        onOpenPatient,
        onStartDictation,
        onAddAccountEntry,
        onExportRegister,
      }),
    [
      workspaces,
      activeWorkspace,
      onNavigate,
      recentVisits,
      onOpenVisit,
      patientSearch.patients,
      onOpenPatient,
      onStartDictation,
      onAddAccountEntry,
      onExportRegister,
    ],
  );

  const groups = useMemo(
    () =>
      rankCommandItems(
        trimmed === "" ? promoteRecents(items, recentIds) : items,
        trimmed,
        GROUP_LIMITS,
      ),
    [items, recentIds, trimmed],
  );

  const flat = useMemo(() => flattenGroups(groups), [groups]);
  const indexById = useMemo(
    () => new Map(flat.map((ranked, index) => [ranked.item.id, index])),
    [flat],
  );

  // Kept as an id rather than an index so that patient results arriving from
  // the server settle in underneath the highlight instead of moving it: an
  // index would leave Enter pointing at whatever slid into that position. An id
  // can only hold while its row is still on screen under the same query, so
  // both misses below fall back to the first row — a defined destination the
  // doctor can see is highlighted, rather than a stale one they cannot.
  const activeIndex = useMemo(() => {
    if (flat.length === 0) return -1;
    if (highlight === null || highlight.query !== trimmed) return 0;
    return indexById.get(highlight.id) ?? 0;
  }, [flat.length, highlight, indexById, trimmed]);

  const setActive = useCallback(
    (id: string) => setHighlight({ id, query: trimmed }),
    [trimmed],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStatus((current) => ({
        id: current.id + 1,
        text: summarise(flat.length, trimmed, patientSearch.error),
      }));
    }, ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [flat.length, trimmed, patientSearch.error]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const row = scrollRef.current?.querySelector<HTMLElement>(
      `[data-command-index="${activeIndex}"]`,
    );
    // `nearest`, and never smooth: a list still gliding when the next arrow key
    // lands scrolls the row after the one the doctor is looking at into view.
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flat]);

  const moveBy = useCallback(
    (delta: number) => {
      if (flat.length === 0) return;
      movedByKeyboard.current = true;
      setActive(flat[(activeIndex + delta + flat.length) % flat.length].item.id);
    },
    [activeIndex, flat, setActive],
  );

  const select = useCallback(
    (ranked: RankedCommandItem | undefined) => {
      if (!ranked) return;
      remember(ranked.item.id);
      ranked.item.run();
      onOpenChange(false);
    },
    [onOpenChange, remember],
  );

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    // Cmd-ArrowUp and its relatives belong to the text box and to the OS. Only
    // the unmodified keys are the palette's to take.
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveBy(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveBy(-1);
      return;
    }
    if (event.key === "Enter") {
      // An IME is mid-word: this Enter accepts the candidate being composed, and
      // taking it would open a row the doctor never chose.
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      select(flat[activeIndex]);
    }
  }

  function onContentKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target === inputRef.current) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // Typing is the only thing this dialog is for, so a character typed while
    // the close button happens to hold focus goes into the box rather than
    // nowhere. `length === 1` is what separates "a" from "Shift" and "Tab".
    //
    // Space is the one character that is not free to take: a native button
    // activates on keyup, so moving focus during this keydown sends that keyup
    // to the input instead, and Clear or Close never fires — the doctor gets a
    // space in the query in place of the button they were standing on.
    if (event.key.length !== 1 || event.key === " ") return;
    inputRef.current?.focus();
  }

  function onResultsMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    // The first movement after an arrow key is swallowed. Scrolling the list
    // under a hand that has not moved still fires mousemove, and that would drag
    // the highlight back to wherever the pointer was left resting.
    if (movedByKeyboard.current) {
      movedByKeyboard.current = false;
      return;
    }

    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-command-index]");
    const index = row ? Number(row.dataset.commandIndex) : -1;
    if (!Number.isInteger(index) || index < 0 || index >= flat.length) return;
    if (index === activeIndex) return;
    setActive(flat[index].item.id);
  }

  return (
    <Dialog.Content
      onOpenAutoFocus={(event) => {
        // Radix focuses the first tabbable node it finds. That is this input
        // today, but naming it means a control added ahead of it later cannot
        // quietly take the focus a palette has to open with.
        event.preventDefault();
        inputRef.current?.focus();
      }}
      onKeyDown={onContentKeyDown}
      className={cn(
        "surface-elevated text-popover-foreground fixed z-50 flex flex-col overflow-hidden outline-none",
        // Held near the top of a phone so the on-screen keyboard rising from the
        // bottom does not cover the results on the screen it has just shortened.
        "inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] max-h-[min(32rem,80dvh)]",
        "sm:inset-x-0 sm:top-[12vh] sm:mx-auto sm:w-full sm:max-w-xl",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-150",
        className,
      )}
    >
      <Dialog.Title className="sr-only">Command palette</Dialog.Title>
      <Dialog.Description className="sr-only">
        Search workspaces, patients, recent visits and actions. Use the up and down arrow keys to
        move through the results, Enter to open the highlighted one, and Escape to close.
      </Dialog.Description>

      <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <SearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <label htmlFor={inputId} className="sr-only">
          Search patients, visits, workspaces and actions
        </label>
        <input
          ref={inputRef}
          id={inputId}
          // `text`, not `search`: WebKit gives Escape to a search field's own
          // clear-the-box behaviour, and the one key that has to close this
          // dialog would stop reaching it.
          type="text"
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex < 0 ? undefined : optionId(baseId, activeIndex)}
          aria-autocomplete="list"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="Search patients, visits or actions…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeyDown}
          // 16px on a phone: iOS zooms the page in on a focused field set any
          // smaller, and the palette ends up half off the screen.
          className="text-foreground placeholder:text-muted-foreground h-10 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
        />

        {query !== "" && (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="pressable text-muted-foreground hover:text-foreground grid size-10 shrink-0 place-items-center rounded-md"
          >
            {/* A filled chip, where Close beside it is a bare cross: two crosses
                of the same weight in one row read as one control drawn twice. */}
            <span className="bg-secondary text-secondary-foreground grid size-5 place-items-center rounded-full">
              <XIcon className="size-3" aria-hidden />
            </span>
          </button>
        )}

        <Dialog.Close
          aria-label="Close the command palette"
          className="pressable text-muted-foreground hover:bg-secondary hover:text-foreground grid size-10 shrink-0 place-items-center rounded-md"
        >
          <XIcon className="size-4" aria-hidden />
        </Dialog.Close>
      </div>

      {(patientSearch.error || patientSearch.loading) && (
        <div className="border-border flex shrink-0 items-center gap-2 border-b px-3.5 py-2 text-xs">
          {patientSearch.error ? (
            <>
              <TriangleAlertIcon className="text-destructive size-3.5 shrink-0" aria-hidden />
              <span className="text-destructive leading-relaxed">{patientSearch.error}</span>
            </>
          ) : (
            <>
              <LoaderCircleIcon
                className="text-muted-foreground size-3.5 shrink-0 animate-spin"
                aria-hidden
              />
              <span className="text-muted-foreground">Searching patients…</span>
            </>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onMouseMove={onResultsMouseMove}
        // Keeps the caret — and so every key the palette listens for — in the
        // search box when a row is clicked.
        onMouseDown={(event) => event.preventDefault()}
      >
        <div
          id={listboxId}
          role="listbox"
          aria-label="Command palette results"
          className={cn(flat.length > 0 && "p-2")}
        >
          {groups.map((group) => {
            const headingId = `${baseId}-group-${group.id}`;
            return (
              <div key={group.id} role="group" aria-labelledby={headingId} className="mb-1 last:mb-0">
                <div
                  id={headingId}
                  role="presentation"
                  className="text-muted-foreground px-2.5 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase"
                >
                  {group.label}
                </div>
                {group.items.map((ranked) => {
                  const index = indexById.get(ranked.item.id) ?? -1;
                  return (
                    <CommandOption
                      key={ranked.item.id}
                      id={optionId(baseId, index)}
                      index={index}
                      ranked={ranked}
                      active={index === activeIndex}
                      onSelect={() => select(ranked)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {flat.length === 0 && (
          <div className="px-6 py-10 text-center">
            <p className="text-foreground text-sm font-medium">
              {trimmed === "" ? "Nothing to search yet" : `No matches for “${trimmed}”`}
            </p>
            <p className="text-muted-foreground mx-auto mt-1.5 max-w-xs text-xs leading-relaxed">
              {trimmed === ""
                ? "This screen has not given the palette anything to open."
                : "Try a patient’s name, part of a diagnosis, or the name of a workspace."}
            </p>
          </div>
        )}
      </div>

      {/* Hidden from assistive technology on purpose: the keys are in the
          dialog's description and the count is in the live region below, and
          hearing either twice is worse than not seeing this at all. */}
      <div
        aria-hidden
        className="border-border text-muted-foreground hidden shrink-0 items-center justify-between gap-3 border-t px-3.5 py-2 text-[0.6875rem] sm:flex"
      >
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Key>↑</Key>
            <Key>↓</Key> to move
          </span>
          <span className="flex items-center gap-1">
            <Key>↵</Key> to open
          </span>
          <span className="flex items-center gap-1">
            <Key>esc</Key> to close
          </span>
        </span>
        <span className="tnum">{flat.length === 1 ? "1 result" : `${flat.length} results`}</span>
      </div>

      {/* Mounted empty and filled a moment later. A live region inserted into the
          DOM together with its text is usually not announced at all, because
          assistive technology has to be watching the node before it changes. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <span>{status.id % 2 === 0 ? status.text : ""}</span>
        <span>{status.id % 2 === 1 ? status.text : ""}</span>
      </div>
    </Dialog.Content>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="border-border bg-secondary text-foreground shadow-flat inline-grid h-5 min-w-5 place-items-center rounded border px-1 font-mono text-[0.625rem] leading-none font-semibold">
      {children}
    </kbd>
  );
}

function optionId(baseId: string, index: number): string {
  return `${baseId}-option-${index}`;
}

/**
 * Moves the recently used rows into the Recent group rather than copying them
 * there. A copy puts the same command on screen twice — and since an option's
 * id is what `aria-activedescendant` points at, two rows claiming one id leave a
 * screen reader announcing whichever the DOM reaches first.
 */
function promoteRecents(items: CommandItem[], recentIds: readonly string[]): CommandItem[] {
  if (recentIds.length === 0) return items;

  const order = new Map(recentIds.map((id, index) => [id, index]));
  const promoted = items
    .filter((item) => order.has(item.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((item) => ({ ...item, group: "recent" as const }));

  return [...promoted, ...items.filter((item) => !order.has(item.id))];
}

function summarise(count: number, query: string, error: string | null): string {
  // The failure is the news. A count of the rows that survived it is not.
  if (error) return error;
  if (count === 0) return query === "" ? "Nothing to show." : `No matches for ${query}.`;
  return count === 1 ? "1 result." : `${count} results.`;
}
