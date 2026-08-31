"use client";

import { useEffect, useId, useState } from "react";

import { ToothChart } from "@/components/dental/tooth-chart";
import { Plus, Trash2, TriangleAlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isFdiTooth, toothLabel, SURFACE_ORDER, sortSurfaces } from "@/lib/dental/tooth";
import { reviewFieldId, type ReviewProcedure } from "@/lib/encounters/review";
import { cn } from "@/lib/utils";

/** One row of the clinic's own procedure list, as `/api/procedures` returns it. */
interface CatalogueOption {
  id: string;
  code: string;
  name: string;
  default_scope: string;
  default_sittings: number;
}

const EMPTY_PROCEDURE: ReviewProcedure = {
  procedure_name: "",
  tooth_spoken: null,
  surfaces_spoken: null,
  sitting_spoken: null,
  note: null,
  tooth_fdi: null,
  surfaces: [],
  sitting_number: null,
  total_sittings: null,
  scope: "tooth",
  catalogue_id: null,
};

/**
 * The procedure lines of a dental visit.
 *
 * Deliberately the same contract as `MedicationEditor` — same props, same
 * `list.index.field` key convention, same `reviewFieldId` ids so the review
 * checklist's jump-to-field works without knowing which editor it is jumping
 * into.
 *
 * The one thing it adds is the chart. A tooth number typed into a box is
 * exactly as easy to get wrong as one heard by a model, so correcting a tooth
 * opens the odontogram and the dentist taps the tooth — and the row then reads
 * back the name, "36 · Lower left first molar", which is the half of the answer
 * that cannot be misread.
 */
export function ProcedureEditor({
  value,
  onChange,
  flaggedKeys = new Set<string>(),
  reviewedKeys = new Set<string>(),
  onFieldChange,
}: {
  value: ReviewProcedure[];
  onChange: (next: ReviewProcedure[]) => void;
  flaggedKeys?: ReadonlySet<string>;
  reviewedKeys?: ReadonlySet<string>;
  onFieldChange?: (key: string) => void;
}) {
  const datalistId = useId();
  // The clinic's own procedure list, fetched once. Picking from it is what
  // attaches a `catalogue_id`, and that link is the only thing that tells the
  // chart whether a procedure extracted a tooth or merely x-rayed it — a
  // free-typed name carries no effect and leaves the tooth unmarked.
  const [catalogue, setCatalogue] = useState<CatalogueOption[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/procedures", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { procedures: [] }))
      .then((body) => setCatalogue(body.procedures ?? []))
      .catch(() => {
        // The name is free text and the catalogue is a convenience. A dentist
        // mid-visit should not be blocked because a list did not load.
      });
    return () => controller.abort();
  }, []);

  // Which rows the dentist has explicitly opened or closed. A row whose tooth
  // did not resolve opens its chart on its own and stays open until they close
  // it — that row cannot be saved until a tooth is picked, so making them find
  // a button first is asking them to discover the fix for a problem the app has
  // already told them about.
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [closed, setClosed] = useState<Set<number>>(new Set());

  function isCharting(index: number, unresolved: boolean) {
    if (opened.has(index)) return true;
    if (closed.has(index)) return false;
    return unresolved;
  }

  function toggleChart(index: number, open: boolean) {
    setOpened((prev) => {
      const next = new Set(prev);
      if (open) next.add(index);
      else next.delete(index);
      return next;
    });
    setClosed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function update(index: number, patch: Partial<ReviewProcedure>, changedKey: string) {
    onChange(
      value.map((procedure, procedureIndex) =>
        procedureIndex === index
          ? // `resolved` marks the row as the dentist's, so the deterministic
            // pass stops re-deriving it from the original speech on every
            // autosave and overwriting what they just fixed.
            { ...procedure, ...patch, resolved: true }
          : procedure,
      ),
    );
    onFieldChange?.(`procedures.${index}.${changedKey}`);
  }

  function pickTooth(index: number, fdi: number) {
    const current = value[index];
    // Tapping the selected tooth again clears it, which is the only way to undo
    // a mis-tap without deleting the whole line.
    const next = current.tooth_fdi === fdi ? null : fdi;
    update(index, { tooth_fdi: next, scope: next === null ? "other" : "tooth" }, "tooth_fdi");
  }

  function toggleSurface(index: number, surface: string) {
    const current = value[index].surfaces ?? [];
    const next = current.includes(surface)
      ? current.filter((s) => s !== surface)
      : sortSurfaces([...current, surface]);
    update(index, { surfaces: next }, "surfaces");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {value.length === 0 ? "No procedures" : `${value.length} procedure${value.length > 1 ? "s" : ""}`}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, { ...EMPTY_PROCEDURE }])}
        >
          <Plus className="size-3.5" aria-hidden />
          Add procedure
        </Button>
      </div>

      {value.map((procedure, index) => {
        const prefix = `procedures.${index}`;
        const needsTooth = (procedure.scope ?? "tooth") === "tooth";
        const unresolved = needsTooth && procedure.tooth_fdi == null;
        const open = isCharting(index, unresolved);

        return (
          <div key={index} className="surface-inset space-y-3 rounded-xl p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {procedure.procedure_name || `Procedure ${index + 1}`}
                </p>
                <ToothSummary procedure={procedure} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-3.5" aria-hidden />
                <span className="sr-only">
                  Remove {procedure.procedure_name || `procedure ${index + 1}`}
                </span>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ProcedureField
                label="Procedure"
                fieldKey={`${prefix}.procedure_name`}
                flaggedKeys={flaggedKeys}
                reviewedKeys={reviewedKeys}
              >
                <Input
                  id={reviewFieldId(`${prefix}.procedure_name`)}
                  value={procedure.procedure_name}
                  onChange={(event) => {
                    const name = event.target.value;
                    // An exact match against the clinic's list adopts that
                    // entry — its id, its scope and its default sittings. Typing
                    // something the clinic does not offer is still allowed and
                    // simply carries no catalogue link.
                    const match = catalogue.find(
                      (option) => option.name.toLowerCase() === name.trim().toLowerCase(),
                    );
                    update(
                      index,
                      match
                        ? {
                            procedure_name: match.name,
                            catalogue_id: match.id,
                            scope: procedure.tooth_fdi != null ? "tooth" : match.default_scope,
                            total_sittings:
                              procedure.total_sittings ??
                              (match.default_sittings > 1 ? match.default_sittings : null),
                          }
                        : { procedure_name: name, catalogue_id: null },
                      "procedure_name",
                    );
                  }}
                  placeholder="e.g. Root canal"
                  list={`${datalistId}-procedures`}
                  autoComplete="off"
                />
              </ProcedureField>

              <ProcedureField
                label="Tooth"
                fieldKey={`${prefix}.tooth_fdi`}
                flaggedKeys={flaggedKeys}
                reviewedKeys={reviewedKeys}
              >
                <div className="flex gap-2">
                  <Input
                    id={reviewFieldId(`${prefix}.tooth_fdi`)}
                    value={procedure.tooth_fdi ?? ""}
                    inputMode="numeric"
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      const parsed = Number(raw);
                      const fdi = raw !== "" && isFdiTooth(parsed) ? parsed : null;
                      update(
                        index,
                        { tooth_fdi: fdi, scope: fdi === null ? "other" : "tooth" },
                        "tooth_fdi",
                      );
                    }}
                    placeholder="FDI, e.g. 36"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant={open ? "default" : "outline"}
                    size="sm"
                    aria-expanded={open}
                    onClick={() => toggleChart(index, !open)}
                  >
                    {open ? "Done" : "Chart"}
                  </Button>
                </div>
              </ProcedureField>
            </div>

            {procedure.tooth_spoken && procedure.tooth_spoken !== String(procedure.tooth_fdi ?? "") && (
              // The evidence, kept visible. If the model heard "chhattis" and
              // wrote 36, the dentist can see both and judge.
              <p className="text-xs text-muted-foreground">
                Heard: &ldquo;{procedure.tooth_spoken}&rdquo;
              </p>
            )}

            {unresolved && (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <TriangleAlertIcon className="size-3.5" aria-hidden />
                No tooth for this procedure &mdash; chart one before saving.
              </p>
            )}

            {open && (
              <ToothChart
                selected={procedure.tooth_fdi == null ? [] : [procedure.tooth_fdi]}
                // Every other tooth this visit already names, so a dentist
                // charting a second procedure can see what they have said
                // rather than picking the same tooth twice by accident.
                treated={value
                  .filter((_, i) => i !== index)
                  .map((other) => other.tooth_fdi)
                  .filter((fdi): fdi is number => typeof fdi === "number")}
                onToggle={(fdi) => pickTooth(index, fdi)}
                label={`Tap the tooth for ${procedure.procedure_name || "this procedure"}`}
              />
            )}

            {needsTooth && procedure.tooth_fdi != null && (
              <div>
                <Label className="mb-1.5 flex text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Surfaces
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {SURFACE_ORDER.map((surface) => {
                    const on = (procedure.surfaces ?? []).includes(surface);
                    return (
                      <Button
                        key={surface}
                        type="button"
                        variant={on ? "default" : "outline"}
                        size="sm"
                        aria-pressed={on}
                        onClick={() => toggleSurface(index, surface)}
                      >
                        {surface}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <ProcedureField
                label="Sitting"
                fieldKey={`${prefix}.sitting_number`}
                flaggedKeys={flaggedKeys}
                reviewedKeys={reviewedKeys}
              >
                <Input
                  id={reviewFieldId(`${prefix}.sitting_number`)}
                  value={procedure.sitting_number ?? ""}
                  inputMode="numeric"
                  onChange={(event) =>
                    update(
                      index,
                      { sitting_number: event.target.value ? Number(event.target.value) : null },
                      "sitting_number",
                    )
                  }
                  placeholder="e.g. 1"
                  autoComplete="off"
                />
              </ProcedureField>

              <ProcedureField
                label="Of how many"
                fieldKey={`${prefix}.total_sittings`}
                flaggedKeys={flaggedKeys}
                reviewedKeys={reviewedKeys}
              >
                <Input
                  id={reviewFieldId(`${prefix}.total_sittings`)}
                  value={procedure.total_sittings ?? ""}
                  inputMode="numeric"
                  onChange={(event) =>
                    update(
                      index,
                      { total_sittings: event.target.value ? Number(event.target.value) : null },
                      "total_sittings",
                    )
                  }
                  placeholder="e.g. 3"
                  autoComplete="off"
                />
              </ProcedureField>
            </div>
          </div>
        );
      })}

      {/*
        The clinic's own list, not a hard-coded one — 0024 made the catalogue
        clinic-owned precisely so a practice can rename and re-price it.
      */}
      <datalist id={`${datalistId}-procedures`}>
        {catalogue.map((option) => (
          <option key={option.id} value={option.name} />
        ))}
      </datalist>
    </div>
  );
}

/** "36 · Lower left first molar" — the unmisreadable half of the answer. */
function ToothSummary({ procedure }: { procedure: ReviewProcedure }) {
  if (procedure.tooth_fdi != null && isFdiTooth(procedure.tooth_fdi)) {
    return (
      <p className="mt-0.5 text-xs text-muted-foreground">
        <span className="tabular-nums font-medium text-foreground">{procedure.tooth_fdi}</span>
        {" · "}
        {toothLabel(procedure.tooth_fdi)}
        {(procedure.surfaces ?? []).length > 0 && ` · ${(procedure.surfaces ?? []).join("")}`}
        {procedure.sitting_number != null &&
          ` · sitting ${procedure.sitting_number}${procedure.total_sittings ? ` of ${procedure.total_sittings}` : ""}`}
      </p>
    );
  }
  const scope = procedure.scope ?? "tooth";
  if (scope !== "tooth") {
    return (
      <p className="mt-0.5 text-xs text-muted-foreground">{scope.replace("_", " ")}</p>
    );
  }
  return null;
}

function ProcedureField({
  label,
  fieldKey,
  flaggedKeys,
  reviewedKeys,
  children,
}: {
  label: string;
  fieldKey: string;
  flaggedKeys: ReadonlySet<string>;
  reviewedKeys: ReadonlySet<string>;
  children: React.ReactNode;
}) {
  const flagged = flaggedKeys.has(fieldKey);
  const reviewed = reviewedKeys.has(fieldKey);

  return (
    <div>
      <Label
        htmlFor={reviewFieldId(fieldKey)}
        className={cn(
          "mb-1.5 flex text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground",
          flagged && !reviewed && "text-warning",
        )}
      >
        {label}
        {flagged && (
          <span className="ml-auto tracking-normal normal-case">
            {reviewed ? "checked" : "check this"}
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}
