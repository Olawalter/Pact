"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
         type ReactNode } from "react";

import { configResult } from "@/lib/genlayer/config";

/**
 * Wallet discovery and connection. PACT supports any injected wallet that
 * announces itself the standard way (EIP-6963) and falls back to a single
 * injected provider. It never asks for, sees or stores a private key.
 */

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string };
type Detected = { info: WalletInfo; provider: Eip1193Provider };

export type WalletStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

export type Wallet = {
  status: WalletStatus;
  account?: `0x${string}`;
  chainId?: number;
  provider?: Eip1193Provider;
  wallets: Detected[];
  wrongNetwork: boolean;
  error?: string;
  connect: (wallet: Detected) => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
};

const WalletContext = createContext<Wallet | null>(null);

const hexChain = (id: number) => `0x${id.toString(16)}`;

function useDetected(): Detected[] {
  const [wallets, setWallets] = useState<Detected[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const found = new Map<string, Detected>();
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<Detected>).detail;
      if (!detail?.info?.uuid) return;
      found.set(detail.info.uuid, detail);
      setWallets([...found.values()]);
    };
    window.addEventListener("eip6963:announceProvider", announce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const injected = (window as { ethereum?: Eip1193Provider }).ethereum;
    const timer = setTimeout(() => {
      if (found.size === 0 && injected) {
        setWallets([{ info: { uuid: "injected", name: "Browser wallet", icon: "", rdns: "injected" },
                      provider: injected }]);
      }
    }, 350);
    return () => {
      window.removeEventListener("eip6963:announceProvider", announce as EventListener);
      clearTimeout(timer);
    };
  }, []);
  return wallets;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useDetected();
  const [current, setCurrent] = useState<Detected | undefined>();
  const [account, setAccount] = useState<`0x${string}` | undefined>();
  const [chainId, setChainId] = useState<number | undefined>();
  const [status, setStatus] = useState<WalletStatus>("DISCONNECTED");
  const [error, setError] = useState<string | undefined>();
  const connecting = useRef(false);

  const readChain = useCallback(async (provider: Eip1193Provider) => {
    try {
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(Number.parseInt(id, 16));
    } catch {
      setChainId(undefined);
    }
  }, []);

  const connect = useCallback(async (wallet: Detected) => {
    if (connecting.current) return;
    connecting.current = true;
    setStatus("CONNECTING");
    setError(undefined);
    try {
      const accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as string[];
      const first = accounts?.[0];
      if (!first) throw new Error("That wallet returned no account.");
      // the chain is read before the app reports itself connected
      await readChain(wallet.provider);
      setCurrent(wallet);
      setAccount(first.toLowerCase() as `0x${string}`);
      setStatus("CONNECTED");
    } catch (err) {
      const code = (err as { code?: number })?.code;
      setError(code === 4001 ? "You declined the connection request."
               : String((err as { message?: string })?.message ?? "That wallet would not connect."));
      setStatus("DISCONNECTED");
    } finally {
      connecting.current = false;
    }
  }, [readChain]);

  const disconnect = useCallback(() => {
    setCurrent(undefined);
    setAccount(undefined);
    setChainId(undefined);
    setStatus("DISCONNECTED");
    setError(undefined);
  }, []);

  useEffect(() => {
    const provider = current?.provider;
    if (!provider?.on) return;
    const onAccounts = (...args: never[]) => {
      const accounts = args[0] as unknown as string[] | undefined;
      const next = accounts?.[0];
      if (!next) disconnect();
      else setAccount(next.toLowerCase() as `0x${string}`);
    };
    const onChain = (...args: never[]) => {
      const id = args[0] as unknown as string;
      setChainId(Number.parseInt(id, 16));
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [current, disconnect]);

  const switchNetwork = useCallback(async () => {
    const provider = current?.provider;
    if (!provider || !configResult.ok) return;
    const { chainId: want, rpcUrl, explorer, label } = configResult.config;
    setError(undefined);
    try {
      await provider.request({ method: "wallet_switchEthereumChain",
                               params: [{ chainId: hexChain(want) }] });
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 4902 || code === -32603) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: hexChain(want),
              chainName: label,
              nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
              rpcUrls: [rpcUrl],
              blockExplorerUrls: [explorer],
            }],
          });
        } catch (addErr) {
          setError(String((addErr as { message?: string })?.message
                          ?? "Your wallet would not add this network."));
          return;
        }
      } else if (code === 4001) {
        setError("You declined the network switch in your wallet.");
        return;
      } else {
        setError(String((err as { message?: string })?.message
                        ?? "Your wallet would not switch network."));
        return;
      }
    }
    await readChain(provider);
  }, [current, readChain]);

  const value = useMemo<Wallet>(() => ({
    status,
    account,
    chainId,
    provider: current?.provider,
    wallets,
    wrongNetwork: status === "CONNECTED" && configResult.ok && chainId !== undefined
      && chainId !== configResult.config.chainId,
    error,
    connect,
    disconnect,
    switchNetwork,
  }), [status, account, chainId, current, wallets, error, connect, disconnect, switchNetwork]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): Wallet {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("useWallet was called outside the wallet provider");
  return wallet;
}

export const shortAddress = (address?: string) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
