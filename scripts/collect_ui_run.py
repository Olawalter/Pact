"""What the browser did, read back from the chain.

    python scripts/collect_ui_run.py <contract> <creator> <counterparty>

The interface run is driven by a person clicking, so there is no log to trust.
This asks the chain for every transaction those two accounts sent to the
contract, decodes which method each one called, and writes docs/ui-run.json.
The documentation is generated from that, so nothing about the run is taken on
the word of the browser it happened in.
"""
import argparse
import base64
import json
import pathlib
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RPC = "https://studio.genlayer.com/api"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
OUT = ROOT / "docs" / "ui-run.json"

METHODS = ("create_agreement", "propose_constraints", "lock_agreement", "fund_agreement",
           "cancel_agreement", "submit_evidence", "acknowledge_evidence", "request_adjudication",
           "finalize_verdict", "execute_consequence", "recover")


def rpc(method, params, attempts=6):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for i in range(attempts):
        try:
            req = urllib.request.Request(RPC, data=body,
                                         headers={"Content-Type": "application/json", "User-Agent": UA})
            out = json.load(urllib.request.urlopen(req, timeout=120))
            if "error" in out:
                raise RuntimeError(str(out["error"])[:200])
            return out["result"]
        except Exception:
            if i == attempts - 1:
                raise
            time.sleep(5 + 5 * i)


def called(tx) -> str:
    """Which method this transaction called, taken from its own calldata rather
    than from what anyone says it was."""
    blob = json.dumps(tx, default=str)
    for field in re.findall(r'"(?:data|calldata|input)"\s*:\s*"([A-Za-z0-9+/=]{8,})"', blob):
        try:
            text = base64.b64decode(field, validate=True).decode("latin-1")
        except Exception:
            continue
        for name in METHODS:
            if name in text:
                return name
    for name in METHODS:                       # some receipts carry it in readable form
        if f'"{name}"' in blob or f"'{name}'" in blob:
            return name
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("contract")
    ap.add_argument("accounts", nargs="+", help="the addresses the browser signed with")
    args = ap.parse_args()

    wanted = {a.lower() for a in args.accounts}
    rows = rpc("sim_getTransactionsForAddress", [args.contract])
    run = []
    for tx in rows:
        sender = str(tx.get("from_address") or tx.get("from") or "").lower()
        if sender not in wanted:
            continue
        # the address listing leaves out result_name, and that is the field that
        # separates a write that took effect from a round that reached no
        # majority: both finalize
        full = rpc("eth_getTransactionByHash", [tx.get("hash")]) or tx
        tx = {**tx, **full}
        data = tx.get("consensus_data") or {}
        votes = list((data.get("votes") or {}).values())
        leader = (data.get("leader_receipt") or [{}])[0]
        run.append({
            "tx": tx.get("hash"),
            "method": called(tx),
            "from": sender,
            "value": str(int(tx.get("value") or 0)),
            "status": tx.get("status"),
            "consensus": tx.get("result_name"),
            "execution": leader.get("execution_result"),
            "votes": {v: votes.count(v) for v in sorted(set(votes))},
            "created_at": tx.get("created_at"),
        })
    run.sort(key=lambda r: str(r.get("created_at") or ""))

    record = {
        "network": "GenLayer StudioNet", "chain_id": 61999, "contract": args.contract,
        "accounts": sorted(wanted), "transactions": run,
        "collected_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    OUT.write_text(json.dumps(record, indent=2, default=str) + "\n", encoding="utf-8")
    print(f"wrote {OUT}: {len(run)} transaction(s) sent from the browser")
    for r in run:
        print(f"  {r['method'] or '(unknown)':<22} {str(r['tx'])[:16]}...  {r['status']} "
              f"{r['consensus']} {r['execution']} {r['votes']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
