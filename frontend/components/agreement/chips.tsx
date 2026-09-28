import type { ConstraintStatus, Lifecycle, ResultState } from "@/lib/genlayer/contract";
import { AVAILABILITY_WORDS, CORROBORATION_WORDS, LIFECYCLE_WORDS, RESULT_WORDS,
         STATUS_WORDS } from "@/lib/format/present";

/**
 * Status, said in words and shown in a shape. Colour is never the only carrier:
 * every chip spells its state out.
 */

const tone = {
  good: "text-[var(--color-satisfied)]",
  bad: "text-[var(--color-violated)]",
  open: "text-[var(--color-open)]",
  quiet: "text-[var(--color-muted)]",
  deep: "text-[var(--color-deep)]",
} as const;

export function LifecycleChip({ state }: { state: Lifecycle }) {
  const colour = state === "CONSEQUENCE_EXECUTED" || state === "FINALIZED" ? tone.deep
    : state === "CANCELLED" ? tone.quiet
    : state === "ACTIVE" || state === "VERDICT_PROPOSED" ? tone.open : tone.quiet;
  return <span className={`chip ${colour}`}>{LIFECYCLE_WORDS[state]}</span>;
}

export function ResultChip({ state }: { state: ResultState | "NONE" }) {
  const colour = state === "FULFILLED" ? tone.good
    : state === "BREACHED" ? tone.bad
    : state === "PARTIALLY_FULFILLED" ? tone.open
    : state === "INCONCLUSIVE" ? tone.quiet : tone.quiet;
  return <span className={`chip ${colour}`}>{RESULT_WORDS[state]}</span>;
}

export function StatusMark({ status }: { status: ConstraintStatus }) {
  const glyph = status === "SATISFIED" ? "✓" : status === "VIOLATED" ? "✕"
    : status === "INCONCLUSIVE" ? "?" : "–";
  const colour = status === "SATISFIED" ? tone.good : status === "VIOLATED" ? tone.bad
    : status === "INCONCLUSIVE" ? tone.open : tone.quiet;
  return (
    <span className={`mono inline-flex h-5 w-5 shrink-0 items-center justify-center border
                      border-current text-xs ${colour}`}>
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{STATUS_WORDS[status]}</span>
    </span>
  );
}

export function CorroborationChip({ value }: { value: string }) {
  const colour = value === "INDEPENDENT" ? tone.good : value === "BILATERAL" ? tone.deep : tone.open;
  return <span className={`chip ${colour}`}>{CORROBORATION_WORDS[value] ?? value}</span>;
}

export function AvailabilityChip({ value }: { value: string }) {
  const colour = value === "AVAILABLE" ? tone.good : value === "SUBMITTED" ? tone.deep : tone.bad;
  return <span className={`chip ${colour}`}>{AVAILABILITY_WORDS[value] ?? value}</span>;
}
