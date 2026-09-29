"use client";

import Link from "next/link";
import { use } from "react";

import { ActsPanel } from "@/components/agreement/acts-panel";
import { AvailabilityChip, CorroborationChip, LifecycleChip, ResultChip,
         StatusMark } from "@/components/agreement/chips";
import { EvidencePanel } from "@/components/evidence/evidence-panel";
import { configResult } from "@/lib/genlayer/config";
import { DETAIL_POLL_MS, useAgreement, useNow } from "@/lib/genlayer/hooks";
import { agreementLabel, custodyWords, findingWords, formatGen, formatTime, humaniseNote,
         KIND_WORDS,
         LIFECYCLE_WORDS, MATERIALITY_WORDS, RECOVERY_WORDS, RESULT_WORDS, TYPE_WORDS,
         verdictHeadline } from "@/lib/format/present";
import { shortAddress } from "@/lib/wallet/wallet";

export default function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const view = useAgreement(id, DETAIL_POLL_MS);
  const now = useNow(30_000);

  if (view.error) {
    return (
      <div className="card p-6">
        <h1 className="text-lg">This agreement could not be read</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{view.error}</p>
        <button type="button" className="btn mt-4" onClick={view.reload}>Try again</button>
      </div>
    );
  }
  if (!view.data) {
    return <div className="h-64 animate-pulse rounded-sm bg-white" aria-busy="true" aria-label="Loading" />;
  }

  const { agreement, evidence, verdicts, history } = view.data;
  const latest = verdicts.at(-1);
  const definition = agreement.definition;
  const explorer = configResult.ok ? configResult.config.explorer : "";

  // minmax(0,1fr): an auto grid track will not shrink below the widest thing in
  // it, so on a phone one long line pushes the whole page sideways
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <header className="grid gap-3 border-b border-[var(--color-border)] pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono text-sm text-[var(--color-deep)]">{agreementLabel(agreement.agreement_id)}</span>
          <LifecycleChip state={agreement.lifecycle} />
          {agreement.result_state !== "NONE" ? <ResultChip state={agreement.result_state} /> : null}
        </div>
        <h1 className="max-w-4xl text-2xl sm:text-[1.75rem]">{agreement.title}</h1>
        <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-[var(--color-muted)]">
          <div><dt className="inline">Creator: </dt><dd className="mono inline">{shortAddress(agreement.creator)}</dd></div>
          <div><dt className="inline">Counterparty: </dt><dd className="mono inline">{shortAddress(agreement.counterparty)}</dd></div>
          <div><dt className="inline">Due: </dt><dd className="inline">{formatTime(agreement.deadline)}</dd></div>
          {agreement.fingerprint ? (
            <div><dt className="inline">Fingerprint: </dt>
              <dd className="mono inline" title={agreement.fingerprint}>
                {agreement.fingerprint.slice(0, 16)}…
              </dd></div>
          ) : null}
        </dl>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          <section className="card">
            <div className="card-head"><h2 className="label">The agreement</h2></div>
            <div className="p-5">
              <p className="agreement-text whitespace-pre-wrap">{agreement.terms}</p>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="label">Requirements</h2>
              {latest ? <span className="text-xs text-[var(--color-muted)]">{verdictHeadline(latest)}</span> : null}
            </div>
            <ol className="grid gap-0 p-5">
              {(definition?.constraints ?? []).map((c) => {
                const finding = latest?.findings.find((f) => f.id === c.id);
                return (
                  <li key={c.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 border-b
                                             border-[var(--color-border)] py-3 last:border-0">
                    {finding ? <StatusMark status={finding.effective_status} />
                      : <span className="mono w-5 text-center text-xs text-[var(--color-border)]"
                              aria-hidden="true">·</span>}
                    <div>
                      <p className="text-sm">
                        <span className="mono mr-2 text-xs text-[var(--color-muted)]">{c.id}</span>
                        {c.requirement}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                        {TYPE_WORDS[c.type]} · {MATERIALITY_WORDS[c.materiality].toLowerCase()}
                        {c.description ? ` · ${c.description}` : ""}
                      </p>
                      {finding ? (
                        <div className="mt-1.5 grid gap-1">
                          <p className="text-sm">{findingWords(finding)}</p>
                          {finding.quote ? (
                            <blockquote className="border-l-2 border-[var(--color-border)] pl-3
                                                   text-sm text-[var(--color-muted)]">
                              “{finding.quote}”
                              <span className="mono ml-2 text-xs">{finding.quote_evidence_id}</span>
                            </blockquote>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <CorroborationChip value={finding.corroboration} />
                            {finding.evidence_ids.length ? (
                              <span className="text-[var(--color-muted)]">
                                on {finding.evidence_ids.join(", ")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="label">Evidence</h2>
              <span className="text-xs text-[var(--color-muted)]">
                {agreement.evidence_count} registered
              </span>
            </div>
            <div className="p-5">
              <EvidencePanel agreement={agreement} evidence={evidence} latest={latest}
                             onChanged={view.reload} />
            </div>
          </section>

          {latest ? (
            <section className="card">
              <div className="card-head">
                <h2 className="label">Adjudication</h2>
                <span className="mono text-xs text-[var(--color-muted)]">
                  round {latest.round + 1} of {agreement.round_count}
                </span>
              </div>
              <div className="grid gap-4 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <ResultChip state={latest.agreement_state} />
                  <span className="text-sm">{verdictHeadline(latest)}</span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {latest.status === "FINALIZED"
                      ? `Finalized ${formatTime(latest.finalized_at)}`
                      : `Proposed ${formatTime(latest.proposed_at)}, awaiting the finality delay`}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-muted)]">{latest.summary}</p>

                {latest.held_for_corroboration.length ? (
                  <p className="border-l-2 border-[var(--color-open)] pl-3 text-sm">
                    {latest.held_for_corroboration.join(", ")} rested on one party&apos;s word alone, so the
                    agreement&apos;s evidence policy held {latest.held_for_corroboration.length === 1 ? "it" : "them"}{" "}
                    as inconclusive rather than letting {latest.held_for_corroboration.length === 1 ? "it" : "them"} move value.
                  </p>
                ) : null}

                <div>
                  <h3 className="label">What each node found at each address</h3>
                  <ul className="mt-2 grid gap-1.5 text-sm">
                    {latest.evidence.map((e) => (
                      <li key={e.evidence_id} className="flex flex-wrap items-center gap-2">
                        <span className="mono text-xs text-[var(--color-muted)]">{e.evidence_id}</span>
                        <AvailabilityChip value={e.availability} />
                        <span className="text-xs text-[var(--color-muted)]">{e.origin}</span>
                        {e.excerpt_digest ? (
                          <span className="mono text-xs text-[var(--color-muted)]"
                                title="a digest of what this node read, agreed by the validators">
                            {e.excerpt_digest.slice(0, 12)}…
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-[var(--color-muted)]">
                  The panel decided each requirement against this evidence. The agreement state above was
                  derived from those results by the contract, under {latest.policy_rules}, against the
                  definition fingerprinted {latest.fingerprint.slice(0, 12)}….
                </p>
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-head"><h2 className="label">History</h2></div>
            <ol className="grid gap-0 p-5 text-sm">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 border-b
                                                    border-[var(--color-border)] py-2 last:border-0">
                  <span className="text-xs text-[var(--color-muted)]">{formatTime(h.at)}</span>
                  <span>
                    {h.from ? `${LIFECYCLE_WORDS[h.from as keyof typeof LIFECYCLE_WORDS] ?? h.from} → ` : ""}
                    {LIFECYCLE_WORDS[h.to as keyof typeof LIFECYCLE_WORDS] ?? h.to}
                    {h.note ? <span className="block text-xs text-[var(--color-muted)]">{humaniseNote(h.note)}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="grid content-start gap-6">
          <section className="card">
            <div className="card-head"><h2 className="label">What can be done now</h2></div>
            <div className="p-5">
              <ActsPanel agreement={agreement} latest={latest} now={now} onChanged={view.reload} />
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2 className="label">Consequence</h2></div>
            <div className="grid gap-3 p-5 text-sm">
              <p>{custodyWords(agreement)}</p>
              {definition?.consequence_policy.economic ? (
                <>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <dt className="label">Amount</dt>
                      <dd>{formatGen(agreement.amount_deposited)} of {formatGen(agreement.amount_required)}</dd>
                    </div>
                    <div>
                      <dt className="label">Bond</dt>
                      <dd>{formatGen(agreement.bond_deposited)} of {formatGen(agreement.bond_required)}</dd>
                    </div>
                  </dl>
                  <ul className="grid gap-1 text-xs text-[var(--color-muted)]">
                    <li>Fulfilled releases {definition.consequence_policy.fulfilled_bps / 100}% to the counterparty.</li>
                    <li>Partially fulfilled releases {definition.consequence_policy.partially_fulfilled_bps / 100}%.</li>
                    <li>Breached releases {definition.consequence_policy.breached_bps / 100}%, and forfeits{" "}
                      {definition.consequence_policy.bond_forfeit_bps / 100}% of the bond to the creator.</li>
                    <li>If it ends inconclusive, {RECOVERY_WORDS[definition.consequence_policy.recovery_rule]}.</li>
                  </ul>
                  {agreement.settled_at ? (
                    <p className="border-l-2 border-[var(--color-satisfied)] pl-3">
                      Settled {formatTime(agreement.settled_at)} under {RESULT_WORDS[agreement.result_state]}.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-[var(--color-muted)]">
                  This agreement stakes nothing. Its outcome is the record itself.
                </p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2 className="label">Evidence policy</h2></div>
            <div className="grid gap-2 p-5 text-sm">
              {definition ? (
                <>
                  <p>
                    {definition.evidence_policy.required_kinds.map((k) => KIND_WORDS[k]).join(" and ")}{" "}
                    required, from at least {definition.evidence_policy.min_independent_origins}{" "}
                    independent publisher
                    {definition.evidence_policy.min_independent_origins === 1 ? "" : "s"}.
                  </p>
                  <p className="text-[var(--color-muted)]">
                    {definition.evidence_policy.corroboration_required
                      ? "A requirement decided on one party's word alone is held as inconclusive, whichever "
                        + "way it points."
                      : "Corroboration is not required by this agreement."}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    Recovery window: {Math.round(definition.recovery_window / 3600)}{" "}
                    {Math.round(definition.recovery_window / 3600) === 1 ? "hour" : "hours"} after the deadline.
                  </p>
                </>
              ) : (
                <p className="text-[var(--color-muted)]">This agreement has not been locked yet.</p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2 className="label">Verify</h2></div>
            <div className="grid gap-2 p-5 text-xs">
              <a className="mono text-[var(--color-deep)] underline underline-offset-4 break-all"
                 href={`${explorer}/address/${configResult.ok ? configResult.config.contractAddress : ""}`}
                 target="_blank" rel="noreferrer">
                Contract {configResult.ok ? configResult.config.contractAddress : ""}
              </a>
              {agreement.fingerprint ? (
                <p className="mono break-all text-[var(--color-muted)]">
                  Fingerprint {agreement.fingerprint}
                </p>
              ) : null}
              {latest ? (
                <p className="text-[var(--color-muted)]">
                  Verdict {latest.verdict_id}, {latest.policy_rules}
                </p>
              ) : null}
              <Link href="/explore" className="text-[var(--color-deep)] underline underline-offset-4">
                Every agreement on this contract
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
