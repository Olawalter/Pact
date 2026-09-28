"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";

import { AvailabilityChip } from "@/components/agreement/chips";
import { TxPanel } from "@/components/transaction/tx-panel";
import { acknowledgeCall, agreementChanged, evidenceCall, type Agreement, type Constraint,
         type Evidence, type Verdict } from "@/lib/genlayer/contract";
import { usePact, useSend } from "@/lib/genlayer/hooks";
import { evidenceLabel, formatTime, KIND_WORDS } from "@/lib/format/present";
import { blankEvidence, evidenceFrom, originOf, validateEvidence,
         type EvidenceDraft } from "@/lib/validation/agreement";
import { shortAddress, useWallet } from "@/lib/wallet/wallet";

/**
 * The case file: what each party put on the record, what the panel found when
 * it fetched it, and where two items disagree. Contradictions are shown, never
 * hidden.
 */
export function EvidencePanel({ agreement, evidence, latest, onChanged }: {
  agreement: Agreement;
  evidence: Evidence[];
  latest?: Verdict;
  onChanged: () => void;
}) {
  const wallet = useWallet();
  const { client, config } = usePact();
  const sender = useSend();
  const [draft, setDraft] = useState<EvidenceDraft>(blankEvidence);
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState(false);

  const constraints = agreement.definition?.constraints ?? [];
  const problems = validateEvidence(draft);
  const party = wallet.account?.toLowerCase() === agreement.creator.toLowerCase() ? "creator"
    : wallet.account?.toLowerCase() === agreement.counterparty.toLowerCase() ? "counterparty" : "";
  const canSubmit = agreement.lifecycle === "ACTIVE" && !!party;
  const read = (id: string) => latest?.evidence.find((e) => e.evidence_id === id);

  const submit = async () => {
    setShown(true);
    if (Object.keys(problems).length) return;
    const before = agreement.evidence_count;
    await sender.send({
      call: evidenceCall(agreement.agreement_id, evidenceFrom(draft)),
      reconciled: agreementChanged(client, config, agreement.agreement_id,
                                   (a) => a.evidence_count > before),
      onRecorded: () => { setDraft(blankEvidence()); setAdding(false); setShown(false); onChanged(); },
    });
  };

  const acknowledge = async (id: string) => {
    await sender.send({
      call: acknowledgeCall(agreement.agreement_id, id),
      reconciled: async () => true,
      onRecorded: onChanged,
      onSettled: onChanged,
    });
  };

  return (
    <div className="grid gap-4">
      {evidence.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          No evidence has been registered. A web source is fetched by every validator at adjudication;
          an attestation is a party&apos;s own account, and counts for less unless the other party
          acknowledges it.
        </p>
      ) : (
        <ul className="grid gap-3">
          {evidence.map((e) => {
            const found = read(e.evidence_id);
            const mine = e.submitter.toLowerCase() === wallet.account?.toLowerCase();
            const canAcknowledge = e.kind === "ATTESTATION" && !e.acknowledged_by && !!party && !mine
              && agreement.lifecycle === "ACTIVE";
            return (
              <li key={e.evidence_id} className="border border-[var(--color-border)] bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="mono text-xs text-[var(--color-muted)]">{e.evidence_id}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip text-[var(--color-muted)]">{KIND_WORDS[e.kind]}</span>
                    {found ? <AvailabilityChip value={found.availability} /> : null}
                  </div>
                </div>

                <p className="mt-1 text-sm font-medium">{evidenceLabel(e)}</p>

                {e.kind === "WEB_SOURCE" ? (
                  <a href={e.source} target="_blank" rel="noreferrer"
                     className="mono mt-1 inline-flex items-center gap-1 break-all text-xs
                                text-[var(--color-deep)] underline underline-offset-4">
                    {e.source} <ExternalLink size={12} aria-hidden />
                  </a>
                ) : (
                  <p className="agreement-text mt-1 whitespace-pre-wrap text-[15px]">{e.text}</p>
                )}

                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]
                               sm:grid-cols-4">
                  <div><dt className="inline">Publisher: </dt><dd className="inline">{e.origin}</dd></div>
                  <div><dt className="inline">Registered by: </dt>
                    <dd className="inline">{shortAddress(e.submitter)}{mine ? " (you)" : ""}</dd></div>
                  <div><dt className="inline">Speaks to: </dt>
                    <dd className="inline">{e.related_constraints.join(", ")}</dd></div>
                  <div><dt className="inline">Registered: </dt>
                    <dd className="inline">{formatTime(e.submitted_at)}</dd></div>
                  {e.observation_period ? (
                    <div><dt className="inline">Covers: </dt><dd className="inline">{e.observation_period}</dd></div>
                  ) : null}
                  {e.acknowledged_by ? (
                    <div><dt className="inline">Acknowledged by: </dt>
                      <dd className="inline">{shortAddress(e.acknowledged_by)}</dd></div>
                  ) : null}
                  {found?.excerpt_digest ? (
                    <div className="col-span-2"><dt className="inline">What the panel read: </dt>
                      <dd className="mono inline">{found.excerpt_digest.slice(0, 16)}…</dd></div>
                  ) : null}
                </dl>

                {canAcknowledge ? (
                  <button type="button" className="btn mt-2 px-2.5 py-1 text-xs"
                          disabled={sender.busy} onClick={() => acknowledge(e.evidence_id)}>
                    Acknowledge this attestation
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canSubmit ? (
        adding ? (
          <div className="card grid gap-3 p-4">
            <fieldset className="grid gap-2">
              <legend className="label">What kind of evidence</legend>
              <div className="flex gap-4 text-sm">
                {(["WEB_SOURCE", "ATTESTATION"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="radio" name="kind" checked={draft.kind === k}
                           onChange={() => setDraft({ ...draft, kind: k })} />
                    {KIND_WORDS[k]}
                  </label>
                ))}
              </div>
            </fieldset>

            {draft.kind === "WEB_SOURCE" ? (
              <label className="grid gap-1 text-sm">
                <span className="label">Address the validators will fetch</span>
                <input className="control mono" value={draft.source} placeholder="https://…"
                       aria-invalid={shown && !!problems.source}
                       onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
                {draft.source && originOf(draft.source) ? (
                  <span className="text-xs text-[var(--color-muted)]">
                    Counts as the publisher {originOf(draft.source)}.
                  </span>
                ) : null}
                {shown && problems.source ? (
                  <span role="alert" className="text-xs text-[var(--color-violated)]">{problems.source}</span>
                ) : null}
              </label>
            ) : (
              <label className="grid gap-1 text-sm">
                <span className="label">What you are attesting to</span>
                <textarea className="control agreement-text" rows={4} value={draft.text}
                          aria-invalid={shown && !!problems.text}
                          onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
                {shown && problems.text ? (
                  <span role="alert" className="text-xs text-[var(--color-violated)]">{problems.text}</span>
                ) : null}
              </label>
            )}

            <label className="grid gap-1 text-sm">
              <span className="label">Label (optional)</span>
              <input className="control" value={draft.label}
                     onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </label>

            <fieldset className="grid gap-2">
              <legend className="label">Which requirements it speaks to</legend>
              <div className="flex flex-wrap gap-3 text-sm">
                {constraints.map((c: Constraint) => (
                  <label key={c.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.constraints.includes(c.id)}
                           onChange={(e) => setDraft({
                             ...draft,
                             constraints: e.target.checked
                               ? [...draft.constraints, c.id]
                               : draft.constraints.filter((x) => x !== c.id),
                           })} />
                    <span className="mono text-xs">{c.id}</span>
                  </label>
                ))}
              </div>
              {shown && problems.constraints ? (
                <span role="alert" className="text-xs text-[var(--color-violated)]">{problems.constraints}</span>
              ) : null}
            </fieldset>

            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" disabled={sender.busy} onClick={submit}>
                {sender.busy ? "Registering…" : "Register this evidence"}
              </button>
              <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
            </div>
            <TxPanel state={sender.state} done="Registered in the contract." />
          </div>
        ) : (
          <button type="button" className="btn w-fit" onClick={() => setAdding(true)}>
            <Plus size={15} aria-hidden /> Register evidence
          </button>
        )
      ) : null}
    </div>
  );
}
