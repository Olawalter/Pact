import { NETWORKS, isNetworkKey, type NetworkKey } from "@/lib/genlayer/network";

/**
 * Where the app is pointed, read once from the environment. Every value is
 * public. If any of it is wrong the app says so instead of running: a page that
 * guesses its own contract address is worse than a page that refuses.
 */
export type AppConfig = {
  network: NetworkKey;
  label: string;
  chainId: number;
  contractAddress: `0x${string}`;
  rpcUrl: string;
  explorer: string;
};

export type ConfigResult =
  | { ok: true; config: AppConfig }
  | { ok: false; problems: string[] };

function read(): ConfigResult {
  const network = (process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "").trim();
  const chain = (process.env.NEXT_PUBLIC_GENLAYER_CHAIN ?? "").trim();
  const address = (process.env.NEXT_PUBLIC_PACT_CONTRACT_ADDRESS ?? "").trim();
  const rpc = (process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? "").trim();
  const problems: string[] = [];

  if (!isNetworkKey(network)) {
    problems.push(`NEXT_PUBLIC_GENLAYER_NETWORK must be one of ${Object.keys(NETWORKS).join(", ")}.`);
  }
  const known = isNetworkKey(network) ? NETWORKS[network] : NETWORKS.studionet;
  if (chain !== String(known.chainId)) {
    problems.push(`NEXT_PUBLIC_GENLAYER_CHAIN must be ${known.chainId} for ${known.label}.`);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    problems.push("NEXT_PUBLIC_PACT_CONTRACT_ADDRESS must be the deployed contract's 0x address.");
  }
  if (rpc && !/^https:\/\//.test(rpc)) {
    problems.push("NEXT_PUBLIC_GENLAYER_RPC_URL must be an https address when it is set.");
  }
  if (problems.length) return { ok: false, problems };

  return {
    ok: true,
    config: {
      network: known.key,
      label: known.label,
      chainId: known.chainId,
      contractAddress: address as `0x${string}`,
      rpcUrl: rpc || known.defaultRpcUrl,
      explorer: known.explorer,
    },
  };
}

export const configResult: ConfigResult = read();

export const explorerTx = (config: AppConfig, hash: string) => `${config.explorer}/tx/${hash}`;
export const explorerAddress = (config: AppConfig, address: string) =>
  `${config.explorer}/address/${address}`;
