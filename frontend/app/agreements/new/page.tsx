"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { ConstraintEditor } from "@/components/agreement/constraint-editor";
import { TxPanel } from "@/components/transaction/tx-panel";
import { agreementChanged, agreementCreated, createCall, lockCall, reads, verbCall,
         type EvidenceKind } from "@/lib/genlayer/contract";
import { RECOVERY_WORDS, TYPE_WORDS, formatGen, formatTime, MATERIALITY_WORDS,
         KIND_WORDS } from "@/lib/format/present";
import { usePact, useNow, useSend } from "@/lib/genlayer/hooks";
import { blankDraft, definitionFrom, validateDraft, type Draft } from "@/lib/validation/agreement";
import { toAtto } from "@/lib/format/present";
import { useWallet } from "@/lib/wallet/wallet";

/**
 * Five steps, exactly as the specification asks: the agreement, its
 * constraints, the evidence policy, the consequence, and a review. The draft is
 * on chain from the first step, because PACT's own interpretation is asked of
 * the contract, not of a server.
 */

const STEPS = ["Agreement", "Constraints", "Evidence", "Consequence", "Review"] as const;

export default function NewAgreement() {
  const router = useRouter();
  const wallet = useWallet();
  const { client, config } = usePact();
  const sender = useSend();
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<Draft>(() => blankDraft(Math.floor(Date.now() / 1000)));
  const [agreementId, setAgreementId] = useState<string>("");
  const [proposing, setProposing] = useState(false);
  const [notice, setNotice] = useState<string>("");

  const now = useNow(30_000);
  const problems = useMemo(() => validateDraft(draft, now), [draft, now]);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const visible = (key: string) => (shown.has(step) ? problems[key] : undefined);

  const stepFields: Record<number, string[]> = {
    0: ["title", "counterparty", "terms", "deadline"],
    1: ["constraints"],
    2: ["requiredKinds", "minOrigins"],
    3: ["amount", "bond", "fulfilledPct", "partialPct", "breachedPct", "forfeitPct", "recovery"],
    4: [],
  };
  const stepProblems = (i: number) =>
    Object.entries(problems).filter(([k]) =>
      (stepFields[i] ?? []).some((f) => k === f || k.startsWith(`${f}.`)));

  const createDraft = async () => {
    setShown((s) => new Set(s).add(0));
    if (stepProblems(0).length || !wallet.account) return;
    const known = (await reads.byParty(client, config, wallet.account, 0, 1).catch(() => null))?.total;
    if (known === undefined) {
      setNotice("The contract could not be read just now, so nothing was sent. Try again in a moment.");
      return;
    }
    setNotice("");
    await sender.send({
      call: createCall(draft.title.trim(), draft.terms.trim(), draft.counterparty.trim()),
      reconciled: agreementCreated(client, config, wallet.account, known),
      onRecorded: async () => {
        const page = await reads.byParty(client, config, wallet.account!, 0, 1).catch(() => null);
        const id = page?.items[0]?.agreement_id;
        if (id) {
          setAgreementId(id);
          setStep(1);
        }
      },
    });
  };

  const propose = async () => {
    if (!agreementId) return;
    setProposing(true);
    await sender.send({
      call: verbCall("propose_constraints", agreementId),
      reconciled: agreementChanged(client, config, agreementId,
                                   (a) => a.lifecycle === "CONSTRAINTS_REVIEW"),
      onRecorded: async () => {
        const proposal = await reads.proposal(client, config, agreementId).catch(() => null);
        if (proposal?.constraints.length) {
          set({
            constraints: proposal.constraints.map((c) => ({
              type: c.type,
              requirement: c.requirement,
              description: c.description ?? "",
              materiality: c.materiality,
              evidence_requirements: ["WEB_SOURCE", "ATTESTATION"] as EvidenceKind[],
            })),
          });
          setNotice("PACT proposed these requirements. They bind nothing until you lock them: edit, "
                    + "remove or add whatever the agreement actually means.");
        }
      },
      onSettled: () => setProposing(false),
    });
  };

  const lock = async () => {
    if (!agreementId || Object.keys(problems).length) return;
    await sender.send({
      call: lockCall(agreementId, definitionFrom(draft)),
      reconciled: agreementChanged(client, config, agreementId, (a) => !!a.fingerprint),
      onRecorded: () => router.push(`/agreements/${agreementId}`),
    });
  };

  const deadlineLocal = new Date(draft.deadline * 1000).toISOString().slice(0, 16);

  // minmax(0,1fr): an auto grid track will not shrink below the widest thing in
  // it, so on a phone one long line pushes the whole page sideways
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <header className="grid gap-2">
        <p className="label">Create agreement</p>
        <h1 className="text-2xl">Write it in your own words, then make the requirements explicit</h1>
        <p className="max-w-2xl text-sm text-[var(--color-muted)]">
          Once you lock an agreement, its words, its requirements, its evidence policy, its deadline and
          its consequence cannot change. Everything before that is a draft.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <ol className="no-scrollbar flex gap-1 overflow-x-auto lg:grid lg:content-start"
            aria-label="Steps">
          {STEPS.map((label, i) => {
            const done = i < step && stepProblems(i).length === 0;
            const locked = i > 0 && !agreementId;
            return (
              <li key={label} className="shrink-0">
                <button type="button" onClick={() => !locked && setStep(i)} disabled={locked}
                        aria-current={i === step ? "step" : undefined}
                        className={`flex w-full items-baseline gap-2.5 px-2 py-1.5 text-left text-sm ${
                          i === step ? "bg-white font-medium" : "text-[var(--color-muted)]"} ${
                          locked ? "opacity-40" : ""}`}>
                  <span aria-hidden="true" className={`mono text-[11px] ${
                    i === step ? "text-[var(--color-signal)]" : done ? "text-[var(--color-satisfied)]" : ""}`}>
                    {done ? "✓" : String(i + 1).padStart(2, "0")}
                  </span>
                  {label}
                  {done ? <span className="sr-only">, complete</span> : null}
                </button>
              </li>
            );
          })}
        </ol>

        <section className="card" aria-labelledby="step-title">
          <div className="card-head">
            <h2 id="step-title" className="label">
              {String(step + 1).padStart(2, "0")} · {STEPS[step]}
            </h2>
            {agreementId ? (
              <span className="mono text-xs text-[var(--color-muted)]">draft {agreementId}</span>
            ) : null}
          </div>

          <div className="grid gap-5 p-5">
            {notice ? (
              <p className="border-l-2 border-[var(--color-signal)] pl-3 text-sm">{notice}</p>
            ) : null}

            {step === 0 ? (
              <div className="grid gap-4">
                <label className="grid gap-1 text-sm">
                  <span className="label">Title</span>
                  <input className="control" value={draft.title} aria-invalid={!!visible("title")}
                         placeholder="Verified company research report"
                         onChange={(e) => set({ title: e.target.value })} />
                  {visible("title") ? <Problem text={problems.title!} /> : null}
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="label">Counterparty</span>
                  <input className="control mono" value={draft.counterparty}
                         aria-invalid={!!visible("counterparty")} placeholder="0x…"
                         onChange={(e) => set({ counterparty: e.target.value })} />
                  <span className="text-xs text-[var(--color-muted)]">
                    The other party&apos;s account. You are recorded as the creator when you sign.
                  </span>
                  {visible("counterparty") ? <Problem text={problems.counterparty!} /> : null}
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="label">The agreement, in your own words</span>
                  <textarea className="control agreement-text" rows={6} value={draft.terms}
                            aria-invalid={!!visible("terms")}
                            placeholder="The research agent must deliver a report containing 50 verified companies before the deadline…"
                            onChange={(e) => set({ terms: e.target.value })} />
                  {visible("terms") ? <Problem text={problems.terms!} /> : null}
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="label">Deadline (UTC)</span>
                  <input type="datetime-local" className="control" value={deadlineLocal}
                         aria-invalid={!!visible("deadline")}
                         onChange={(e) => {
                           const ms = Date.parse(`${e.target.value}:00Z`);
                           if (Number.isFinite(ms)) set({ deadline: Math.floor(ms / 1000) });
                         }} />
                  <span className="text-xs text-[var(--color-muted)]">
                    The contract checks this again when you lock, against the transaction&apos;s own time.
                  </span>
                  {visible("deadline") ? <Problem text={problems.deadline!} /> : null}
                </label>

                {!agreementId ? (
                  <div className="grid gap-2">
                    {!wallet.account ? (
                      <p className="text-sm text-[var(--color-open)]">
                        Connect a wallet to create the draft.
                      </p>
                    ) : null}
                    <button type="button" className="btn btn-primary w-fit"
                            disabled={!wallet.account || sender.busy} onClick={createDraft}>
                      {sender.busy ? "Creating…" : "Create the draft"}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    This draft exists on chain as {agreementId}. Nothing in it binds until you lock it.
                  </p>
                )}
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-4">
                <p className="text-sm text-[var(--color-muted)]">
                  PACT can read the agreement and propose the requirements it contains. The proposal is
                  advisory: what binds is what you lock.
                </p>
                <button type="button" className="btn w-fit" onClick={propose}
                        disabled={sender.busy || proposing}>
                  <Sparkles size={15} aria-hidden />
                  {proposing ? "Asking GenLayer…" : "Propose constraints"}
                </button>
                <ConstraintEditor constraints={draft.constraints} problems={shown.has(1) ? problems : {}}
                                  onChange={(constraints) => set({ constraints })} />
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4">
                <fieldset className="grid gap-2">
                  <legend className="label">Evidence the policy requires</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {(["WEB_SOURCE", "ATTESTATION"] as EvidenceKind[]).map((k) => (
                      <label key={k} className="flex items-center gap-2">
                        <input type="checkbox" checked={draft.requiredKinds.includes(k)}
                               onChange={(e) => set({
                                 requiredKinds: e.target.checked
                                   ? [...draft.requiredKinds, k]
                                   : draft.requiredKinds.filter((x) => x !== k),
                               })} />
                        {KIND_WORDS[k]}
                      </label>
                    ))}
                  </div>
                  {visible("requiredKinds") ? <Problem text={problems.requiredKinds!} /> : null}
                </fieldset>

                <label className="grid gap-1 text-sm">
                  <span className="label">Independent publishers needed</span>
                  <input className="control w-24" inputMode="numeric" value={draft.minOrigins}
                         aria-invalid={!!visible("minOrigins")}
                         onChange={(e) => set({ minOrigins: e.target.value })} />
                  <span className="text-xs text-[var(--color-muted)]">
                    Sources are counted by publisher, not by address: two pages from one site are one
                    voice.
                  </span>
                  {visible("minOrigins") ? <Problem text={problems.minOrigins!} /> : null}
                </label>

                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={draft.corroboration} className="mt-1"
                         onChange={(e) => set({ corroboration: e.target.checked })} />
                  <span>
                    <span className="font-medium">Require corroboration before an outcome moves value.</span>
                    <span className="block text-[var(--color-muted)]">
                      A requirement decided on one party&apos;s word alone is recorded as inconclusive rather
                      than as satisfied or violated. This protects both sides equally.
                    </span>
                  </span>
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="label">Recovery window after the deadline, in hours</span>
                  <input className="control w-28" inputMode="decimal" value={draft.recoveryHours}
                         aria-invalid={!!visible("recovery")}
                         onChange={(e) => set({ recoveryHours: e.target.value })} />
                  <span className="text-xs text-[var(--color-muted)]">
                    If nobody adjudicates within this window, the recovery rule ends the agreement.
                  </span>
                  {visible("recovery") ? <Problem text={problems.recovery!} /> : null}
                </label>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={draft.economic} className="mt-1"
                         onChange={(e) => set({ economic: e.target.checked })} />
                  <span>
                    <span className="font-medium">This agreement carries an economic consequence.</span>
                    <span className="block text-[var(--color-muted)]">
                      PACT works without one: the record of what was agreed and what the evidence showed
                      stands on its own.
                    </span>
                  </span>
                </label>

                {draft.economic ? (
                  <div className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span className="label">Amount held, in GEN</span>
                        <input className="control" inputMode="decimal" value={draft.amount}
                               aria-invalid={!!visible("amount")}
                               onChange={(e) => set({ amount: e.target.value })} />
                        {visible("amount") ? <Problem text={problems.amount!} /> : null}
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="label">Bond from the counterparty, in GEN</span>
                        <input className="control" inputMode="decimal" value={draft.bond}
                               aria-invalid={!!visible("bond")}
                               onChange={(e) => set({ bond: e.target.value })} />
                        {visible("bond") ? <Problem text={problems.bond!} /> : null}
                      </label>
                    </div>

                    <fieldset className="grid gap-3">
                      <legend className="label">What each finalized state releases</legend>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {([["fulfilledPct", "Fulfilled"], ["partialPct", "Partially fulfilled"],
                           ["breachedPct", "Breached"]] as const).map(([key, label]) => (
                          <label key={key} className="grid gap-1 text-sm">
                            <span className="text-[var(--color-muted)]">{label}</span>
                            <div className="flex items-center gap-2">
                              <input className="control" inputMode="decimal" value={draft[key]}
                                     aria-invalid={!!visible(key)}
                                     onChange={(e) => set({ [key]: e.target.value } as Partial<Draft>)} />
                              <span className="text-sm text-[var(--color-muted)]">%</span>
                            </div>
                            {visible(key) ? <Problem text={problems[key]!} /> : null}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-[var(--color-muted)]">
                        The share goes to the counterparty; the rest returns to you. No model output
                        reaches this arithmetic: only the finalized state&apos;s name.
                      </p>
                    </fieldset>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span className="label">Of the bond, forfeited on a breach</span>
                        <div className="flex items-center gap-2">
                          <input className="control" inputMode="decimal" value={draft.forfeitPct}
                                 aria-invalid={!!visible("forfeitPct")}
                                 onChange={(e) => set({ forfeitPct: e.target.value })} />
                          <span className="text-sm text-[var(--color-muted)]">%</span>
                        </div>
                        {visible("forfeitPct") ? <Problem text={problems.forfeitPct!} /> : null}
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="label">If it ends inconclusive or unadjudicated</span>
                        <select className="control" value={draft.recoveryRule}
                                onChange={(e) => set({ recoveryRule: e.target.value as Draft["recoveryRule"] })}>
                          {Object.entries(RECOVERY_WORDS).map(([key, words]) => (
                            <option key={key} value={key}>{words}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 4 ? (
              <Review draft={draft} problems={problems} goTo={(i) => { setShown((s) => new Set(s).add(i)); setStep(i); }} />
            ) : null}

            {step === 4 && agreementId ? (
              <div className="grid gap-3 border-t border-[var(--color-border)] pt-4">
                <p className="text-sm">
                  Locking freezes every line above under a fingerprint. After this, the consensus-critical
                  terms cannot change.
                </p>
                <button type="button" className="btn btn-primary w-fit"
                        disabled={sender.busy || Object.keys(problems).length > 0 || !wallet.account}
                        onClick={lock}>
                  {sender.busy ? "Locking…" : "Lock the agreement"}
                </button>
              </div>
            ) : null}

            <TxPanel state={sender.state}
                     done={agreementId ? "Recorded in the contract." : "The draft is recorded."}
                     leaderNote={proposing ? "A leader is reading the agreement and proposing requirements."
                                 : undefined} />

            <div className="flex justify-between gap-3 border-t border-[var(--color-border)] pt-4">
              <button type="button" className="btn" disabled={step === 0}
                      onClick={() => setStep((s) => Math.max(0, s - 1))}>
                Back
              </button>
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn" disabled={!agreementId}
                        onClick={() => {
                          setShown((s) => new Set(s).add(step));
                          if (stepProblems(step).length === 0) setStep((s) => s + 1);
                        }}>
                  {STEPS[step + 1]}
                </button>
              ) : <span />}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return <span role="alert" className="text-xs text-[var(--color-violated)]">{text}</span>;
}

function Review({ draft, problems, goTo }: {
  draft: Draft; problems: Record<string, string>; goTo: (step: number) => void;
}) {
  const entries = Object.entries(problems);
  return (
    <div className="grid gap-5">
      {entries.length ? (
        <div role="alert" className="border-l-2 border-[var(--color-violated)] pl-3 text-sm">
          <p className="font-medium">This agreement cannot be locked yet.</p>
          <ul className="mt-1 grid gap-0.5 text-[var(--color-muted)]">
            {entries.slice(0, 4).map(([key, text]) => <li key={key}>{text}</li>)}
          </ul>
          <button type="button" className="mt-2 underline underline-offset-4" onClick={() => goTo(0)}>
            Go back and fix it
          </button>
        </div>
      ) : null}

      <section className="grid gap-2">
        <h3 className="label">The agreement</h3>
        <p className="text-[15px] font-medium">{draft.title || "Untitled"}</p>
        <p className="agreement-text whitespace-pre-wrap">{draft.terms}</p>
        <p className="text-sm text-[var(--color-muted)]">
          Between you and <span className="mono">{draft.counterparty || "the counterparty"}</span>, due{" "}
          {formatTime(draft.deadline)}.
        </p>
      </section>

      <section className="grid gap-2">
        <h3 className="label">Requirements ({draft.constraints.length})</h3>
        <ol className="grid gap-2">
          {draft.constraints.map((c, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span className="mono text-xs text-[var(--color-muted)]">C{i + 1}</span>
              <span>
                {c.requirement}
                <span className="ml-2 text-xs text-[var(--color-muted)]">
                  {TYPE_WORDS[c.type]} · {MATERIALITY_WORDS[c.materiality].toLowerCase()}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-2">
        <h3 className="label">Evidence policy</h3>
        <p className="text-sm">
          {draft.requiredKinds.map((k) => KIND_WORDS[k]).join(" and ")} required, from at least{" "}
          {draft.minOrigins} independent publisher{draft.minOrigins === "1" ? "" : "s"}.{" "}
          {draft.corroboration
            ? "An outcome resting on one party&apos;s word alone is held as inconclusive."
            : "Corroboration is not required."}
        </p>
      </section>

      <section className="grid gap-2">
        <h3 className="label">Consequence</h3>
        {draft.economic ? (
          <ul className="grid gap-1 text-sm">
            <li>{formatGen(toAtto(draft.amount) ?? 0n)} held, bond {formatGen(toAtto(draft.bond) ?? 0n)}.</li>
            <li>Fulfilled releases {draft.fulfilledPct}%, partially fulfilled {draft.partialPct}%,
              breached {draft.breachedPct}%.</li>
            <li>On a breach, {draft.forfeitPct}% of the bond goes to you.</li>
            <li>If it ends inconclusive, {RECOVERY_WORDS[draft.recoveryRule]}.</li>
          </ul>
        ) : (
          <p className="text-sm">No economic consequence. The record is the outcome.</p>
        )}
      </section>
    </div>
  );
}
