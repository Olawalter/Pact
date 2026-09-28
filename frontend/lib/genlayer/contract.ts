import { z } from "zod";

import type { AppConfig } from "@/lib/genlayer/config";
import type { GenLayerClient } from "@/lib/genlayer/client";

/**
 * The app's view of the deployed contract. Every call is named here once, with
 * the parameters the deployed schema declares, and every answer is parsed
 * before it reaches a page: a record that does not match this shape is a bug to
 * surface, never something to render half of.
 */

// ── the shapes the contract returns ─────────────────────────────────────────

export const LIFECYCLE = ["DRAFT", "CONSTRAINTS_REVIEW", "LOCKED", "ACTIVE", "ADJUDICATION_PENDING",
                          "VERDICT_PROPOSED", "FINALIZED", "CONSEQUENCE_EXECUTED", "CANCELLED"] as const;
export const RESULT_STATES = ["FULFILLED", "PARTIALLY_FULFILLED", "BREACHED", "INCONCLUSIVE"] as const;
export const CONSTRAINT_STATUSES = ["SATISFIED", "VIOLATED", "INCONCLUSIVE", "NOT_APPLICABLE"] as const;
export const CONSTRAINT_TYPES = ["FACTUAL", "TEMPORAL", "THRESHOLD", "QUALITY", "EXCLUSION",
                                 "COMPOSITE"] as const;
export const MATERIALITIES = ["MATERIAL", "MINOR"] as const;
export const EVIDENCE_KINDS = ["WEB_SOURCE", "ATTESTATION"] as const;
export const AVAILABILITY = ["AVAILABLE", "MISSING", "UNAVAILABLE", "SUBMITTED"] as const;
export const CORROBORATION = ["INDEPENDENT", "BILATERAL", "NONE"] as const;
export const RECOVERY_RULES = ["REFUND_CREATOR", "SPLIT_EVENLY", "RELEASE_COUNTERPARTY"] as const;

export type Lifecycle = (typeof LIFECYCLE)[number];
export type ResultState = (typeof RESULT_STATES)[number];
export type ConstraintStatus = (typeof CONSTRAINT_STATUSES)[number];
export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];
export type Materiality = (typeof MATERIALITIES)[number];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

const atto = z.string().regex(/^\d+$/);
// a GenLayer calldata answer carries large integers as strings, small ones as
// numbers, so any amount inside the locked definition may arrive either way
const amount = z.union([z.number(), z.string().regex(/^\d+$/)]).transform(String);

export const constraintSchema = z.object({
  id: z.string(),
  type: z.enum(CONSTRAINT_TYPES),
  requirement: z.string(),
  description: z.string(),
  materiality: z.enum(MATERIALITIES),
  evidence_requirements: z.array(z.enum(EVIDENCE_KINDS)),
});

export const definitionSchema = z.object({
  constraints: z.array(constraintSchema),
  evidence_policy: z.object({
    min_independent_origins: z.number(),
    required_kinds: z.array(z.enum(EVIDENCE_KINDS)),
    corroboration_required: z.boolean(),
  }),
  consequence_policy: z.object({
    economic: z.boolean(),
    amount_required: amount,
    bond_required: amount,
    fulfilled_bps: z.number(),
    partially_fulfilled_bps: z.number(),
    breached_bps: z.number(),
    bond_forfeit_bps: z.number(),
    recovery_rule: z.enum(RECOVERY_RULES),
  }),
  deadline: z.number(),
  recovery_window: z.number(),
  policy_rules: z.string(),
});

export const agreementSchema = z.object({
  agreement_id: z.string(),
  title: z.string(),
  terms: z.string(),
  creator: z.string(),
  counterparty: z.string(),
  lifecycle: z.enum(LIFECYCLE),
  result_state: z.union([z.enum(RESULT_STATES), z.literal("NONE")]),
  fingerprint: z.string(),
  economic: z.boolean(),
  amount_required: atto,
  amount_deposited: atto,
  bond_required: atto,
  bond_deposited: atto,
  deadline: z.number(),
  recovery_window: z.number(),
  created_at: z.number(),
  locked_at: z.number(),
  updated_at: z.number(),
  evidence_count: z.number(),
  round_count: z.number(),
  last_round_at: z.number(),
  latest_verdict_id: z.string(),
  settled_at: z.number(),
  paid_creator: atto,
  paid_counterparty: atto,
  definition: definitionSchema.nullable(),
});

export const evidenceSchema = z.object({
  evidence_id: z.string(),
  kind: z.enum(EVIDENCE_KINDS),
  submitter: z.string(),
  label: z.string(),
  source_type: z.string(),
  observation_period: z.string(),
  related_claim: z.string(),
  related_constraints: z.array(z.string()),
  submitted_at: z.number(),
  acknowledged_by: z.string(),
  source: z.string(),
  normalized: z.string(),
  origin: z.string(),
  text: z.string(),
});

export const findingSchema = z.object({
  id: z.string(),
  status: z.enum(CONSTRAINT_STATUSES),
  effective_status: z.enum(CONSTRAINT_STATUSES),
  corroboration: z.enum(CORROBORATION),
  evidence_ids: z.array(z.string()),
  quote: z.string(),
  quote_evidence_id: z.string(),
  note: z.string().optional().default(""),
});

export const verdictSchema = z.object({
  verdict_id: z.string(),
  agreement_id: z.string(),
  round: z.number(),
  status: z.enum(["VERDICT_PROPOSED", "FINALIZED"]),
  proposed_at: z.number(),
  finalized_at: z.number(),
  fingerprint: z.string(),
  policy_rules: z.string(),
  agreement_state: z.enum(RESULT_STATES),
  materiality: z.enum(MATERIALITIES),
  held_for_corroboration: z.array(z.string()),
  summary: z.string(),
  findings: z.array(findingSchema),
  evidence: z.array(z.object({
    evidence_id: z.string(),
    availability: z.enum(AVAILABILITY),
    origin: z.string(),
    excerpt_digest: z.string(),
    observed_at: z.number(),
  })),
});

export const transitionSchema = z.object({
  agreement_id: z.string(),
  from: z.string(),
  to: z.string(),
  result_state: z.string(),
  at: z.number(),
  note: z.string(),
});

export const proposalSchema = z.object({
  agreement_id: z.string(),
  proposed_at: z.number(),
  advisory: z.boolean().optional().default(true),
  constraints: z.array(z.object({
    type: z.enum(CONSTRAINT_TYPES),
    requirement: z.string(),
    materiality: z.enum(MATERIALITIES),
    description: z.string().optional().default(""),
  })),
});

export type Agreement = z.infer<typeof agreementSchema>;
export type AgreementDefinition = z.infer<typeof definitionSchema>;
export type Constraint = z.infer<typeof constraintSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type Proposal = z.infer<typeof proposalSchema>;

const page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ total: z.number(), items: z.array(item) });

/** Parse an answer, or say which call returned something this app cannot render. */
export function checkAnswer<T>(schema: z.ZodType<T>, value: unknown, call: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `${call} returned a record this interface does not recognise` +
      (first ? ` (${first.path.join(".") || "root"}: ${first.message})` : "") +
      ". The configured contract may not be PACT, or may be a different version.",
    );
  }
  return parsed.data;
}

// ── the calls, pinned to the deployed schema ────────────────────────────────

export const REQUIRED_METHODS: Record<string, string[]> = {
  create_agreement: ["title", "terms", "counterparty"],
  propose_constraints: ["agreement_id"],
  lock_agreement: ["agreement_id", "definition_json"],
  fund_agreement: ["agreement_id"],
  cancel_agreement: ["agreement_id"],
  submit_evidence: ["agreement_id", "evidence_json"],
  acknowledge_evidence: ["agreement_id", "evidence_id"],
  request_adjudication: ["agreement_id"],
  finalize_verdict: ["agreement_id"],
  execute_consequence: ["agreement_id"],
  recover: ["agreement_id"],
  get_protocol_info: [],
  get_agreement: ["agreement_id"],
  get_proposal: ["agreement_id"],
  list_agreements: ["offset", "limit"],
  list_by_party: ["party", "offset", "limit"],
  get_evidence: ["agreement_id", "evidence_id"],
  list_evidence: ["agreement_id", "offset", "limit"],
  get_verdict: ["agreement_id", "round_index"],
  list_verdicts: ["agreement_id", "offset", "limit"],
  get_history: ["agreement_id", "offset", "limit"],
  list_transitions: ["offset", "limit"],
};

/** The only method that may carry value. */
export const PAYABLE_METHODS = ["fund_agreement"] as const;

type SchemaShape = { methods?: Record<string, { params?: [string, string][]; payable?: boolean | null }> };

/** Compare the deployed schema with what this app calls. */
export function checkSchema(schema: unknown): string | null {
  const methods = (schema as SchemaShape | null)?.methods;
  if (!methods) return "No contract schema could be read from this address.";
  for (const [name, params] of Object.entries(REQUIRED_METHODS)) {
    const found = methods[name];
    if (!found) return `The contract at this address has no ${name} method.`;
    const actual = (found.params ?? []).map((p) => p[0]);
    if (actual.length !== params.length || actual.some((p, i) => p !== params[i])) {
      return `The ${name} method takes different parameters (${actual.join(", ") || "none"}).`;
    }
  }
  for (const [name, found] of Object.entries(methods)) {
    const payable = found?.payable === true;
    if (payable && !(PAYABLE_METHODS as readonly string[]).includes(name)) {
      return `The ${name} method accepts value, which this interface does not expect.`;
    }
  }
  return null;
}

export type Call = { functionName: string; args: (string | number | bigint)[]; value: bigint };

export const createCall = (title: string, terms: string, counterparty: string): Call =>
  ({ functionName: "create_agreement", args: [title, terms, counterparty], value: 0n });

export const lockCall = (id: string, definitionJson: string): Call =>
  ({ functionName: "lock_agreement", args: [id, definitionJson], value: 0n });

export const fundCall = (id: string, atto: bigint): Call =>
  ({ functionName: "fund_agreement", args: [id], value: atto });

export const evidenceCall = (id: string, evidenceJson: string): Call =>
  ({ functionName: "submit_evidence", args: [id, evidenceJson], value: 0n });

export const acknowledgeCall = (id: string, evidenceId: string): Call =>
  ({ functionName: "acknowledge_evidence", args: [id, evidenceId], value: 0n });

export type SimpleVerb = "propose_constraints" | "cancel_agreement" | "request_adjudication"
  | "finalize_verdict" | "execute_consequence" | "recover";

export const verbCall = (verb: SimpleVerb, id: string): Call =>
  ({ functionName: verb, args: [id], value: 0n });

// ── reads ───────────────────────────────────────────────────────────────────

const call = async <T>(client: GenLayerClient, config: AppConfig, functionName: string,
                       args: (string | number)[], schema: z.ZodType<T>): Promise<T> => {
  const value = await client.readContract({ address: config.contractAddress, functionName, args });
  return checkAnswer(schema, value, functionName);
};

export const reads = {
  protocol: (c: GenLayerClient, cfg: AppConfig) =>
    call(c, cfg, "get_protocol_info", [], z.object({
      protocol_version: z.string(), policy_rules: z.string(), agreement_count: z.number(),
      total_custody: atto, limits: z.record(z.string(), z.union([z.number(), z.string()])),
    }).passthrough()),
  agreement: (c: GenLayerClient, cfg: AppConfig, id: string) =>
    call(c, cfg, "get_agreement", [id], agreementSchema),
  agreements: (c: GenLayerClient, cfg: AppConfig, offset = 0, limit = 50) =>
    call(c, cfg, "list_agreements", [offset, limit], page(agreementSchema)),
  byParty: (c: GenLayerClient, cfg: AppConfig, party: string, offset = 0, limit = 50) =>
    call(c, cfg, "list_by_party", [party, offset, limit], page(agreementSchema)),
  evidence: (c: GenLayerClient, cfg: AppConfig, id: string, offset = 0, limit = 30) =>
    call(c, cfg, "list_evidence", [id, offset, limit], page(evidenceSchema)),
  verdicts: (c: GenLayerClient, cfg: AppConfig, id: string, offset = 0, limit = 10) =>
    call(c, cfg, "list_verdicts", [id, offset, limit], page(verdictSchema)),
  history: (c: GenLayerClient, cfg: AppConfig, id: string, offset = 0, limit = 30) =>
    call(c, cfg, "get_history", [id, offset, limit], page(transitionSchema)),
  transitions: (c: GenLayerClient, cfg: AppConfig, offset = 0, limit = 20) =>
    call(c, cfg, "list_transitions", [offset, limit], page(transitionSchema)),
  proposal: (c: GenLayerClient, cfg: AppConfig, id: string) =>
    call(c, cfg, "get_proposal", [id], proposalSchema),
};

/** Resolves true once the contract's own state shows a write. */
export const agreementChanged = (c: GenLayerClient, cfg: AppConfig, id: string,
                                 test: (a: Agreement) => boolean) =>
  async (): Promise<boolean> => test(await reads.agreement(c, cfg, id));

/** Resolves true once a new agreement of this creator appears. */
export const agreementCreated = (c: GenLayerClient, cfg: AppConfig, party: string, known: number) =>
  async (): Promise<boolean> => (await reads.byParty(c, cfg, party, 0, 1)).total > known;
