/**
 * What the interface offers, and what it refuses to offer. The rule is a pure
 * function of the record, the signer and the clock, so every state and both
 * sides of every boundary can be checked here, without a browser or a chain.
 * The live proof loads this same rule and asserts it against chain state.
 */
import { describe, expect, it } from "vitest";

import { actsFor, isSettled, partyOf, FINALITY_DELAY, MAX_ROUNDS,
         MIN_ROUND_INTERVAL } from "@/lib/genlayer/acts";
import type { Agreement, Verdict } from "@/lib/genlayer/contract";

const CREATOR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const AGENT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const STRANGER = "0xcccccccccccccccccccccccccccccccccccccccc";
const NOW = 1_800_000_000;

const agreement = (over: Partial<Agreement> = {}): Agreement => ({
  agreement_id: "A1", title: "t", terms: "x", creator: CREATOR, counterparty: AGENT,
  lifecycle: "ACTIVE", result_state: "NONE", fingerprint: "f", economic: true,
  amount_required: "100", amount_deposited: "100", bond_required: "50", bond_deposited: "50",
  deadline: NOW + 3600, recovery_window: 3600, created_at: NOW - 100, locked_at: NOW - 50,
  updated_at: NOW - 10, evidence_count: 2, round_count: 0, last_round_at: 0, latest_verdict_id: "",
  settled_at: 0, paid_creator: "0", paid_counterparty: "0", definition: null, ...over,
});

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  verdict_id: "A1-V0", agreement_id: "A1", round: 0, status: "VERDICT_PROPOSED",
  proposed_at: NOW - 60, finalized_at: 0, fingerprint: "f", policy_rules: "PACT-RULES-1",
  agreement_state: "FULFILLED", materiality: "MINOR", held_for_corroboration: [], summary: "s",
  findings: [], evidence: [], ...over,
});

const act = (a: Agreement, id: string, who?: string, now = NOW, v?: Verdict) =>
  actsFor(a, v, now, who).find((x) => x.id === id)!;

describe("who is who", () => {
  it("reads the signer's side from the record, never from a claim", () => {
    expect(partyOf(agreement(), CREATOR)).toBe("creator");
    expect(partyOf(agreement(), AGENT)).toBe("counterparty");
    expect(partyOf(agreement(), STRANGER)).toBe("");
    expect(partyOf(agreement(), undefined)).toBe("");
    expect(partyOf(agreement(), CREATOR.toUpperCase())).toBe("creator");
  });
});

describe("before the agreement is locked", () => {
  it("lets the creator propose and lock, and nobody else", () => {
    const draft = agreement({ lifecycle: "DRAFT", fingerprint: "", evidence_count: 0 });
    expect(act(draft, "propose_constraints", CREATOR).available).toBe(true);
    expect(act(draft, "lock_agreement", CREATOR).available).toBe(true);
    for (const who of [AGENT, STRANGER, undefined]) {
      expect(act(draft, "lock_agreement", who).available).toBe(false);
      expect(act(draft, "lock_agreement", who).reason).toMatch(/only the creator/i);
    }
  });

  it("offers neither once it is locked, and says why", () => {
    const locked = agreement({ lifecycle: "LOCKED" });
    expect(act(locked, "propose_constraints", CREATOR).available).toBe(false);
    expect(act(locked, "propose_constraints", CREATOR).reason).toMatch(/locked/i);
    expect(act(locked, "lock_agreement", CREATOR).reason).toMatch(/already locked/i);
  });
});

describe("funding", () => {
  it("asks each side for its own part, and only while the agreement is locked", () => {
    const owed = agreement({ lifecycle: "LOCKED", amount_deposited: "0", bond_deposited: "0" });
    expect(act(owed, "fund_agreement", CREATOR).available).toBe(true);
    expect(act(owed, "fund_agreement", CREATOR).label).toMatch(/amount/i);
    expect(act(owed, "fund_agreement", AGENT).available).toBe(true);
    expect(act(owed, "fund_agreement", AGENT).label).toMatch(/bond/i);
    expect(act(owed, "fund_agreement", STRANGER).available).toBe(false);
  });

  it("stops asking a side that has paid", () => {
    const half = agreement({ lifecycle: "LOCKED", amount_deposited: "100", bond_deposited: "0" });
    expect(act(half, "fund_agreement", CREATOR).available).toBe(false);
    expect(act(half, "fund_agreement", CREATOR).reason).toMatch(/your side is funded/i);
    expect(act(half, "fund_agreement", AGENT).available).toBe(true);
  });

  it("is not offered on an agreement with no economic consequence", () => {
    const plain = agreement({ economic: false, amount_required: "0", bond_required: "0" });
    expect(actsFor(plain, undefined, NOW, CREATOR).some((a) => a.id === "fund_agreement")).toBe(false);
  });
});

describe("evidence and adjudication", () => {
  it("takes evidence from either party while the agreement is in force", () => {
    expect(act(agreement(), "submit_evidence", CREATOR).available).toBe(true);
    expect(act(agreement(), "submit_evidence", AGENT).available).toBe(true);
    expect(act(agreement(), "submit_evidence", STRANGER).available).toBe(false);
    expect(act(agreement({ lifecycle: "LOCKED" }), "submit_evidence", CREATOR).reason)
      .toMatch(/in force/i);
  });

  it("needs evidence, a party, and the interval between rounds", () => {
    expect(act(agreement({ evidence_count: 0 }), "request_adjudication", CREATOR).reason)
      .toMatch(/no evidence/i);
    expect(act(agreement(), "request_adjudication", STRANGER).reason).toMatch(/only the two parties/i);

    const justRan = agreement({ last_round_at: NOW - 60, round_count: 1 });
    expect(act(justRan, "request_adjudication", CREATOR).available).toBe(false);
    expect(act(justRan, "request_adjudication", CREATOR).reason).toMatch(/next round/i);
    expect(act(justRan, "request_adjudication", CREATOR, NOW + MIN_ROUND_INTERVAL).available).toBe(true);
  });

  it("stops offering rounds once the agreement has used them all", () => {
    const spent = agreement({ round_count: MAX_ROUNDS, last_round_at: NOW - 10_000 });
    expect(act(spent, "request_adjudication", CREATOR).available).toBe(false);
    expect(act(spent, "request_adjudication", CREATOR).reason).toMatch(/all 4 adjudication rounds/i);
  });
});

describe("finality and the consequence", () => {
  it("waits out the contract's finality delay before offering to finalize", () => {
    const proposed = agreement({ lifecycle: "VERDICT_PROPOSED", round_count: 1 });
    const v = verdict({ proposed_at: NOW });
    expect(act(proposed, "finalize_verdict", STRANGER, NOW + 10, v).available).toBe(false);
    expect(act(proposed, "finalize_verdict", STRANGER, NOW + 10, v).reason).toMatch(/can be finalized at/i);
    expect(act(proposed, "finalize_verdict", STRANGER, NOW + FINALITY_DELAY, v).available).toBe(true);
  });

  it("opens finalizing and settling to anyone, because the payees are fixed", () => {
    const finalized = agreement({ lifecycle: "FINALIZED", result_state: "FULFILLED", round_count: 1 });
    const settle = act(finalized, "execute_consequence", STRANGER);
    expect(settle.available).toBe(true);
    expect(settle.permissionless).toBe(true);
  });

  it("calls it closing the agreement when nothing was staked", () => {
    const plain = agreement({ lifecycle: "FINALIZED", economic: false, result_state: "FULFILLED" });
    expect(act(plain, "execute_consequence", CREATOR).label).toMatch(/close the agreement/i);
  });
});

describe("recovery and cancellation", () => {
  it("offers recovery only after the deadline and the window, and never after a verdict", () => {
    const stalled = agreement({ deadline: NOW - 1800, recovery_window: 3600 });
    expect(act(stalled, "recover", STRANGER, NOW).available).toBe(false);          // window still open
    expect(act(stalled, "recover", STRANGER, NOW).reason).toMatch(/recovery is possible from/i);
    expect(act(stalled, "recover", STRANGER, NOW + 1801).available).toBe(true);     // window passed
    const judged = agreement({ lifecycle: "FINALIZED", deadline: NOW - 7200 });
    expect(act(judged, "recover", STRANGER, NOW).available).toBe(false);
    expect(act(judged, "recover", STRANGER, NOW).reason).toMatch(/never adjudicated/i);
  });

  it("lets the creator cancel only while no evidence has been registered", () => {
    const empty = agreement({ evidence_count: 0 });
    expect(act(empty, "cancel_agreement", CREATOR).available).toBe(true);
    expect(act(agreement(), "cancel_agreement", CREATOR).available).toBe(false);
    expect(act(agreement(), "cancel_agreement", CREATOR).reason).toMatch(/evidence has been registered/i);
    expect(act(empty, "cancel_agreement", AGENT).available).toBe(false);
  });
});

describe("a closed record still says what happened to it", () => {
  it("offers nothing and gives a reason for every act", () => {
    const done = agreement({ lifecycle: "CONSEQUENCE_EXECUTED", result_state: "FULFILLED",
                             amount_deposited: "0", bond_deposited: "0", settled_at: NOW });
    const acts = actsFor(done, verdict({ status: "FINALIZED" }), NOW, CREATOR);
    expect(acts.filter((a) => a.available)).toHaveLength(0);
    for (const a of acts) expect(a.reason, a.id).toBeTruthy();
    expect(isSettled(done)).toBe(true);
    expect(isSettled(agreement())).toBe(false);
  });
});
