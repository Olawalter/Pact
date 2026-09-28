import type { Agreement, SimpleVerb, Verdict } from "@/lib/genlayer/contract";

/**
 * What can be done to an agreement right now, and why not.
 *
 * This is a pure function of the record, the signer, the clock and nothing
 * else, so it can be tested without a browser or a chain, and the live proofs
 * assert the same rule against chain state before every write. Each rule
 * mirrors the contract's own precondition; where the contract would refuse, the
 * act is listed with the reason instead of offered as a button that fails.
 */

export type ActId = SimpleVerb | "lock_agreement" | "fund_agreement" | "submit_evidence";

export type Act = {
  id: ActId;
  label: string;
  explains: string;
  available: boolean;
  /** Why it cannot be done yet, in the words a party would use. */
  reason?: string;
  /** Anyone may send it: the payees and the record are already fixed. */
  permissionless?: boolean;
  /** Which party this act belongs to, when it belongs to one. */
  who?: "creator" | "counterparty" | "either";
};

export const FINALITY_DELAY = 300;
export const MIN_ROUND_INTERVAL = 600;
export const MAX_ROUNDS = 4;

export type Party = "creator" | "counterparty" | "";

export function partyOf(agreement: Agreement, account?: string): Party {
  if (!account) return "";
  const who = account.toLowerCase();
  if (who === agreement.creator.toLowerCase()) return "creator";
  if (who === agreement.counterparty.toLowerCase()) return "counterparty";
  return "";
}

const when = (unix: number) =>
  new Date(unix * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";

export function actsFor(agreement: Agreement, latest: Verdict | undefined, now: number,
                        account?: string): Act[] {
  const party = partyOf(agreement, account);
  const isCreator = party === "creator";
  const life = agreement.lifecycle;
  const owedAmount = BigInt(agreement.amount_required) - BigInt(agreement.amount_deposited);
  const owedBond = BigInt(agreement.bond_required) - BigInt(agreement.bond_deposited);
  const acts: Act[] = [];

  const beforeLock = life === "DRAFT" || life === "CONSTRAINTS_REVIEW";

  acts.push({
    id: "propose_constraints",
    label: "Propose constraints",
    explains: "Ask GenLayer to read the agreement and suggest the requirements it contains. The "
      + "proposal is advisory: you edit it, and what you lock is what binds.",
    who: "creator",
    available: beforeLock && isCreator,
    reason: !beforeLock ? "The agreement is locked; its constraints cannot change."
      : !isCreator ? "Only the creator shapes the agreement before it is locked." : undefined,
  });

  acts.push({
    id: "lock_agreement",
    label: "Lock the agreement",
    explains: "Freeze the constraints, the evidence policy, the deadline and the consequence under a "
      + "fingerprint. Nothing consensus-critical can change afterwards.",
    who: "creator",
    available: beforeLock && isCreator,
    reason: !beforeLock ? "This agreement is already locked."
      : !isCreator ? "Only the creator can lock the agreement." : undefined,
  });

  if (agreement.economic) {
    const owes = isCreator ? owedAmount : party === "counterparty" ? owedBond : 0n;
    acts.push({
      id: "fund_agreement",
      label: isCreator ? "Deposit the amount" : "Post the bond",
      explains: "The deposit is the transaction's own value, held by the contract until the agreement "
        + "ends. It never reaches the panel that judges the evidence.",
      who: isCreator ? "creator" : "counterparty",
      available: life === "LOCKED" && !!party && owes > 0n,
      reason: life !== "LOCKED" ? (life === "ACTIVE" ? "Both sides have funded this agreement."
                                   : `Funding happens once the agreement is locked; it is ${life}.`)
        : !party ? "Only the two parties fund an agreement."
        : owes <= 0n ? "Your side is funded." : undefined,
    });
  }

  acts.push({
    id: "submit_evidence",
    label: "Register evidence",
    explains: "Name a page the validators will fetch themselves, or an attestation in your own words, "
      + "and say which requirements it speaks to.",
    who: "either",
    available: life === "ACTIVE" && !!party,
    reason: life !== "ACTIVE" ? `Evidence is registered while the agreement is in force; it is ${life}.`
      : !party ? "Only the two parties register evidence." : undefined,
  });

  const roundsLeft = agreement.round_count < MAX_ROUNDS;
  const nextRoundAt = agreement.last_round_at ? agreement.last_round_at + MIN_ROUND_INTERVAL : 0;
  acts.push({
    id: "request_adjudication",
    label: "Request adjudication",
    explains: "Ask GenLayer to decide every requirement against the registered evidence. Each "
      + "validator fetches the sources and reads them independently.",
    who: "either",
    available: life === "ACTIVE" && !!party && agreement.evidence_count > 0 && roundsLeft
      && now >= nextRoundAt,
    reason: life !== "ACTIVE" ? `Adjudication needs an agreement in force; it is ${life}.`
      : !party ? "Only the two parties can ask for adjudication."
      : agreement.evidence_count === 0 ? "No evidence has been registered yet."
      : !roundsLeft ? `This agreement has used all ${MAX_ROUNDS} adjudication rounds.`
      : now < nextRoundAt ? `The next round can be asked for at ${when(nextRoundAt)}.` : undefined,
  });

  const readyAt = latest ? latest.proposed_at + FINALITY_DELAY : 0;
  acts.push({
    id: "finalize_verdict",
    label: "Finalize the verdict",
    explains: "After the contract's finality delay, make the proposed verdict the agreement's "
      + "finalized state.",
    permissionless: true,
    available: life === "VERDICT_PROPOSED" && now >= readyAt,
    reason: life !== "VERDICT_PROPOSED" ? `There is no verdict waiting; the agreement is ${life}.`
      : now < readyAt ? `The verdict can be finalized at ${when(readyAt)}.` : undefined,
  });

  acts.push({
    id: "execute_consequence",
    label: agreement.economic ? "Execute the consequence" : "Close the agreement",
    explains: agreement.economic
      ? "Pay the finalized state's consequence to the recorded parties, exactly as the locked policy "
        + "says. Anyone may send it; nobody can redirect it."
      : "Record that this agreement is complete. Nothing was staked, so nothing moves.",
    permissionless: true,
    available: life === "FINALIZED",
    reason: life !== "FINALIZED" ? `The consequence follows a finalized verdict; the agreement is ${life}.`
      : undefined,
  });

  const recoverAt = agreement.deadline + agreement.recovery_window;
  acts.push({
    id: "recover",
    label: "Recover",
    explains: "When the deadline and the recovery window have passed with no verdict, the locked "
      + "recovery rule ends the agreement.",
    permissionless: true,
    available: (life === "LOCKED" || life === "ACTIVE") && now >= recoverAt,
    reason: !(life === "LOCKED" || life === "ACTIVE")
      ? `Recovery applies to an agreement that was never adjudicated; it is ${life}.`
      : now < recoverAt ? `Recovery is possible from ${when(recoverAt)}.` : undefined,
  });

  acts.push({
    id: "cancel_agreement",
    label: "Cancel",
    explains: "Withdraw an agreement that carries no evidence. Every deposit goes back.",
    who: "creator",
    available: ["DRAFT", "CONSTRAINTS_REVIEW", "LOCKED", "ACTIVE"].includes(life) && isCreator
      && agreement.evidence_count === 0,
    reason: !isCreator ? "Only the creator can cancel."
      : agreement.evidence_count > 0 ? "Evidence has been registered: this agreement is adjudicated or recovered, not cancelled."
      : !["DRAFT", "CONSTRAINTS_REVIEW", "LOCKED", "ACTIVE"].includes(life)
        ? `An agreement in ${life} cannot be cancelled.` : undefined,
  });

  return acts;
}

/** The acts a party can send right now. */
export const availableActs = (acts: Act[]) => acts.filter((a) => a.available);

/** True once the agreement can no longer change, so a page can stop reading it. */
export const isSettled = (a: Agreement) =>
  a.lifecycle === "CONSEQUENCE_EXECUTED" || a.lifecycle === "CANCELLED";
