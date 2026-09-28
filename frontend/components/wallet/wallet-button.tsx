"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { configResult } from "@/lib/genlayer/config";
import { shortAddress, useWallet } from "@/lib/wallet/wallet";

/** Connect, the connected account, and the one case that blocks signing. */
export function WalletButton() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  if (wallet.status === "CONNECTED" && wallet.account) {
    return (
      <div className="flex items-center gap-2">
        {wallet.wrongNetwork ? (
          <button type="button" onClick={wallet.switchNetwork}
                  className="btn border-[var(--color-violated)] px-2.5 py-1 text-xs text-[var(--color-violated)]">
            Wrong network: switch to {configResult.ok ? configResult.config.label : "GenLayer"}
          </button>
        ) : null}
        <span className="mono hidden text-xs text-[var(--color-muted)] sm:inline" title={wallet.account}>
          {shortAddress(wallet.account)}
        </span>
        <button type="button" className="btn px-2.5 py-1 text-xs" onClick={wallet.disconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-primary px-3 py-1.5 text-sm"
              disabled={wallet.status === "CONNECTING"} onClick={() => setOpen(true)}>
        {wallet.status === "CONNECTING" ? "Connecting…" : "Connect wallet"}
      </button>

      <dialog ref={dialog} onClose={() => setOpen(false)}
              className="w-[min(26rem,92vw)] rounded-sm border border-[var(--color-border)] p-0
                         backdrop:bg-black/30" aria-label="Connect a wallet">
        <div className="grid gap-4 p-5">
          <div>
            <h2 className="text-base font-semibold">Connect a wallet</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              PACT signs with your own browser wallet. It never asks for, sees or stores a private key.
            </p>
          </div>

          {wallet.error ? (
            <p role="alert" className="border-l-2 border-[var(--color-violated)] pl-3 text-sm">
              {wallet.error}
            </p>
          ) : null}

          {wallet.wallets.length === 0 ? (
            <p className="text-sm">
              No injected wallet announced itself. Install MetaMask, Rabby or another EIP-1193 wallet,
              then reload this page.
            </p>
          ) : (
            <ul className="grid gap-2">
              {wallet.wallets.map((w) => (
                <li key={w.info.uuid}>
                  <button type="button"
                          className="flex w-full items-center gap-3 border border-[var(--color-border)]
                                     px-3 py-2.5 text-left text-sm hover:border-[var(--color-signal)]"
                          onClick={async () => { await wallet.connect(w); setOpen(false); }}>
                    {w.info.icon
                      ? <Image src={w.info.icon} alt="" width={22} height={22} unoptimized />
                      : <span className="h-[22px] w-[22px] border border-[var(--color-border)]" aria-hidden />}
                    <span>{w.info.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="btn-quiet justify-self-start text-sm underline underline-offset-4"
                  onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
