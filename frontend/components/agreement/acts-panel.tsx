"use client";

import { useState } from "react";

import { TxPanel } from "@/components/transaction/tx-panel";
import { actsFor, type Act } from "@/lib/genlayer/acts";
import { agreementChanged, fundCall, verbCall, type Agreement, type SimpleVerb,
         type Verdict } from "@/lib/genlayer/contract";
import { usePact, useSend } from "@/lib/genlayer/hooks";
import { formatGen } from "@/lib/format/present";
import { useWallet } from "@/lib/wallet/wallet";

/**
 * What can be done to this agreement now, and what cannot, with the reason. An
 * act the contract would refuse is listed with its reason rather than offered
 * as a button that fails.
 */
export function ActsPanel({ agreement, latest, now, onChanged }: {
  agreement: Agreement;
  latest?: Verdict;
  now: number;
  onChanged: () => void;
}) {
  const wallet = useWallet();
  const { client, config } = usePact();
  const sender = useSend();
  const [active, setActive] = useState<Act | null>(null);

  const acts = actsFor(agreement, latest, now, wallet.account);
  const available = acts.filter((a) => a.available && a.id !== "lock_agreement"
                                 && a.id !== "submit_evidence");
  const waiting = acts.filter((a) => !a.available && a.reason);

  const run = async (act: Act) => {
    setActive(act);
    const id = agreement.agreement_id;
    const test = (a: Agreement) => {
      switch (act.id) {
        case "propose_constraints": return a.lifecycle === "CONSTRAINTS_REVIEW";
        case "fund_agreement": return a.lifecycle === "ACTIVE"
          || BigInt(a.amount_deposited) + BigInt(a.bond_deposited) > 0n;
        case "request_adjudication": return a.round_count > agreement.round_count;
        case "finalize_verdict": return a.lifecycle === "FINALIZED";
        case "execute_consequence": return a.lifecycle === "CONSEQUENCE_EXECUTED";
        case "recover": return a.lifecycle === "CONSEQUENCE_EXECUTED";
        case "cancel_agreement": return a.lifecycle === "CANCELLED";
        default: return true;
      }
    };
    const owed = wallet.account?.toLowerCase() === agreement.creator.toLowerCase()
      ? BigInt(agreement.amount_required) - BigInt(agreement.amount_deposited)
      : BigInt(agreement.bond_required) - BigInt(agreement.bond_deposited);
    await sender.send({
      call: act.id === "fund_agreement" ? fundCall(id, owed) : verbCall(act.id as SimpleVerb, id),
      reconciled: agreementChanged(client, config, id, test),
      onRecorded: onChanged,
      onSettled: onChanged,
    });
  };

  return (
    <div className="grid gap-4">
      {available.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          Nothing can be done to this agreement at the moment. The list below says why.
        </p>
      ) : (
        <ul className="grid gap-3">
          {available.map((act) => (
            <li key={act.id} className="grid gap-2 border border-[var(--color-border)] bg-white p-3
                                        sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="text-sm font-medium">
                  {act.label}
                  {act.id === "fund_agreement" ? (
                    <span className="ml-2 mono text-xs text-[var(--color-muted)]">
                      {formatGen(wallet.account?.toLowerCase() === agreement.creator.toLowerCase()
                        ? (BigInt(agreement.amount_required) - BigInt(agreement.amount_deposited)).toString()
                        : (BigInt(agreement.bond_required) - BigInt(agreement.bond_deposited)).toString())}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  {act.explains}{act.permissionless ? " Anyone may send this." : ""}
                </p>
              </div>
              <button type="button"
                      className={`btn justify-self-start ${act.id === "request_adjudication" ? "btn-primary" : ""}`}
                      disabled={sender.busy || !wallet.account} onClick={() => run(act)}>
                {sender.busy && active?.id === act.id ? "Sending…" : act.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!wallet.account && available.length ? (
        <p className="text-xs text-[var(--color-muted)]">Connect a wallet to send a transaction.</p>
      ) : null}

      {active ? (
        <TxPanel state={sender.state} done={`${active.label}: recorded in the contract.`}
                 leaderNote={active.id === "request_adjudication"
                   ? "A leader is fetching every source and deciding each requirement."
                   : active.id === "propose_constraints"
                     ? "A leader is reading the agreement and proposing requirements." : undefined} />
      ) : null}

      {waiting.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--color-muted)]">
            Not available yet ({waiting.length})
          </summary>
          <ul className="mt-2 grid gap-1.5">
            {waiting.map((act) => (
              <li key={act.id} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-2">
                <span className="text-[var(--color-muted)]">{act.label}</span>
                <span>{act.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
