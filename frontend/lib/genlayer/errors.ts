/**
 * What went wrong, in words a party can act on. The contract refuses in its own
 * sentence; this file keeps that sentence and only removes the protocol tag.
 * "Something went wrong" appears nowhere.
 */

export type FailureKind =
  | "WALLET_REJECTED"
  | "WALLET_MISSING"
  | "WRONG_NETWORK"
  | "INSUFFICIENT_FUNDS"
  | "CONTRACT_REFUSED"
  | "NO_CONSENSUS"
  | "TRANSACTION_FAILED"
  | "STATE_NOT_CAUGHT_UP"
  | "TIMEOUT"
  | "READ_FAILED";

const TAGS = ["[EXPECTED]", "[EXTERNAL]", "[TRANSIENT]", "[LLM_ERROR]"];

/** The contract's own sentence, without the tag it classifies itself by. */
export function refusalSentence(text: string): string {
  let out = text.trim();
  for (const tag of TAGS) {
    if (out.startsWith(tag)) out = out.slice(tag.length).trim();
  }
  out = readableTimes(out);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * The contract measures its windows in seconds since the epoch, because that is
 * what a transaction carries, and it says so when it refuses. Nobody reads
 * 1790660590, so it is shown as the moment it means.
 */
function readableTimes(text: string): string {
  return text.replace(/\b\d{10}\b/g, (digits) => {
    const seconds = Number(digits);
    if (seconds < 1_600_000_000 || seconds > 4_000_000_000) return digits;
    return new Date(seconds * 1000)
      .toISOString().replace("T", " ").replace(/:\d\d\.\d+Z$/, " UTC");
  });
}

export function walletFailure(err: unknown): { message: string; kind: FailureKind } {
  const code = (err as { code?: number })?.code;
  const raw = String((err as { message?: string })?.message ?? err ?? "");
  if (code === 4001 || /user rejected|denied/i.test(raw)) {
    return { message: "You rejected the transaction in your wallet.", kind: "WALLET_REJECTED" };
  }
  if (/insufficient/i.test(raw)) {
    return {
      message: "That account does not hold enough GEN for this transaction and the value it carries.",
      kind: "INSUFFICIENT_FUNDS",
    };
  }
  if (code === 4100 || /unauthorized/i.test(raw)) {
    return { message: "Your wallet did not authorize this account.", kind: "WALLET_REJECTED" };
  }
  if (/chain|network/i.test(raw)) {
    return { message: "Your wallet is on another network.", kind: "WRONG_NETWORK" };
  }
  return { message: raw || "The wallet could not send the transaction.", kind: "TRANSACTION_FAILED" };
}

export function readFailure(err: unknown): string {
  const raw = String((err as { message?: string })?.message ?? err ?? "");
  if (/rate limit|-32029/i.test(raw)) {
    return "StudioNet is rate limiting this address. Wait a minute and try again.";
  }
  if (/fetch|network|Failed to fetch/i.test(raw)) return "The GenLayer endpoint could not be reached.";
  return refusalSentence(raw) || "The contract could not be read.";
}

/** True when a read failed because the record does not exist. */
export const isMissing = (err: unknown): boolean =>
  /there is no agreement|there is no evidence|has no round/i.test(
    String((err as { message?: string })?.message ?? err ?? ""),
  );
