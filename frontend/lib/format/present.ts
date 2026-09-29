import type { Agreement, ConstraintStatus, Evidence, Finding, Lifecycle, ResultState,
              Verdict } from "@/lib/genlayer/contract";

/**
 * Every word the interface says about contract state is decided here, so the
 * pages cannot invent their own vocabulary and no screen shows a raw enum, an
 * atto amount or a bare unix timestamp.
 */

export const LIFECYCLE_WORDS: Record<Lifecycle, string> = {
  DRAFT: "Draft",
  CONSTRAINTS_REVIEW: "Constraints in review",
  LOCKED: "Locked, awaiting funding",
  ACTIVE: "In force",
  ADJUDICATION_PENDING: "Adjudication requested",
  VERDICT_PROPOSED: "Verdict proposed",
  FINALIZED: "Finalized",
  CONSEQUENCE_EXECUTED: "Consequence executed",
  CANCELLED: "Cancelled",
};

export const RESULT_WORDS: Record<ResultState | "NONE", string> = {
  FULFILLED: "Fulfilled",
  PARTIALLY_FULFILLED: "Partially fulfilled",
  BREACHED: "Breached",
  INCONCLUSIVE: "Inconclusive",
  NONE: "Not yet adjudicated",
};

export const STATUS_WORDS: Record<ConstraintStatus, string> = {
  SATISFIED: "Satisfied",
  VIOLATED: "Violated",
  INCONCLUSIVE: "Inconclusive",
  NOT_APPLICABLE: "Not applicable",
};

export const CORROBORATION_WORDS: Record<string, string> = {
  INDEPENDENT: "Independent source",
  BILATERAL: "Both parties",
  NONE: "One party's word",
};

export const AVAILABILITY_WORDS: Record<string, string> = {
  AVAILABLE: "Read by the panel",
  MISSING: "Not there",
  UNAVAILABLE: "Could not be read",
  SUBMITTED: "Submitted by a party",
};

export const KIND_WORDS: Record<string, string> = {
  WEB_SOURCE: "Web source",
  ATTESTATION: "Attestation",
};

export const MATERIALITY_WORDS: Record<string, string> = {
  MATERIAL: "Material",
  MINOR: "Minor",
};

export const TYPE_WORDS: Record<string, string> = {
  FACTUAL: "Factual",
  TEMPORAL: "Timing",
  THRESHOLD: "Threshold",
  QUALITY: "Quality",
  EXCLUSION: "Exclusion",
  COMPOSITE: "Composite",
};

export const RECOVERY_WORDS: Record<string, string> = {
  REFUND_CREATOR: "the whole amount returns to the creator",
  SPLIT_EVENLY: "the amount is divided evenly",
  RELEASE_COUNTERPARTY: "the whole amount is released to the counterparty",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
                "September", "October", "November", "December"];

/** A date a person can read, always in UTC, never a bare number. */
export function formatTime(unix: number): string {
  if (!unix) return "not yet";
  const d = new Date(unix * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

export function formatRelative(unix: number, now: number): string {
  const seconds = unix - now;
  const ahead = seconds >= 0;
  const n = Math.abs(seconds);
  const unit = n < 90 ? [Math.round(n), "second"] as const
    : n < 5400 ? [Math.round(n / 60), "minute"] as const
    : n < 172800 ? [Math.round(n / 3600), "hour"] as const
    : [Math.round(n / 86400), "day"] as const;
  const plural = unit[0] === 1 ? "" : "s";
  return ahead ? `in ${unit[0]} ${unit[1]}${plural}` : `${unit[0]} ${unit[1]}${plural} ago`;
}

/** GEN, written the way a person would: never atto, never scientific notation. */
export function formatGen(atto: string | bigint): string {
  const value = typeof atto === "bigint" ? atto : BigInt(atto || "0");
  if (value === 0n) return "0 GEN";
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction.slice(0, 6)}` : ""} GEN`;
}

/**
 * A note the contract wrote, put into words a person reads.
 *
 * The contract records amounts in atto, because that is what it holds, and a
 * history line like "5000000000000000 to the counterparty" is a number nobody
 * can read at a glance. Every run of twelve or more digits is an amount, and is
 * shown as GEN.
 */
export const humaniseNote = (note: string): string =>
  (note || "").replace(/\b\d{12,}\b/g, (digits) => formatGen(digits));

export const toAtto = (gen: string): bigint | null => {
  const text = gen.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
};

export const shortHash = (hash: string) =>
  hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "";

export const agreementLabel = (id: string) => `PACT ${id.replace(/^A/, "#")}`;

/** What the finding means, in one sentence, without repeating the model's prose. */
export function findingWords(finding: Finding): string {
  const base = STATUS_WORDS[finding.effective_status];
  if (finding.status !== finding.effective_status) {
    return `${base}: the panel read ${STATUS_WORDS[finding.status].toLowerCase()}, and the agreement `
      + "asked for corroboration this evidence does not have.";
  }
  if (finding.effective_status === "INCONCLUSIVE" && finding.note) {
    return `Inconclusive: ${finding.note}.`;
  }
  return base;
}

export function verdictHeadline(verdict: Verdict): string {
  const satisfied = verdict.findings.filter((f) => f.effective_status === "SATISFIED").length;
  const applicable = verdict.findings.filter((f) => f.effective_status !== "NOT_APPLICABLE").length;
  return `${satisfied} of ${applicable} applicable requirement${applicable === 1 ? "" : "s"} satisfied`;
}

export function custodyWords(a: Agreement): string {
  if (!a.economic) return "No economic consequence was agreed.";
  const held = BigInt(a.amount_deposited) + BigInt(a.bond_deposited);
  if (held > 0n) return `${formatGen(held.toString())} held by the contract.`;
  if (a.settled_at) {
    return `Settled: ${formatGen(a.paid_counterparty)} to the counterparty, `
      + `${formatGen(a.paid_creator)} to the creator.`;
  }
  return "Nothing has been deposited yet.";
}

export const evidenceLabel = (e: Evidence) =>
  e.label || (e.kind === "WEB_SOURCE" ? e.origin : "Attestation");
