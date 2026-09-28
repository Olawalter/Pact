import { createClient } from "genlayer-js";
import type { GenLayerClient as SdkClient } from "genlayer-js/types";

import { NETWORKS } from "@/lib/genlayer/network";
import type { AppConfig } from "@/lib/genlayer/config";

/**
 * Two clients, because reading and writing are different acts:
 *
 *   - a read client with no account, used by every page. Anyone can read PACT,
 *     including a visitor with no wallet at all;
 *   - a write client bound to the connected wallet, created only when the
 *     visitor is about to sign something.
 */

export type GenLayerClient = SdkClient;

export function readClient(config: AppConfig): GenLayerClient {
  return createClient({
    chain: { ...NETWORKS[config.network].chain, id: config.chainId },
    endpoint: config.rpcUrl,
  }) as GenLayerClient;
}

export function writeClient(config: AppConfig, account: `0x${string}`,
                            provider: unknown): GenLayerClient {
  return createClient({
    chain: { ...NETWORKS[config.network].chain, id: config.chainId },
    endpoint: config.rpcUrl,
    account,
    // the injected wallet signs; PACT never holds a key
    provider: provider as never,
  }) as GenLayerClient;
}
