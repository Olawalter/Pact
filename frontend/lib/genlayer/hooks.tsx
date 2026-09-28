"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
         type ReactNode } from "react";

import { readClient, writeClient, type GenLayerClient } from "@/lib/genlayer/client";
import { configResult, type AppConfig } from "@/lib/genlayer/config";
import { checkSchema, reads, type Agreement, type Call, type Evidence, type Transition,
         type Verdict } from "@/lib/genlayer/contract";
import { readFailure } from "@/lib/genlayer/errors";
import { initialTx, runWrite, type TxState } from "@/lib/genlayer/lifecycle";
import { useWallet } from "@/lib/wallet/wallet";

/**
 * Reading and writing, with the states a page needs to tell "nothing yet" from
 * "the read failed". Pages poll slowly and stop when a record can no longer
 * change: on StudioNet a contract read is counted against the same hourly
 * allowance as the visitor's own transactions, so a chatty page would leave
 * them unable to sign.
 */

export const LIST_POLL_MS = 120_000;
export const DETAIL_POLL_MS = 120_000;

type Ctx = { client: GenLayerClient; config: AppConfig };
const PactContext = createContext<Ctx | null>(null);

export function PactProvider({ children }: { children: ReactNode }) {
  const value = useMemo<Ctx | null>(() => {
    if (!configResult.ok) return null;
    return { client: readClient(configResult.config), config: configResult.config };
  }, []);
  if (!value) return <>{children}</>;
  return <PactContext.Provider value={value}>{children}</PactContext.Provider>;
}

export function usePact(): Ctx {
  const ctx = useContext(PactContext);
  if (!ctx) throw new Error("This page needs a valid PACT configuration.");
  return ctx;
}

export type Query<T> = {
  data?: T;
  error?: string;
  loading: boolean;
  reload: () => void;
};

export function useRead<T>(key: string, run: (c: GenLayerClient, cfg: AppConfig) => Promise<T>,
                           options: { enabled?: boolean; pollMs?: number;
                                      until?: (data: T) => boolean } = {}): Query<T> {
  const { client, config } = usePact();
  const { enabled = true, pollMs } = options;
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>();
  const runRef = useRef(run);
  const untilRef = useRef(options.until);
  const readKey = `${key}#${nonce}`;

  useEffect(() => {
    runRef.current = run;
    untilRef.current = options.until;
  });

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    let loadedOnce = false;
    const tick = async () => {
      // a hidden tab stops polling, but always takes its first read: a page
      // opened in the background must still have something to show
      if (pollMs && hidden() && loadedOnce) {
        timer = setTimeout(tick, pollMs);
        return;
      }
      let done = false;
      try {
        const value = await runRef.current(client, config);
        loadedOnce = true;
        done = !!untilRef.current?.(value);
        if (live) setState({ key: readKey, data: value });
      } catch (err) {
        if (live) setState({ key: readKey, error: readFailure(err) });
      } finally {
        if (live && pollMs && !done) timer = setTimeout(tick, pollMs);
      }
    };
    void tick();
    const onVisible = () => {
      if (!pollMs || hidden()) return;
      if (timer) clearTimeout(timer);
      void tick();
    };
    if (pollMs) document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      if (pollMs) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, config, readKey, enabled, pollMs]);

  const settled = state?.key === readKey ? state : undefined;
  return {
    data: settled?.data ?? state?.data,
    error: settled?.error,
    loading: enabled && !settled,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}

export type AgreementView = { agreement: Agreement; evidence: Evidence[]; verdicts: Verdict[];
                              history: Transition[] };

export const isOver = (v: AgreementView) =>
  v.agreement.lifecycle === "CONSEQUENCE_EXECUTED" || v.agreement.lifecycle === "CANCELLED";

export function useAgreement(id: string, pollMs?: number, enabled = true): Query<AgreementView> {
  return useRead(`agreement:${id}`, async (c, cfg) => {
    const agreement = await reads.agreement(c, cfg, id);
    const [evidence, verdicts, history] = await Promise.all([
      reads.evidence(c, cfg, id, 0, 30),
      reads.verdicts(c, cfg, id, 0, 10),
      reads.history(c, cfg, id, 0, 30),
    ]);
    return { agreement, evidence: evidence.items, verdicts: verdicts.items,
             history: [...history.items].reverse() };
  }, { pollMs, until: isOver, enabled: enabled && !!id });
}

export const useAgreements = (limit = 50) =>
  useRead(`agreements:${limit}`, (c, cfg) => reads.agreements(c, cfg, 0, limit),
          { pollMs: LIST_POLL_MS });

export const useTransitions = (limit = 12) =>
  useRead(`transitions:${limit}`, (c, cfg) => reads.transitions(c, cfg, 0, limit),
          { pollMs: LIST_POLL_MS });

export const useProtocol = () => useRead("protocol", (c, cfg) => reads.protocol(c, cfg));

export const useProposal = (id: string, enabled: boolean) =>
  useRead(`proposal:${id}`, (c, cfg) => reads.proposal(c, cfg, id), { enabled });

/** The deployed contract, compared with the methods this app calls. */
export function useDeployment(): Query<{ ok: boolean; problem: string | null }> {
  return useRead("deployment", async (c, cfg) => {
    const schema = await c.getContractSchema(cfg.contractAddress);
    const problem = checkSchema(schema);
    return { ok: !problem, problem };
  });
}

export type SendOptions = {
  call: Call;
  reconciled: () => Promise<boolean>;
  onRecorded?: () => void;
  onSettled?: (final: TxState) => void;
};

export function useSend() {
  const { config, client: reader } = usePact();
  const wallet = useWallet();
  const [state, setState] = useState<TxState>(initialTx);

  const send = useCallback(async ({ call, reconciled, onRecorded, onSettled }: SendOptions) => {
    if (!wallet.account || !wallet.provider) {
      const next: TxState = { ...initialTx, phase: "FAILED", failure: "WALLET_MISSING",
                              message: "Connect a wallet first." };
      setState(next);
      return next;
    }
    if (wallet.wrongNetwork) {
      const next: TxState = { ...initialTx, phase: "FAILED", failure: "WRONG_NETWORK",
                              message: `Switch your wallet to ${config.label} before signing.` };
      setState(next);
      return next;
    }
    const final = await runWrite({
      config,
      client: writeClient(config, wallet.account, wallet.provider),
      call,
      reconciled,
      onRecorded,
      poller: reader,
      onUpdate: setState,
    });
    onSettled?.(final);
    return final;
  }, [config, reader, wallet.account, wallet.provider, wallet.wrongNetwork]);

  return {
    state,
    busy: state.phase === "RUNNING",
    send,
    reset: useCallback(() => setState(initialTx), []),
  };
}

/** The browser clock in UTC seconds, for offering acts and nothing else. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
