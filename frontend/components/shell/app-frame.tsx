"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ConfigProblem } from "@/components/shell/config-problem";
import { DeploymentNotice } from "@/components/shell/deployment-notice";
import { WalletButton } from "@/components/wallet/wallet-button";
import { Mark } from "@/components/shell/mark";
import { configResult } from "@/lib/genlayer/config";

const LINKS = [
  { href: "/agreements/new", label: "Create agreement" },
  { href: "/explore", label: "Explore agreements" },
];

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (!configResult.ok) return <ConfigProblem problems={configResult.problems} />;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3
                                 focus:z-50 focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-[var(--color-border)] bg-white">
        <div className="shell flex h-14 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="PACT, home">
            <Mark className="h-6 w-6" />
            <span className="text-[15px] font-semibold tracking-[0.14em]">PACT</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
            {LINKS.map((l) => {
              const on = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
              return (
                <Link key={l.href} href={l.href}
                      aria-current={on ? "page" : undefined}
                      className={`rounded-sm px-2.5 py-1.5 text-sm ${on ? "text-[var(--color-signal)] font-medium"
                        : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <WalletButton />
        </div>
      </header>

      <DeploymentNotice />

      <main id="main" className="shell flex-1 py-8">{children}</main>

      <footer className="mt-10 border-t border-[var(--color-border)] bg-white py-6">
        <div className="shell flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-muted)]">
          <p>
            Semantic agreements adjudicated by GenLayer consensus. The contract is authoritative;
            this interface decides nothing.
          </p>
          <a className="mono hover:text-[var(--color-ink)]"
             href={`${configResult.config.explorer}/address/${configResult.config.contractAddress}`}
             target="_blank" rel="noreferrer">
            {configResult.config.label}: {configResult.config.contractAddress}
          </a>
        </div>
      </footer>

      <nav className="sticky bottom-0 z-10 border-t border-[var(--color-border)] bg-white p-2 sm:hidden"
           aria-label="Main">
        <div className="flex gap-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="btn flex-1 justify-center text-[13px]">
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
