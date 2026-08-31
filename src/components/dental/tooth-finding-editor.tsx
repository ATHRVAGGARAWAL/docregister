"use client";

import { useState } from "react";

import { ToothChart } from "@/components/dental/tooth-chart";
import { Plus, Trash2, TriangleAlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  isFdiTooth,
  sortSurfaces,
  SURFACE_NAMES,
  SURFACE_ORDER,
  toothLabel,
} from "@/lib/dental/tooth";
import type { ToothStatus } from "@/lib/dental/tooth-status";
import { reviewFieldId, type ReviewToothFinding } from "@/lib/encounters/review";
import { cn } from "@/lib/utils";

const FINDING_OPTIONS: ReadonlyArray<{
  value: ReviewToothFinding["finding"];
  label: string;
}> = [
  { value: "caries", label: "Caries" },
  { value: "fracture", label: "Fracture" },
  { value: "wear", label: "Wear / erosion" },
  { value: "mobility", label: "Mobility" },
  { value: "periapical", label: "Periapical finding" },
  { value: "impacted", label: "Impacted" },
  { value: "missing", label: "Missing" },
  { value: "restoration", label: "Existing restoration" },
  { value: "crown", label: "Existing crown" },
  { value: "implant", label: "Implant" },
  { value: "root_canal", label: "Root canal treated" },
  { value: "sealant", label: "Sealant" },
  { value: "sound", label: "Examined and sound" },
  { value: "other", label: "Other finding" },
];

const EMPTY_FINDING: ReviewToothFinding = {
  finding: "caries",
  tooth_spoken: null,
  surfaces_spoken: null,
  tooth_fdi: null,
  surfaces: [],
  state: "existing",
  severity: null,
  note: null,
  resolved: true,
};

export function ToothFindingEditor({
  value,
  onChange,
  status,
  relatedTeeth = [],
  flaggedKeys = new Set<string>(),
  reviewedKeys = new Set<string>(),
  onFieldChange,
  title = "Dental chart & findings",
  description = "Tap a tooth, then record exactly what you observed.",
}: {
  value: ReviewToothFinding[];
  onChange: (next: ReviewToothFinding[]) => void;
  status?: ReadonlyMap<number, ToothStatus>;
  relatedTeeth?: readonly number[];
  flaggedKeys?: ReadonlySet<string>;
  reviewedKeys?: ReadonlySet<string>;
  onFieldChange?: (key: string) => void;
  title?: string;
  description?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(value.length ? 0 : null);
  const visibleActiveIndex = value.length === 0
    ? null
    : activeIndex == null
      ? 0
      : Math.min(activeIndex, value.length - 1);

  const selectedTeeth = [...new Set([
    ...relatedTeeth.filter(isFdiTooth),
    ...value.map((finding) => finding.tooth_fdi).filter((tooth): tooth is number =>
      typeof tooth === "number" && isFdiTooth(tooth),
    ),
  ])];

  function addFinding(toothFdi: number | null = null) {
    const next = [
      ...value,
      {
        ...EMPTY_FINDING,
        tooth_fdi: toothFdi,
        tooth_spoken: toothFdi == null ? null : String(toothFdi),
      },
    ];
    onChange(next);
    setActiveIndex(next.length - 1);
  }

  function selectTooth(toothFdi: number) {
    const existingIndex = value.findIndex((finding) => finding.tooth_fdi === toothFdi);
    if (existingIndex >= 0) {
      setActiveIndex(existingIndex);
      return;
    }

    if (visibleActiveIndex != null && value[visibleActiveIndex]?.tooth_fdi == null) {
      update(visibleActiveIndex, {
        tooth_fdi: toothFdi,
        tooth_spoken: String(toothFdi),
      }, "tooth_fdi");
      return;
    }

    addFinding(toothFdi);
  }

  function update(
    index: number,
    patch: Partial<ReviewToothFinding>,
    field: keyof ReviewToothFinding,
  ) {
    onChange(value.map((finding, findingIndex) =>
      findingIndex === index ? { ...finding, ...patch, resolved: true } : finding,
    ));
    onFieldChange?.(`tooth_findings.${index}.${String(field)}`);
  }

  function remove(index: number) {
    onChange(value.filter((_, findingIndex) => findingIndex !== index));
    setActiveIndex((current) => {
      if (current == null) return null;
      if (current > index) return current - 1;
      if (current === index) return value.length > 1 ? Math.max(0, index - 1) : null;
      return current;
    });
  }

  function toggleSurface(index: number, surface: string) {
    const current = value[index]?.surfaces ?? [];
    const next = current.includes(surface)
      ? current.filter((item) => item !== surface)
      : sortSurfaces([...current, surface]);
    update(index, { surfaces: next, surfaces_spoken: next.join("") || null }, "surfaces");
  }

  const active = visibleActiveIndex == null ? null : value[visibleActiveIndex] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.015em]">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => addFinding()}>
          <Plus className="size-3.5" aria-hidden />
          Add finding
        </Button>
      </div>

      <ToothChart
        selected={selectedTeeth}
        status={status}
        onToggle={selectTooth}
        label="Select a tooth to chart a finding"
      />

      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center">
          <p className="text-sm font-medium">No tooth findings entered</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The chart starts clean. Tap a tooth only when you have an observation to record.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <div className="space-y-2" aria-label="Findings in this visit">
            {value.map((finding, index) => {
              const unresolved = finding.tooth_fdi == null;
              return (
                <button
                  key={`${finding.tooth_fdi ?? "unresolved"}-${index}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                    visibleActiveIndex === index
                      ? "border-primary/35 bg-primary-soft"
                      : "border-border bg-card hover:border-primary/25",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <strong className="text-sm">
                      {finding.tooth_fdi ?? "Choose tooth"}
                    </strong>
                    {unresolved && <TriangleAlertIcon className="size-3.5 text-warning" aria-hidden />}
                  </span>
                  <span className="mt-0.5 block truncate text-xs capitalize text-muted-foreground">
                    {finding.finding.replaceAll("_", " ")}
                  </span>
                </button>
              );
            })}
          </div>

          {active && visibleActiveIndex != null && (
            <FindingForm
              finding={active}
              index={visibleActiveIndex}
              flaggedKeys={flaggedKeys}
              reviewedKeys={reviewedKeys}
              onUpdate={update}
              onToggleSurface={toggleSurface}
              onRemove={() => remove(visibleActiveIndex)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FindingForm({
  finding,
  index,
  flaggedKeys,
  reviewedKeys,
  onUpdate,
  onToggleSurface,
  onRemove,
}: {
  finding: ReviewToothFinding;
  index: number;
  flaggedKeys: ReadonlySet<string>;
  reviewedKeys: ReadonlySet<string>;
  onUpdate: (
    index: number,
    patch: Partial<ReviewToothFinding>,
    field: keyof ReviewToothFinding,
  ) => void;
  onToggleSurface: (index: number, surface: string) => void;
  onRemove: () => void;
}) {
  const prefix = `tooth_findings.${index}`;
  const toothFlagged = flaggedKeys.has(`${prefix}.tooth_fdi`);

  return (
    <div className="surface-inset space-y-4 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {finding.tooth_fdi != null && isFdiTooth(finding.tooth_fdi)
              ? `${finding.tooth_fdi} · ${toothLabel(finding.tooth_fdi)}`
              : "Choose a tooth on the chart"}
          </p>
          {finding.tooth_spoken && finding.tooth_spoken !== String(finding.tooth_fdi ?? "") && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Heard: &ldquo;{finding.tooth_spoken}&rdquo;
            </p>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove}>
          <Trash2 className="size-3.5" aria-hidden />
          <span className="sr-only">Remove finding</span>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FindingField label="FDI tooth" flagged={toothFlagged} reviewed={reviewedKeys.has(`${prefix}.tooth_fdi`)}>
          <Input
            id={reviewFieldId(`${prefix}.tooth_fdi`)}
            value={finding.tooth_fdi ?? ""}
            inputMode="numeric"
            placeholder="e.g. 36"
            onChange={(event) => {
              const raw = event.target.value.trim();
              const parsed = Number(raw);
              const tooth = raw && isFdiTooth(parsed) ? parsed : null;
              onUpdate(index, { tooth_fdi: tooth, tooth_spoken: raw || null }, "tooth_fdi");
            }}
          />
        </FindingField>

        <FindingField label="Finding">
          <Select
            value={finding.finding}
            onChange={(event) => onUpdate(index, {
              finding: event.target.value as ReviewToothFinding["finding"],
            }, "finding")}
          >
            {FINDING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </FindingField>

        <FindingField label="Clinical status">
          <Select
            value={finding.state}
            onChange={(event) => onUpdate(index, {
              state: event.target.value as ReviewToothFinding["state"],
            }, "state")}
          >
            <option value="existing">Present now</option>
            <option value="planned">Planned care</option>
            <option value="completed">Completed</option>
            <option value="resolved">Resolved</option>
          </Select>
        </FindingField>

        <FindingField label="Severity">
          <Select
            value={finding.severity ?? ""}
            onChange={(event) => onUpdate(index, {
              severity: (event.target.value || null) as ReviewToothFinding["severity"],
            }, "severity")}
          >
            <option value="">Not graded</option>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </Select>
        </FindingField>
      </div>

      <div>
        <Label className="mb-1.5 flex text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Surfaces
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {SURFACE_ORDER.map((surface) => {
            const selected = (finding.surfaces ?? []).includes(surface);
            return (
              <Button
                key={surface}
                type="button"
                variant={selected ? "default" : "outline"}
                size="sm"
                aria-pressed={selected}
                title={SURFACE_NAMES[surface]}
                onClick={() => onToggleSurface(index, surface)}
              >
                {surface}
              </Button>
            );
          })}
        </div>
      </div>

      <FindingField label="Clinical detail">
        <Textarea
          value={finding.note ?? ""}
          onChange={(event) => onUpdate(index, { note: event.target.value || null }, "note")}
          rows={3}
          maxLength={1500}
          placeholder="Symptoms, extent, tests, radiographic note, or other detail"
          className="resize-none"
        />
      </FindingField>
    </div>
  );
}

function FindingField({
  label,
  flagged = false,
  reviewed = false,
  children,
}: {
  label: string;
  flagged?: boolean;
  reviewed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className={cn(
        "mb-1.5 flex text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground",
        flagged && !reviewed && "text-warning",
      )}>
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
