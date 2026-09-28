"use client";

import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

import { CONSTRAINT_TYPES, EVIDENCE_KINDS, MATERIALITIES } from "@/lib/genlayer/contract";
import { KIND_WORDS, TYPE_WORDS } from "@/lib/format/present";
import { blankConstraint, type DraftConstraint, type Problems } from "@/lib/validation/agreement";

/**
 * The requirements, as the creator edits them before locking. PACT may propose
 * them, but nothing is binding until a person has read every line and locked
 * it: the interpretation is never committed silently.
 */
export function ConstraintEditor({ constraints, problems, onChange }: {
  constraints: DraftConstraint[];
  problems: Problems;
  onChange: (next: DraftConstraint[]) => void;
}) {
  const update = (i: number, patch: Partial<DraftConstraint>) =>
    onChange(constraints.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, by: number) => {
    const next = [...constraints];
    const target = i + by;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target]!, next[i]!];
    onChange(next);
  };

  return (
    <div className="grid gap-3">
      {problems.constraints ? (
        <p role="alert" className="text-sm text-[var(--color-violated)]">{problems.constraints}</p>
      ) : null}

      <ol className="grid gap-3">
        {constraints.map((c, i) => (
          <li key={i} className="card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="mono text-xs text-[var(--color-muted)]">C{i + 1}</span>
              <div className="flex items-center gap-1">
                <button type="button" className="btn-quiet p-1" onClick={() => move(i, -1)}
                        disabled={i === 0} aria-label={`Move C${i + 1} earlier`}>
                  <ArrowUp size={15} aria-hidden />
                </button>
                <button type="button" className="btn-quiet p-1" onClick={() => move(i, 1)}
                        disabled={i === constraints.length - 1} aria-label={`Move C${i + 1} later`}>
                  <ArrowDown size={15} aria-hidden />
                </button>
                <button type="button" className="btn-quiet p-1 text-[var(--color-violated)]"
                        onClick={() => onChange(constraints.filter((_, j) => j !== i))}
                        aria-label={`Remove C${i + 1}`}>
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            </div>

            <div className="mt-2 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="label">What must be true</span>
                <input className="control" value={c.requirement}
                       aria-invalid={!!problems[`constraints.${i}.requirement`]}
                       placeholder="The report contains at least 50 companies."
                       onChange={(e) => update(i, { requirement: e.target.value })} />
                {problems[`constraints.${i}.requirement`] ? (
                  <span role="alert" className="text-xs text-[var(--color-violated)]">
                    {problems[`constraints.${i}.requirement`]}
                  </span>
                ) : null}
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="label">Kind</span>
                  <select className="control" value={c.type}
                          onChange={(e) => update(i, { type: e.target.value as DraftConstraint["type"] })}>
                    {CONSTRAINT_TYPES.map((t) => <option key={t} value={t}>{TYPE_WORDS[t]}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="label">If it fails</span>
                  <select className="control" value={c.materiality}
                          onChange={(e) => update(i, { materiality: e.target.value as DraftConstraint["materiality"] })}>
                    {MATERIALITIES.map((m) => (
                      <option key={m} value={m}>
                        {m === "MATERIAL" ? "Material: the agreement is breached"
                          : "Minor: the agreement is partially fulfilled"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-1 text-sm">
                <span className="label">Note for the panel (optional)</span>
                <input className="control" value={c.description}
                       placeholder="What counts as meeting this requirement."
                       onChange={(e) => update(i, { description: e.target.value })} />
              </label>

              <fieldset className="grid gap-1">
                <legend className="label">Evidence that may support it</legend>
                <div className="flex flex-wrap gap-3 text-sm">
                  {EVIDENCE_KINDS.map((k) => (
                    <label key={k} className="flex items-center gap-2">
                      <input type="checkbox" checked={c.evidence_requirements.includes(k)}
                             onChange={(e) => update(i, {
                               evidence_requirements: e.target.checked
                                 ? [...c.evidence_requirements, k]
                                 : c.evidence_requirements.filter((x) => x !== k),
                             })} />
                      {KIND_WORDS[k]}
                    </label>
                  ))}
                </div>
                {problems[`constraints.${i}.evidence`] ? (
                  <span role="alert" className="text-xs text-[var(--color-violated)]">
                    {problems[`constraints.${i}.evidence`]}
                  </span>
                ) : null}
              </fieldset>
            </div>
          </li>
        ))}
      </ol>

      <button type="button" className="btn w-fit"
              onClick={() => onChange([...constraints, blankConstraint()])}>
        <Plus size={15} aria-hidden /> Add a requirement
      </button>
    </div>
  );
}
