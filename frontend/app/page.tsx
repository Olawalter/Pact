import Link from "next/link";

import { LatestAdjudication } from "@/components/agreement/latest-adjudication";

const STEPS = [
  ["Define", "Two parties write the agreement in their own words."],
  ["Interpret", "PACT proposes the explicit requirements those words contain."],
  ["Lock", "The creator edits them and locks the definition under a fingerprint."],
  ["Evidence", "Either party registers pages and attestations against the requirements."],
  ["Adjudicate", "Every GenLayer validator fetches the evidence and decides each requirement."],
  ["Finalize", "The agreement state is derived in code, and the locked consequence is paid."],
];

export default function Home() {
  return (
    <div className="grid gap-12">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid gap-5">
          <p className="label">Semantic agreements for GenLayer</p>
          <h1 className="text-[2.1rem] leading-[1.1] sm:text-[2.6rem]">
            Agreements that can be adjudicated on-chain.
          </h1>
          <p className="max-w-xl text-[1.0625rem] text-[var(--color-muted)]">
            PACT turns natural-language commitments into semantic constraints, evaluates real-world
            evidence through GenLayer, and settles the resulting state deterministically.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/agreements/new" className="btn btn-primary">Create agreement</Link>
            <Link href="/explore" className="btn">Explore agreements</Link>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="label">How an agreement is decided</h2>
          </div>
          <ol className="grid gap-0 p-4">
            {STEPS.map(([name, text], i) => (
              <li key={name} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                <div className="flex flex-col items-center">
                  <span aria-hidden="true"
                        className={`mono flex h-7 w-7 items-center justify-center border text-[11px] ${
                          i === STEPS.length - 1
                            ? "border-[var(--color-signal)] bg-[var(--color-signal)] text-white"
                            : "border-[var(--color-border)] text-[var(--color-deep)]"}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {i < STEPS.length - 1 ? <span className="h-full w-px bg-[var(--color-border)]" aria-hidden /> : null}
                </div>
                <div className="pb-4">
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-sm text-[var(--color-muted)]">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="grid gap-6 rule pt-10 lg:grid-cols-3">
        <div className="grid content-start gap-2">
          <h2 className="label">01 · The problem</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Most agreements turn on things a deterministic contract cannot check: whether a delivery
            matched what was promised, whether the required fields are present, whether a citation is
            real. Today someone decides that off-chain, and whoever decides it holds the outcome.
          </p>
        </div>
        <div className="grid content-start gap-2">
          <h2 className="label">02 · What PACT does</h2>
          <p className="text-sm text-[var(--color-muted)]">
            The agreement is locked as explicit requirements with an evidence policy and a consequence
            policy. Each requirement is then judged against the registered evidence, and the agreement
            state is derived from those results in ordinary contract code.
          </p>
        </div>
        <div className="grid content-start gap-2">
          <h2 className="label">03 · Why GenLayer</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Reading evidence is judgement, so it is done by many validators rather than one server.
            Each fetches the sources itself and decides independently; a result is recorded only when
            they agree on every status. A round without agreement records nothing.
          </p>
        </div>
      </section>

      <section className="rule pt-10">
        <LatestAdjudication />
      </section>
    </div>
  );
}
