"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewMedication } from "@/lib/encounters/review";
import { reviewFieldId } from "@/lib/encounters/review";
import { cn } from "@/lib/utils";

const EMPTY_MEDICATION: ReviewMedication = {
  drug_name: "",
  strength: null,
  form: null,
  route: null,
  frequency_spoken: null,
  duration: null,
  instructions: null,
};

export function MedicationEditor({
  value,
  onChange,
  flaggedKeys = new Set<string>(),
  reviewedKeys = new Set<string>(),
  onFieldChange,
}: {
  value: ReviewMedication[];
  onChange: (next: ReviewMedication[]) => void;
  flaggedKeys?: ReadonlySet<string>;
  reviewedKeys?: ReadonlySet<string>;
  onFieldChange?: (key: string) => void;
}) {
  const datalistId = useId();

  function update(index: number, field: keyof ReviewMedication, nextValue: string) {
    onChange(
      value.map((medicine, medicineIndex) =>
        medicineIndex === index
          ? { ...medicine, [field]: field === "drug_name" ? nextValue : nextValue || null }
          : medicine,
      ),
    );
    onFieldChange?.(`prescription.${index}.${field}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Medicines
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([...value, { ...EMPTY_MEDICATION }])}
          className="rounded-xl text-primary hover:bg-primary/10 hover:text-primary"
        >
          <Plus className="size-3" aria-hidden /> Add medicine
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="glass-inset mt-2 rounded-xl border-white/8 bg-background/20 px-3 py-5 text-center text-xs text-muted-foreground">
          No medicines added.
        </p>
      ) : (
        <ol className="mt-2 space-y-3">
          {value.map((medicine, index) => {
            const prefix = `prescription.${index}`;
            return (
              <li
                key={index}
                className="glass-card relative overflow-hidden rounded-2xl border-white/8 bg-card/30 p-3.5 [&_[data-slot=input]]:rounded-xl [&_[data-slot=input]]:bg-background/25 [&_[data-slot=textarea]]:rounded-xl [&_[data-slot=textarea]]:bg-background/25"
              >
                <div className="pointer-events-none absolute -right-12 -top-14 size-32 rounded-full bg-primary/8 blur-3xl" aria-hidden />
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="relative flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="tnum grid size-6 place-items-center rounded-lg bg-primary/10 text-[0.625rem] text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    Medicine
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                    className="relative rounded-xl hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    <span className="sr-only">Remove {medicine.drug_name || `medicine ${index + 1}`}</span>
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MedicationField
                    label="Drug name"
                    fieldKey={`${prefix}.drug_name`}
                    flaggedKeys={flaggedKeys}
                    reviewedKeys={reviewedKeys}
                  >
                    <Input
                      id={reviewFieldId(`${prefix}.drug_name`)}
                      value={medicine.drug_name}
                      onChange={(event) => update(index, "drug_name", event.target.value)}
                      placeholder="e.g. Dolo"
                      autoComplete="off"
                    />
                  </MedicationField>

                  <MedicationField
                    label="Strength"
                    fieldKey={`${prefix}.strength`}
                    flaggedKeys={flaggedKeys}
                    reviewedKeys={reviewedKeys}
                  >
                    <Input
                      id={reviewFieldId(`${prefix}.strength`)}
                      value={medicine.strength ?? ""}
                      onChange={(event) => update(index, "strength", event.target.value)}
                      placeholder="e.g. 650 mg"
                      autoComplete="off"
                    />
                  </MedicationField>

                  <MedicationField
                    label="Form"
                    fieldKey={`${prefix}.form`}
                    flaggedKeys={flaggedKeys}
                    reviewedKeys={reviewedKeys}
                  >
                    <Input
                      id={reviewFieldId(`${prefix}.form`)}
                      list={`${datalistId}-forms`}
                      value={medicine.form ?? ""}
                      onChange={(event) => update(index, "form", event.target.value)}
                      placeholder="Tablet, syrup…"
                      autoComplete="off"
                    />
                  </MedicationField>

                  <MedicationField
                    label="Route"
                    fieldKey={`${prefix}.route`}
                    flaggedKeys={flaggedKeys}
                    reviewedKeys={reviewedKeys}
                  >
                    <Input
                      id={reviewFieldId(`${prefix}.route`)}
                      list={`${datalistId}-routes`}
                      value={medicine.route ?? ""}
                      onChange={(event) => update(index, "route", event.target.value)}
                      placeholder="PO, topical, IV…"
                      autoComplete="off"
                    />
                  </MedicationField>

                  <MedicationField
                    label="Frequency"
                    fieldKey={`${prefix}.frequency_spoken`}
                    flaggedKeys={flaggedKeys}
                    reviewedKeys={reviewedKeys}
                  >
                    <Input
                      id={reviewFieldId(`${prefix}.frequency_spoken`)}
                      value={medicine.frequency_spoken ?? ""}
                      onChange={(event) => update(index, "frequency_spoken", event.target.value)}
                      placeholder="BD, 1-0-1, SOS…"
                      autoComplete="off"
                    />
                  </MedicationField>

                  <MedicationField
                    label="Duration"
                    fieldKey={`${prefix}.duration`}
                    flaggedKeys={flaggedKeys}
                    reviewedKeys={reviewedKeys}
                  >
                    <Input
                      id={reviewFieldId(`${prefix}.duration`)}
                      value={medicine.duration ?? ""}
                      onChange={(event) => update(index, "duration", event.target.value)}
                      placeholder="e.g. 5 days"
                      autoComplete="off"
                    />
                  </MedicationField>
                </div>

                <MedicationField
                  label="Instructions"
                  fieldKey={`${prefix}.instructions`}
                  flaggedKeys={flaggedKeys}
                  reviewedKeys={reviewedKeys}
                  className="mt-3"
                >
                  <Textarea
                    id={reviewFieldId(`${prefix}.instructions`)}
                    value={medicine.instructions ?? ""}
                    onChange={(event) => update(index, "instructions", event.target.value)}
                    placeholder="After food, at bedtime…"
                    rows={2}
                    className="resize-none"
                  />
                </MedicationField>
              </li>
            );
          })}
        </ol>
      )}

      <datalist id={`${datalistId}-forms`}>
        <option value="tablet" />
        <option value="capsule" />
        <option value="syrup" />
        <option value="injection" />
        <option value="drops" />
        <option value="ointment" />
        <option value="cream" />
        <option value="inhaler" />
      </datalist>
      <datalist id={`${datalistId}-routes`}>
        <option value="PO" />
        <option value="topical" />
        <option value="inhalation" />
        <option value="IV" />
        <option value="IM" />
        <option value="SC" />
        <option value="ophthalmic" />
        <option value="otic" />
        <option value="nasal" />
      </datalist>
    </div>
  );
}

function MedicationField({
  label,
  fieldKey,
  flaggedKeys,
  reviewedKeys,
  className,
  children,
}: {
  label: string;
  fieldKey: string;
  flaggedKeys: ReadonlySet<string>;
  reviewedKeys: ReadonlySet<string>;
  className?: string;
  children: React.ReactNode;
}) {
  const flagged = flaggedKeys.has(fieldKey);
  const reviewed = reviewedKeys.has(fieldKey);

  return (
    <div className={className}>
      <Label
        htmlFor={reviewFieldId(fieldKey)}
        className={cn(
          "mb-1.5 flex text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
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
