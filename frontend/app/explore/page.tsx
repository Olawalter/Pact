"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LifecycleChip, ResultChip } from "@/components/agreement/chips";
import { useAgreements } from "@/lib/genlayer/hooks";
import { agreementLabel, custodyWords, formatTime } from "@/lib/format/present";
import type { Agreement } from "@/lib/genlayer/contract";

/**
 * Every agreement on the contract, read from the contract. There is no index
 * server: the filters and the search run over what the chain returned.
 */

const FILTERS = {
  All: () => true,
  Active: (a: Agreement) => ["LOCKED", "ACTIVE"].includes(a.lifecycle),
  Pending: (a: Agreement) => ["ADJUDICATION_PENDING", "VERDICT_PROPOSED"].includes(a.lifecycle),
  Finalized: (a: Agreement) => ["FINALIZED", "CONSEQUENCE_EXECUTED"].includes(a.lifecycle),
  Fulfilled: (a: Agreement) => a.result_state === "FULFILLED",
  "Partially fulfilled": (a: Agreement) => a.result_state === "PARTIALLY_FULFILLED",
  Breached: (a: Agreement) => a.result_state === "BREACHED",
  Inconclusive: (a: Agreement) => a.result_state === "INCONCLUSIVE",
} as const;

export default function Explore() {
  const agreements = useAgreements(50);
  const [filter, setFilter] = useState<keyof typeof FILTERS>("All");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const all = agreements.data?.items ?? [];
    const needle = query.trim().toLowerCase();
    return all.filter(FILTERS[filter]).filter((a) => !needle
      || a.agreement_id.toLowerCase().includes(needle)
      || a.title.toLowerCase().includes(needle)
      || a.creator.toLowerCase().includes(needle)
      || a.counterparty.toLowerCase().includes(needle));
  }, [agreements.data, filter, query]);

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <p className="label">Explore</p>
        <h1 className="text-2xl">Agreements on this contract</h1>
        <p className="max-w-2xl text-sm text-[var(--color-muted)]">
          Read from the deployed contract each time this page loads. Nothing is indexed off-chain, so
          what you see is what the chain holds.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter">
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((key) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key}
                    onClick={() => setFilter(key)}
                    className={`shrink-0 rounded-sm border px-2.5 py-1 text-[13px] ${
                      filter === key ? "border-[var(--color-signal)] text-[var(--color-signal)]"
                        : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}>
              {key}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="sr-only">Search by identifier, title or party</span>
          <input className="control w-56" placeholder="PACT id, title or party address"
                 value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      {agreements.error ? (
        <p role="alert" className="card border-[var(--color-violated)] p-4 text-sm">
          The contract could not be read: {agreements.error}{" "}
          <button type="button" className="underline" onClick={agreements.reload}>Try again</button>
        </p>
      ) : agreements.loading ? (
        <div className="h-48 animate-pulse rounded-sm bg-white" aria-busy="true" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="card p-6">
          <p className="text-sm">
            {agreements.data?.total ? "No agreement matches that filter."
              : "No agreement has been created on this contract yet."}
          </p>
          <Link href="/agreements/new" className="btn btn-primary mt-4 w-fit">Create the first one</Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((a) => (
            <li key={a.agreement_id}>
              <Link href={`/agreements/${a.agreement_id}`}
                    className="card block p-4 hover:border-[var(--color-signal)]">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="mono text-xs text-[var(--color-muted)]">
                    {agreementLabel(a.agreement_id)}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <LifecycleChip state={a.lifecycle} />
                    {a.result_state !== "NONE" ? <ResultChip state={a.result_state} /> : null}
                  </div>
                </div>
                <h2 className="mt-1.5 text-[17px]">{a.title}</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  {a.evidence_count} evidence item{a.evidence_count === 1 ? "" : "s"},{" "}
                  {a.round_count} adjudication round{a.round_count === 1 ? "" : "s"}. {custodyWords(a)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Due {formatTime(a.deadline)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
