import { z } from "zod";

import { CONSTRAINT_TYPES, EVIDENCE_KINDS, MATERIALITIES, RECOVERY_RULES,
         type ConstraintType, type EvidenceKind, type Materiality } from "@/lib/genlayer/contract";
import { toAtto } from "@/lib/format/present";

/**
 * The create form's rules, mirroring the contract's own so a mistake shows
 * while typing instead of costing a transaction. The contract checks all of it
 * again: this is courtesy, never authority.
 */

export const LIMITS = {
  title: 120,
  terms: 4_000,
  requirement: 300,
  description: 400,
  label: 100,
  url: 400,
  text: 4_000,
  minConstraints: 1,
  maxConstraints: 12,
  maxEvidence: 24,
  minDeadlineAheadMinutes: 10,
  maxDeadlineAheadDays: 366,
  minRecoveryHours: 1,
  maxRecoveryDays: 90,
  minAmountAtto: 10n ** 15n,
  maxAmountAtto: 10n ** 24n,
} as const;

const ANGLE_RUN = /[<>]{3,}/;

export type DraftConstraint = {
  type: ConstraintType;
  requirement: string;
  description: string;
  materiality: Materiality;
  evidence_requirements: EvidenceKind[];
};

export type Draft = {
  title: string;
  counterparty: string;
  terms: string;
  deadline: number;             // unix seconds
  recoveryHours: string;
  constraints: DraftConstraint[];
  requiredKinds: EvidenceKind[];
  minOrigins: string;
  corroboration: boolean;
  economic: boolean;
  amount: string;               // GEN
  bond: string;                 // GEN
  fulfilledPct: string;
  partialPct: string;
  breachedPct: string;
  forfeitPct: string;
  recoveryRule: (typeof RECOVERY_RULES)[number];
};

export type Problems = Record<string, string>;

export const blankConstraint = (): DraftConstraint => ({
  type: "FACTUAL",
  requirement: "",
  description: "",
  materiality: "MATERIAL",
  evidence_requirements: ["WEB_SOURCE", "ATTESTATION"],
});

export const blankDraft = (now: number): Draft => ({
  title: "",
  counterparty: "",
  terms: "",
  deadline: now + 7 * 86_400,
  recoveryHours: "24",
  constraints: [],
  requiredKinds: ["WEB_SOURCE"],
  minOrigins: "1",
  corroboration: true,
  economic: false,
  amount: "0",
  bond: "0",
  fulfilledPct: "100",
  partialPct: "50",
  breachedPct: "0",
  forfeitPct: "0",
  recoveryRule: "REFUND_CREATOR",
});

function line(value: string, limit: number, what: string, required = true): string | null {
  const s = value.replace(/\s+/g, " ").trim();
  if (required && !s) return `${what} is required.`;
  if (s.length > limit) return `${what} is longer than ${limit} characters.`;
  if (ANGLE_RUN.test(s)) return `${what} cannot contain three angle brackets in a row.`;
  return null;
}

const pct = (value: string): number | null =>
  /^\d{1,3}(\.\d)?$/.test(value.trim()) && Number(value) <= 100 ? Number(value) : null;

export function validateDraft(d: Draft, now: number): Problems {
  const p: Problems = {};

  const title = line(d.title, LIMITS.title, "The title");
  if (title) p.title = title;

  const terms = d.terms.trim();
  if (!terms) p.terms = "The agreement's own words are required.";
  else if (terms.length > LIMITS.terms) p.terms = `At most ${LIMITS.terms} characters.`;
  else if (ANGLE_RUN.test(terms)) p.terms = "The text cannot contain three angle brackets in a row.";

  if (!/^0x[0-9a-fA-F]{40}$/.test(d.counterparty.trim())) {
    p.counterparty = "Enter the counterparty's account address.";
  }

  if (d.constraints.length < LIMITS.minConstraints || d.constraints.length > LIMITS.maxConstraints) {
    p.constraints = `Lock between ${LIMITS.minConstraints} and ${LIMITS.maxConstraints} requirements.`;
  }
  const seen = new Set<string>();
  d.constraints.forEach((c, i) => {
    const requirement = line(c.requirement, LIMITS.requirement, "The requirement");
    if (requirement) p[`constraints.${i}.requirement`] = requirement;
    const key = c.requirement.replace(/\s+/g, " ").trim().toLowerCase();
    if (key && seen.has(key)) p[`constraints.${i}.requirement`] = "This repeats an earlier requirement.";
    if (key) seen.add(key);
    const description = line(c.description, LIMITS.description, "The note", false);
    if (description) p[`constraints.${i}.description`] = description;
    if (!CONSTRAINT_TYPES.includes(c.type)) p[`constraints.${i}.type`] = "Choose a requirement type.";
    if (!MATERIALITIES.includes(c.materiality)) p[`constraints.${i}.materiality`] = "Choose a materiality.";
    if (!c.evidence_requirements.length) {
      p[`constraints.${i}.evidence`] = "Name at least one kind of evidence that may support it.";
    }
  });

  const ahead = d.deadline - now;
  if (ahead < LIMITS.minDeadlineAheadMinutes * 60) {
    p.deadline = `The deadline must be at least ${LIMITS.minDeadlineAheadMinutes} minutes ahead, and `
      + "it is checked again when you lock.";
  } else if (ahead > LIMITS.maxDeadlineAheadDays * 86_400) {
    p.deadline = `The deadline must be within ${LIMITS.maxDeadlineAheadDays} days.`;
  }

  const hours = Number(d.recoveryHours);
  if (!/^\d+(\.\d+)?$/.test(d.recoveryHours.trim()) || hours < LIMITS.minRecoveryHours
      || hours > LIMITS.maxRecoveryDays * 24) {
    p.recovery = `Between ${LIMITS.minRecoveryHours} hour and ${LIMITS.maxRecoveryDays} days.`;
  }

  if (!d.requiredKinds.length) p.requiredKinds = "Name at least one kind of evidence the policy needs.";
  const origins = Number(d.minOrigins);
  if (!/^\d$/.test(d.minOrigins.trim()) || origins > 6) p.minOrigins = "Between 0 and 6 publishers.";

  if (d.economic) {
    const amount = toAtto(d.amount);
    const bond = toAtto(d.bond);
    if (amount === null) p.amount = "Enter an amount in GEN, or 0.";
    if (bond === null) p.bond = "Enter a bond in GEN, or 0.";
    if (amount !== null && bond !== null) {
      if (amount === 0n && bond === 0n) p.amount = "An economic consequence needs an amount, a bond, or both.";
      for (const [key, value] of [["amount", amount], ["bond", bond]] as const) {
        if (value > 0n && (value < LIMITS.minAmountAtto || value > LIMITS.maxAmountAtto)) {
          p[key] = "Between 0.001 and 1,000,000 GEN.";
        }
      }
    }
    const fulfilled = pct(d.fulfilledPct), partial = pct(d.partialPct), breached = pct(d.breachedPct);
    const forfeit = pct(d.forfeitPct);
    if (fulfilled === null) p.fulfilledPct = "A share between 0 and 100.";
    if (partial === null) p.partialPct = "A share between 0 and 100.";
    if (breached === null) p.breachedPct = "A share between 0 and 100.";
    if (forfeit === null) p.forfeitPct = "A share between 0 and 100.";
    if (fulfilled !== null && partial !== null && partial > fulfilled) {
      p.partialPct = "A partial outcome cannot release more than a fulfilled one.";
    }
    if (partial !== null && breached !== null && breached > partial) {
      p.breachedPct = "A breach cannot release more than a partial outcome.";
    }
  }

  return p;
}

const bps = (percent: string) => Math.round(Number(percent) * 100);

/** The definition exactly as the contract will parse it. */
export function definitionFrom(d: Draft): string {
  return JSON.stringify({
    constraints: d.constraints.map((c) => ({
      type: c.type,
      requirement: c.requirement.replace(/\s+/g, " ").trim(),
      description: c.description.replace(/\s+/g, " ").trim(),
      materiality: c.materiality,
      evidence_requirements: [...c.evidence_requirements].sort(),
    })),
    evidence_policy: {
      min_independent_origins: Number(d.minOrigins),
      required_kinds: [...d.requiredKinds].sort(),
      corroboration_required: d.corroboration,
    },
    consequence_policy: d.economic
      ? {
          economic: true,
          amount_required: Number(toAtto(d.amount) ?? 0n),
          bond_required: Number(toAtto(d.bond) ?? 0n),
          fulfilled_bps: bps(d.fulfilledPct),
          partially_fulfilled_bps: bps(d.partialPct),
          breached_bps: bps(d.breachedPct),
          bond_forfeit_bps: bps(d.forfeitPct),
          recovery_rule: d.recoveryRule,
        }
      : { economic: false },
    deadline: d.deadline,
    recovery_window: Math.round(Number(d.recoveryHours) * 3600),
  });
}

// ── evidence ────────────────────────────────────────────────────────────────

export type EvidenceDraft = {
  kind: EvidenceKind;
  source: string;
  text: string;
  label: string;
  sourceType: string;
  period: string;
  claim: string;
  constraints: string[];
};

export const blankEvidence = (): EvidenceDraft => ({
  kind: "WEB_SOURCE", source: "", text: "", label: "", sourceType: "", period: "", claim: "",
  constraints: [],
});

export function validateEvidence(e: EvidenceDraft): Problems {
  const p: Problems = {};
  if (!e.constraints.length) p.constraints = "Name at least one requirement this evidence speaks to.";
  const label = line(e.label, LIMITS.label, "The label", false);
  if (label) p.label = label;
  if (e.kind === "WEB_SOURCE") {
    const url = e.source.trim();
    if (!url) p.source = "Enter the address the validators should fetch.";
    else if (url.length > LIMITS.url) p.source = `At most ${LIMITS.url} characters.`;
    else if (!url.toLowerCase().startsWith("https://")) p.source = "Use an https address.";
    else {
      const host = url.split("://")[1]?.split("/")[0]?.split("?")[0]?.split("#")[0]?.split(":")[0] ?? "";
      if (!host || !host.includes(".") || /\s/.test(url) || url.split("://")[1]?.split("/")[0]?.includes("@")) {
        p.source = "This is not a valid address.";
      } else if (host.endsWith(".") || host.includes("..") || host.startsWith(".")) {
        p.source = "Remove the trailing or doubled dot from the host.";
      } else if (!/^[\x00-\x7f]*$/.test(host)) {
        p.source = "Give an internationalized host in its xn-- form.";
      } else if (/^[0-9.]+$/.test(host)) {
        p.source = "Name a host, not an IP address.";
      }
    }
  } else {
    const text = e.text.trim();
    if (!text) p.text = "Write what you are attesting to.";
    else if (text.length > LIMITS.text) p.text = `At most ${LIMITS.text} characters.`;
    else if (ANGLE_RUN.test(text)) p.text = "The text cannot contain three angle brackets in a row.";
  }
  return p;
}

export function evidenceFrom(e: EvidenceDraft): string {
  const row: Record<string, unknown> = {
    kind: e.kind,
    related_constraints: [...e.constraints].sort(),
    label: e.label.replace(/\s+/g, " ").trim(),
    source_type: e.sourceType.replace(/\s+/g, " ").trim(),
    observation_period: e.period.replace(/\s+/g, " ").trim(),
    related_claim: e.claim.replace(/\s+/g, " ").trim(),
  };
  if (e.kind === "WEB_SOURCE") row.source = e.source.trim();
  else row.text = e.text.trim();
  return JSON.stringify(row);
}

/** The publisher an address belongs to, decided the way the contract decides it. */
export function originOf(url: string): string {
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    const path = parsed.pathname.split("/").filter(Boolean);
    if (host.endsWith(".github.io")) return `github:${host.slice(0, -".github.io".length)}`;
    const platforms: Record<string, number> = {
      "github.com": 0, "raw.githubusercontent.com": 0, "gist.github.com": 0,
      "gist.githubusercontent.com": 0, "gitlab.com": 0, "huggingface.co": 0, "medium.com": 0,
    };
    if (host in platforms && path.length > platforms[host]!) {
      const family = host.includes("github") ? "github" : host.split(".")[0];
      return `${family}:${path[platforms[host]!]!.toLowerCase()}`;
    }
    const labels = host.split(".");
    const second = ["co", "com", "org", "net", "gov", "ac", "edu"];
    if (labels.length >= 3 && second.includes(labels[labels.length - 2]!)
        && labels[labels.length - 1]!.length === 2) {
      return labels.slice(-3).join(".");
    }
    return labels.length >= 2 ? labels.slice(-2).join(".") : host;
  } catch {
    return "";
  }
}

export const evidenceSchemaForTests = z.object({ kind: z.enum(EVIDENCE_KINDS) });
