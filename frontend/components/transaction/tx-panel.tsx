"use client";

import { configResult } from "@/lib/genlayer/config";
import { rungsFor, STEP_LABEL, type TxState } from "@/lib/genlayer/lifecycle";
import { shortHash } from "@/lib/format/present";

/**
 * A write as it actually happened. Every step is backed by something this app
 * read: a GenLayer status, or the contract's own state. A step that was true
 * between two reads says so rather than pretending to have been watched.
 */

const WAITING: Record<string, string> = {
  WALLET_CONFIRMATION: "Confirm the transaction in your wallet.",
  SUBMITTED: "Waiting for GenLayer to acknowledge the transaction.",
  PENDING: "Queued for a leader.",
  LEADER_PROPOSED: "A leader is executing it and proposing a result.",
  VALIDATING: "Validators are evaluating that result independently.",
  DECIDED: "Accepted; reading the contract's own state to confirm it.",
  FINALIZED: "Recorded. It becomes final when GenLayer's appeal window closes.",
};

export function TxPanel({ state, done, leaderNote }: {
  state: TxState;
  done?: string;
  /** What the leader is actually doing, when the act says more than the default. */
  leaderNote?: string;
}) {
  if (state.phase === "READY") return null;
  const explorer = configResult.ok ? configResult.config.explorer : "";

  return (
    <div className="card p-4" aria-live="polite">
      <ol className="grid gap-1.5 text-sm">
        {rungsFor(state).map(({ step, state: s }) => (
          <li key={step} className="flex items-baseline gap-2.5">
            <span aria-hidden="true"
                  className={`mono w-4 text-center text-xs ${
                    s === "failed" ? "text-[var(--color-violated)]"
                    : s === "observed" ? "text-[var(--color-satisfied)]"
                    : s === "passed" ? "text-[var(--color-muted)]"
                    : s === "current" ? "text-[var(--color-signal)]" : "text-[var(--color-border)]"}`}>
              {s === "failed" ? "✕" : s === "observed" || s === "passed" ? "✓" : s === "current" ? "›" : "·"}
            </span>
            <span className={s === "todo" ? "text-[var(--color-muted)]"
                             : s === "failed" ? "text-[var(--color-violated)]" : ""}>
              {STEP_LABEL[step]}
              <span className="sr-only">
                {s === "observed" ? ", done" : s === "passed" ? ", passed between two status reads"
                 : s === "current" ? ", in progress" : s === "failed" ? ", failed" : ", not yet"}
              </span>
              {s === "passed" ? (
                <span className="ml-2 text-xs text-[var(--color-muted)]" aria-hidden="true">
                  passed between reads
                </span>
              ) : null}
              {s === "current" ? (
                <span className="block text-xs text-[var(--color-muted)]">
                  {step === "LEADER_PROPOSED" && leaderNote ? leaderNote : WAITING[step]}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      {state.phase === "FAILED" && state.message ? (
        <p role="alert" className="mt-3 border-l-2 border-[var(--color-violated)] pl-3 text-sm">
          {state.message}
        </p>
      ) : null}
      {state.phase === "DONE" && done ? (
        <p className="mt-3 border-l-2 border-[var(--color-satisfied)] pl-3 text-sm">{done}</p>
      ) : null}

      {state.hash ? (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          <a className="mono underline underline-offset-4 hover:text-[var(--color-ink)]"
             href={`${explorer}/tx/${state.hash}`} target="_blank" rel="noreferrer">
            Transaction {shortHash(state.hash)}
          </a>
          {state.statuses.length ? (
            <span className="ml-2">GenLayer statuses read: {state.statuses.join(" → ").toLowerCase()}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
