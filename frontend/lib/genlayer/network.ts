import { studionet } from "genlayer-js/chains";
import type { GenLayerChain } from "genlayer-js/types";

/**
 * The networks PACT can be configured for. The chain definition comes from
 * genlayer-js itself, never from a chain id typed into this repository: an app
 * that hardcodes a network is one release behind the network it talks to.
 */
export const NETWORKS = {
  studionet: {
    key: "studionet" as const,
    label: "GenLayer StudioNet",
    chain: studionet as GenLayerChain,
    chainId: studionet.id,
    defaultRpcUrl: studionet.rpcUrls.default.http[0] ?? "https://studio.genlayer.com/api",
    explorer: studionet.blockExplorers?.default.url ?? "https://explorer-studio.genlayer.com",
    /** StudioNet funds any address from its own faucet; there is nothing to buy. */
    faucet: "built in: the account selector's faucet button",
  },
} as const;

export type NetworkKey = keyof typeof NETWORKS;

export const isNetworkKey = (value: string): value is NetworkKey =>
  Object.prototype.hasOwnProperty.call(NETWORKS, value);
