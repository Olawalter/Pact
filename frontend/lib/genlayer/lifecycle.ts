import { readClient, type GenLayerClient } from "@/lib/genlayer/client";
import { refusalSentence, walletFailure, type FailureKind } from "@/lib/genlayer/errors";
import type { AppConfig } from "@/lib/genlayer/config";
import type { Call } from "@/lib/genlayer/contract";

/**
 * A write, as it actually happens on GenLayer, and never as a guess.
 *
 *   WALLET_CONFIRMATION  the visitor is signing
 *   SUBMITTED            GenLayer can read the transaction back
 *   PENDING              it is queued
 *   LEADER_PROPOSED      a leader has executed it and proposed a result
 *   VALIDATING           validators are evaluating that result
 *   DECIDED              a decision was reached and the contract's own state shows it
 *   FINALIZED            GenLayer marked the transaction final
 *
 * A step is only advanced by evidence: a status this app read, or the
 * contract's own state. A step that was true between two reads is marked
 * "passed", never invented.
 */

export const STEPS = ["WALLET_CONFIRMATION", "SUBMITTED", "PENDING", "LEADER_PROPOSED", "VALIDATING",
                      "DECIDED", "FINALIZED"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABEL: Record<Step, string> = {
  WALLET_CONFIRMATION: "Wallet confirmation",
  SUBMITTED: "Transaction submitted",
  PENDING: "Queued on GenLayer",
  LEADER_PROPOSED: "Leader execution",
  VALIDATING: "Validator evaluation",
  DECIDED: "Decision accepted",
  FINALIZED: "Finalization",
};

/** How far a GenLayer transaction status proves the write has come. */
const EVIDENCE: Record<string, number> = {
  PENDING: 3, PROPOSING: 4, COMMITTING: 5, REVEALING: 5, ACCEPTED: 6,
  READY_TO_FINALIZE: 6, FINALIZED: 7, VALIDATORS_TIMEOUT: 5, LEADER_TIMEOUT: 4,
  APPEAL_COMMITTING: 6, APPEAL_REVEALING: 6, UNDETERMINED: 5, CANCELED: 2,
};

const UNDECIDED = new Set(["UNDETERMINED", "CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"]);
const ACCEPTED = new Set(["ACCEPTED", "READY_TO_FINALIZE", "FINALIZED", "APPEAL_COMMITTING",
                          "APPEAL_REVEALING"]);

export type TxState = {
  phase: "READY" | "RUNNING" | "DONE" | "FAILED";
  /** How many steps are proved, in order. */
  happened: number;
  /** The steps this app saw for itself, rather than inferring from a later one. */
  observed: Step[];
  statuses: string[];
  protocolStatus?: string;
  hash?: `0x${string}`;
  message?: string;
  failure?: FailureKind;
};

export const initialTx: TxState = { phase: "READY", happened: 0, observed: [], statuses: [] };

export type Rung = { step: Step; state: "observed" | "passed" | "current" | "todo" | "failed" };

export function rungsFor(s: TxState): Rung[] {
  return STEPS.map((step, i) => {
    const reached = i < s.happened;
    if (s.phase === "FAILED" && i === s.happened) return { step, state: "failed" as const };
    if (!reached) return { step, state: i === s.happened && s.phase === "RUNNING" ? "current" as const : "todo" as const };
    return { step, state: s.observed.includes(step) ? "observed" as const : "passed" as const };
  });
}

export const isAccepted = (status?: string) => !!status && ACCEPTED.has(status);

type Receipt = {
  statusName?: string;
  consensusData?: { leaderReceipt?: Array<{ executionResult?: string; result?: unknown }> };
  consensus_data?: { leader_receipt?: Array<{ execution_result?: string; result?: unknown }> };
};

/**
 * The contract's own refusal, decoded from the leader's receipt.
 *
 * A refusal usually arrives as an ERROR execution. Funding is the exception: it
 * is the only payable write, and GenLayer credits a payable transaction's value
 * before the call runs, so refusing by raising would keep GEN nobody meant to
 * send. It refuses by returning "[REFUNDED] <reason>" instead -- a transaction
 * that succeeded, having sent the value straight back -- and that must be shown
 * as the refusal it is, not as a deposit that worked.
 */
export function refusalOf(tx: Receipt): { message: string; kind: FailureKind } | null {
  const leaders = tx.consensus_data?.leader_receipt ?? tx.consensusData?.leaderReceipt ?? [];
  const leader = Array.isArray(leaders) ? leaders[0] : undefined;
  const execution = (leader as { execution_result?: string; executionResult?: string })?.execution_result
    ?? (leader as { executionResult?: string })?.executionResult;
  const text = decodePayload((leader as { result?: { payload?: unknown } })?.result?.payload);
  if (!execution || execution === "SUCCESS") {
    const refunded = /\[REFUNDED\]\s*(.*)/.exec(text);
    if (!refunded) return null;
    const reason = refusalSentence(refunded[1].trim()) || "The deposit was not accepted.";
    return { message: `${reason} The GEN was sent back.`, kind: "CONTRACT_REFUSED" };
  }
  const message = refusalSentence(text) || "The contract refused this transaction.";
  return { message, kind: "CONTRACT_REFUSED" };
}

function decodePayload(payload: unknown): string {
  let text = typeof payload === "string" ? payload : "";
  try {
    if (text && /^[A-Za-z0-9+/=]+$/.test(text)) text = atob(text);
  } catch { /* the payload was not base64; use it as it came */ }
  return text.replace(/[^\x20-\x7e]+/g, " ").trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RunOptions = {
  config: AppConfig;
  client: GenLayerClient;
  call: Call;
  /** Resolves true once the contract's own views show the write. */
  reconciled: () => Promise<boolean>;
  /** Called the moment the contract shows it, before finality is waited for. */
  onRecorded?: () => void;
  onUpdate: (s: TxState) => void;
  poller?: GenLayerClient;
  pollMs?: number;
};

export async function runWrite(o: RunOptions): Promise<TxState> {
  let state: TxState = { ...initialTx, phase: "RUNNING" };
  const set = (patch: Partial<TxState>) => {
    state = { ...state, ...patch };
    o.onUpdate(state);
    return state;
  };
  const see = (status?: string) => {
    if (!status) return;
    const statuses = state.statuses.at(-1) === status ? state.statuses : [...state.statuses, status];
    const step: Step | undefined = status === "PENDING" ? "PENDING"
      : status === "PROPOSING" ? "LEADER_PROPOSED"
      : status === "COMMITTING" || status === "REVEALING" ? "VALIDATING"
      : status === "FINALIZED" ? "FINALIZED" : undefined;
    // a status proves at most VALIDATING; DECIDED needs the contract's own state
    const happened = Math.max(state.happened, Math.min(EVIDENCE[status] ?? 0, 5));
    const observed = step && !state.observed.includes(step) ? [...state.observed, step] : state.observed;
    set({ protocolStatus: status, statuses, happened, observed });
  };
  const fail = (message: string, kind: FailureKind) => set({ phase: "FAILED", message, failure: kind });
  const poller = o.poller ?? readClient(o.config);
  const pollMs = o.pollMs ?? 3000;

  set({});
  let hash: `0x${string}`;
  try {
    hash = (await o.client.writeContract({
      address: o.config.contractAddress,
      functionName: o.call.functionName,
      args: o.call.args,
      value: o.call.value,
    })) as `0x${string}`;
  } catch (err) {
    const f = walletFailure(err);
    return fail(f.message, f.kind);
  }
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return fail("The wallet did not return a transaction hash.", "TRANSACTION_FAILED");
  }
  set({ hash, happened: 1, observed: ["WALLET_CONFIRMATION"] });

  let tx: Receipt | null = null;
  for (let i = 0; i < 20 && !tx; i++) {
    try {
      tx = (await poller.getTransaction({ hash: hash as never })) as Receipt;
    } catch {
      await sleep(pollMs);
    }
  }
  if (!tx) {
    return fail("The wallet returned a hash, but GenLayer has no record of the transaction.",
                "TRANSACTION_FAILED");
  }
  set({ happened: 2, observed: [...state.observed, "SUBMITTED"] });
  see(tx.statusName);

  const started = Date.now();
  while (!isAccepted(tx.statusName)) {
    if (tx.statusName && UNDECIDED.has(tx.statusName)) {
      return fail("The validators did not reach a decision on this transaction, so it changed nothing. "
                  + "It can be sent again.", "NO_CONSENSUS");
    }
    if (Date.now() - started > 20 * 60_000) {
      return fail("This is taking longer than twenty minutes. The transaction may still complete; "
                  + "reload the page later.", "TIMEOUT");
    }
    await sleep(pollMs + 2000);
    try {
      tx = (await poller.getTransaction({ hash: hash as never })) as Receipt;
      see(tx.statusName);
    } catch { /* a transient read failure: keep polling */ }
  }

  const refusal = refusalOf(tx);
  if (refusal) return fail(refusal.message, refusal.kind);

  let updated = false;
  for (let i = 0; i < 40 && !updated; i++) {
    try {
      updated = await o.reconciled();
    } catch {
      updated = false;
    }
    if (!updated) await sleep(pollMs);
  }
  if (!updated) {
    return fail("The transaction was accepted, but the contract's state has not caught up yet. "
                + "Reload in a minute.", "STATE_NOT_CAUGHT_UP");
  }
  set({ happened: 6, observed: [...state.observed, "DECIDED"] });
  o.onRecorded?.();

  for (let i = 0; i < 90 && state.protocolStatus !== "FINALIZED"; i++) {
    await sleep(10_000);
    try {
      const t = (await poller.getTransaction({ hash: hash as never })) as Receipt;
      see(t.statusName);
    } catch { /* keep the last status seen */ }
  }
  if (state.protocolStatus === "FINALIZED") {
    return set({ phase: "DONE", happened: 7, observed: [...state.observed, "FINALIZED"] });
  }
  return set({ phase: "DONE" });
}
