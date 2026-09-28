"use client";

import { useDeployment } from "@/lib/genlayer/hooks";

/** If the configured address is not the PACT this app knows, say so once, at the top. */
export function DeploymentNotice() {
  const check = useDeployment();
  if (check.loading || (check.data?.ok && !check.error)) return null;
  const problem = check.error ?? check.data?.problem;
  if (!problem) return null;
  return (
    <div role="alert" className="border-b border-[var(--color-violated)] bg-[#fdf3f2]">
      <p className="shell py-2 text-sm">
        <strong className="font-semibold">This address is not serving the PACT this interface knows.</strong>{" "}
        {problem}
      </p>
    </div>
  );
}
