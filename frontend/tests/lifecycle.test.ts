/**
 * The write lifecycle, which may only advance on evidence: a GenLayer status
 * this app read, or the contract's own state. Nothing here is a timer dressed
 * up as progress.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initialTx, refusalOf, rungsFor, runWrite, isAccepted, type TxState } from "@/lib/genlayer/lifecycle";
import { refusalSentence, walletFailure, isMissing } from "@/lib/genlayer/errors";
import type { AppConfig } from "@/lib/genlayer/config";

const config = { contractAddress: "0xdb2ecd9fcacfa3b639de3a8b8d91de30a746233f",
                 explorer: "https://e.test" } as unknown as AppConfig;
const HASH = `0x${"ab".repeat(32)}` as const;
const view = (s: TxState) => Object.fromEntries(rungsFor(s).map((r) => [r.step, r.state]));
const payload = (text: string) => btoa(text);

function harness(statuses: string[], reconciled: () => Promise<boolean> = async () => true,
                 write: () => Promise<string> = async () => HASH, receipt: Record<string, unknown> = {},
                 onRecorded?: () => void) {
  const seen: TxState[] = [];
  let n = 0;
  const poller = { getTransaction: async () => ({ ...receipt, statusName: statuses[Math.min(n++, statuses.length - 1)] }) };
  const run = runWrite({
    config, client: { writeContract: write } as never, poller: poller as never, pollMs: 1000,
    call: { functionName: "request_adjudication", args: ["A1"], value: 0n },
    reconciled, onRecorded, onUpdate: (s) => seen.push(s),
  });
  return { seen, run };
}

describe("runWrite", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a leader still proposing as in progress, not as validated", async () => {
    const { seen } = harness(["PENDING", "PROPOSING", "PROPOSING"], async () => false);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(view(seen.at(-1)!)).toMatchObject({ PENDING: "observed", LEADER_PROPOSED: "observed",
                                               VALIDATING: "current", DECIDED: "todo" });
  });

  it("marks a step that passed between two reads as passed, not as observed", async () => {
    const { run } = harness(["PENDING", "ACCEPTED", "FINALIZED"]);
    await vi.advanceTimersByTimeAsync(200_000);
    const final = await run;
    expect(view(final)).toEqual({
      WALLET_CONFIRMATION: "observed", SUBMITTED: "observed", PENDING: "observed",
      LEADER_PROPOSED: "passed", VALIDATING: "passed", DECIDED: "observed", FINALIZED: "observed",
    });
    expect(final.statuses).toEqual(["PENDING", "ACCEPTED", "FINALIZED"]);
  });

  it("reaches a decision only when the contract's own state shows the write", async () => {
    let caughtUp = false;
    const { seen } = harness(["ACCEPTED"], async () => caughtUp);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(seen.at(-1)!.happened).toBe(5);
    expect(view(seen.at(-1)!).DECIDED).not.toBe("observed");
    caughtUp = true;
    await vi.advanceTimersByTimeAsync(6_000);
    expect(view(seen.at(-1)!).DECIDED).toBe("observed");
    expect(view(seen.at(-1)!).FINALIZED).not.toBe("observed");
  });

  it("tells the page the moment the contract shows the write, before finality", async () => {
    let recorded = 0;
    const { seen } = harness(["ACCEPTED"], async () => true, async () => HASH, {},
                             () => { recorded++; });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(recorded).toBe(1);
    expect(seen.at(-1)!.phase).toBe("RUNNING");        // still waiting for finality
  });

  it("names a round that reached no decision, and does not pretend it changed anything", async () => {
    const { run } = harness(["PENDING", "UNDETERMINED"]);
    await vi.advanceTimersByTimeAsync(30_000);
    const final = await run;
    expect(final.phase).toBe("FAILED");
    expect(final.failure).toBe("NO_CONSENSUS");
    expect(final.message).toMatch(/did not reach a decision/i);
    expect(final.message).toMatch(/sent again/i);
  });

  it("names a wallet that refused, and sends nothing", async () => {
    const { run } = harness(["PENDING"], async () => true, async () => {
      throw Object.assign(new Error("User rejected the request"), { code: 4001 });
    });
    const final = await run;
    expect(final.failure).toBe("WALLET_REJECTED");
    expect(final.hash).toBeUndefined();
  });

  it("keeps the contract's own refusal, without the protocol tag", async () => {
    const refusal = { consensus_data: { leader_receipt: [{ execution_result: "ERROR",
      result: { payload: payload("[EXPECTED] adjudication needs an agreement in force; it is LOCKED") } }] } };
    const { run } = harness(["PENDING", "ACCEPTED"], async () => true, async () => HASH, refusal);
    await vi.advanceTimersByTimeAsync(30_000);
    const final = await run;
    expect(final.failure).toBe("CONTRACT_REFUSED");
    expect(final.message).toBe("Adjudication needs an agreement in force; it is LOCKED");
  });

  it("says so when the contract's state never caught up", async () => {
    const { run } = harness(["ACCEPTED"], async () => false);
    await vi.advanceTimersByTimeAsync(300_000);
    const final = await run;
    expect(final.failure).toBe("STATE_NOT_CAUGHT_UP");
  });
});

describe("what the words say", () => {
  it("strips the protocol tag and nothing else", () => {
    expect(refusalSentence("[EXPECTED] the bond must be exactly 5 atto"))
      .toBe("The bond must be exactly 5 atto");
    expect(refusalSentence("[TRANSIENT] the source could not be read"))
      .toBe("The source could not be read");
  });

  it("names wallet failures precisely", () => {
    expect(walletFailure({ code: 4001 }).kind).toBe("WALLET_REJECTED");
    expect(walletFailure(new Error("insufficient funds for gas")).kind).toBe("INSUFFICIENT_FUNDS");
    expect(walletFailure(new Error("unknown chain")).kind).toBe("WRONG_NETWORK");
  });

  it("knows a record that does not exist from a read that failed", () => {
    expect(isMissing(new Error("[EXPECTED] there is no agreement A9"))).toBe(true);
    expect(isMissing(new Error("connection reset"))).toBe(false);
  });

  it("knows which GenLayer statuses mean the write took effect", () => {
    expect(isAccepted("ACCEPTED")).toBe(true);
    expect(isAccepted("FINALIZED")).toBe(true);
    expect(isAccepted("PROPOSING")).toBe(false);
    expect(isAccepted(undefined)).toBe(false);
  });

  it("starts from a state that claims nothing", () => {
    expect(initialTx.happened).toBe(0);
    expect(rungsFor(initialTx).every((r) => r.state === "todo")).toBe(true);
  });
});
