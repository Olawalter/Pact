"use client";

import Link from "next/link";

import { ResultChip, StatusMark } from "@/components/agreement/chips";
import { useAgreement, useTransitions } from "@/lib/genlayer/hooks";
import { agreementLabel, formatTime, verdictHeadline } from "@/lib/format/present";

/**
 * The most recent adjudication this contract has recorded, read from the
 * contract itself. Nothing here is a fixture: when no agreement has been
 * adjudicated yet, the panel says exactly that.
 */
export function LatestAdjudication() {
  const transitions = useTransitions(20);
  const withVerdict = transitions.data?.items.find((t) => t.to === "FINALIZED"
    || t.to === "CONSEQUENCE_EXECUTED" || t.to === "VERDICT_PROPOSED");
  const view = useAgreement(withVerdict?.agreement_id ?? "", undefined, !!withVerdict);

  if (transitions.error) {
    return <p className="text-sm text-[var(--color-muted)]">The contract could not be read: {transitions.error}</p>;
  }
  if (transitions.loading || (withVerdict && view.loading)) {
    return <div className="h-40 animate-pulse rounded-sm bg-white" aria-busy="true"
                aria-label="Reading the contract" />;
  }
  if (!withVerdict || !view.data) {
    return (
      <div className="card p-5">
        <h2 className="label">Latest adjudication</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          No agreement on this contract has been adjudicated yet. Create one, register the evidence, and
          the panel&apos;s own result will appear here.
        </p>
      </div>
    );
  }

  const { agreement } = view.data;
  const verdict = view.data.verdicts.at(-1);
  if (!verdict) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="label">Latest adjudication, read from the contract</h2>
        <Link href={`/agreements/${agreement.agreement_id}`}
              className="mono text-xs text-[var(--color-signal)] hover:underline">
          {agreementLabel(agreement.agreement_id)}
        </Link>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <h3 className="text-lg">{agreement.title}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <ResultChip state={verdict.agreement_state} />
            <span className="text-sm text-[var(--color-muted)]">{verdictHeadline(verdict)}</span>
          </div>
          <p className="text-sm text-[var(--color-muted)]">
            Decided {formatTime(verdict.proposed_at)}
            {verdict.finalized_at ? `, finalized ${formatTime(verdict.finalized_at)}` : ", awaiting finality"}.
          </p>
          <Link href={`/agreements/${agreement.agreement_id}`}
                className="w-fit text-sm text-[var(--color-deep)] underline underline-offset-4">
            Open the whole record
          </Link>
        </div>
        <ul className="grid content-start gap-2">
          {verdict.findings.map((f) => {
            const constraint = agreement.definition?.constraints.find((c) => c.id === f.id);
            return (
              <li key={f.id} className="flex items-start gap-2.5 text-sm">
                <StatusMark status={f.effective_status} />
                <span>
                  <span className="mono text-xs text-[var(--color-muted)]">{f.id}</span>{" "}
                  {constraint?.requirement ?? "a requirement of this agreement"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
