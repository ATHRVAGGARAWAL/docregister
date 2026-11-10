import { CheckIcon } from "@/components/icons";

export function VisitProgress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="visit-steps" aria-label="Visit progress">
      {["Patient", "Clinical note", "Review & confirm"].map((label, index) => (
        <li key={label} aria-current={step === index + 1 ? "step" : undefined}>
          <span>
            {step > index + 1 ? (
              <CheckIcon className="size-3" aria-hidden />
            ) : (
              index + 1
            )}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}
