/** The app refuses to run against a configuration it cannot trust, and says why. */
export function ConfigProblem({ problems }: { problems: string[] }) {
  return (
    <main className="shell py-16">
      <div className="card max-w-2xl p-6">
        <h1 className="text-xl">PACT is not configured</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          The interface reads one contract on one network, and both are set in the environment. It will
          not guess them.
        </p>
        <ul className="mt-4 grid gap-2 text-sm">
          {problems.map((p) => (
            <li key={p} className="border-l-2 border-[var(--color-violated)] pl-3">{p}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Copy <code className="mono">.env.example</code> to <code className="mono">.env.local</code> and
          fill in the deployment from <code className="mono">docs/deployment.json</code>.
        </p>
      </div>
    </main>
  );
}
