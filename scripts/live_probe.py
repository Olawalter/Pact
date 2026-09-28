"""One agreement taken through PACT on StudioNet, for the first time.

    python scripts/live_probe.py <address> [--scenario fulfilled|breached]

Creates an agreement from throwaway funded accounts, locks it, funds both
sides, registers the demonstration evidence, asks GenLayer to adjudicate, and
prints what the panel agreed. Nothing is mocked: real validators fetch the
demonstration pages from GitHub and read each constraint for themselves.
"""
import argparse
import json
import pathlib
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RPC = "https://studio.genlayer.com/api"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
DEMO_COMMIT = "5066c0034793740d366906bc656f55598fd73b31"      # overridden by --commit
AMOUNT = 2 * 10 ** 16
BOND = 10 ** 16

TITLE = "Verified company research report"
TERMS = ("The research agent must deliver a report containing at least 50 verified companies before "
         "the deadline. Each company must carry at least three qualifying sources, every required "
         "field must be present, and no fabricated citation may appear in the report.")

CONSTRAINTS = [
    {"type": "THRESHOLD", "requirement": "The report contains at least 50 companies.",
     "materiality": "MATERIAL"},
    {"type": "FACTUAL", "requirement": "Every required field is present for each company.",
     "materiality": "MATERIAL"},
    {"type": "THRESHOLD", "requirement": "Each company carries at least three qualifying sources.",
     "materiality": "MATERIAL"},
    {"type": "EXCLUSION", "requirement": "No fabricated citation appears in the report.",
     "materiality": "MATERIAL"},
    {"type": "TEMPORAL", "requirement": "The report was delivered before the deadline.",
     "materiality": "MINOR"},
]


def rpc(method, params, attempts=8):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for i in range(attempts):
        try:
            req = urllib.request.Request(RPC, data=body,
                                         headers={"Content-Type": "application/json", "User-Agent": UA})
            out = json.load(urllib.request.urlopen(req, timeout=120))
            if "error" in out:
                err = str(out["error"])
                if "-32029" in err or "Rate limit" in err:
                    wait = re.search(r"retry_after_seconds\W+(\d+)", err)
                    time.sleep(min(int(wait.group(1)) if wait else 65, 3600) + 5)
                    continue
                raise RuntimeError(f"{method}: {out['error']}")
            return out["result"]
        except RuntimeError:
            raise
        except Exception:
            if i == attempts - 1:
                raise
            time.sleep(5 + 5 * i)


def patient_transport():
    """StudioNet refuses calls over its allowance (30 a minute, 500 an hour)
    with -32029, before processing them, so waiting and sending again is safe."""
    from genlayer_py.provider.provider import GenLayerProvider
    original = GenLayerProvider.make_request

    def patient(self, method, params):
        for _ in range(40):
            try:
                return original(self, method, params)
            except Exception as e:
                text = str(e)
                if "-32029" in text or "Rate limit" in text:
                    m = re.search(r"retry_after_seconds\W+(\d+)", text)
                    time.sleep((int(m.group(1)) if m else 65) + 5)
                    continue
                if any(s in text for s in ("Connection", "timed out", "SSL", "502", "503", "504",
                                           "<!DOCTYPE", "RemoteDisconnected", "reset",
                                           "temporarily unavailable", "-32002")):
                    time.sleep(10)
                    continue
                raise
        return original(self, method, params)

    GenLayerProvider.make_request = patient


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("address")
    ap.add_argument("--scenario", default="fulfilled", choices=["fulfilled", "breached"])
    ap.add_argument("--commit", default=DEMO_COMMIT)
    args = ap.parse_args()

    from eth_account import Account
    from genlayer_py import create_client
    from genlayer_py.chains import studionet
    from genlayer_py.types import TransactionStatus

    patient_transport()
    demo = f"https://raw.githubusercontent.com/Olawalter/Pact/{args.commit}/demo"
    report = f"{demo}/delivery-report.md"
    index = f"{demo}/independent-index.md"
    audit = f"{demo}/audit-note.md"
    injection = f"{demo}/delivery-note-with-instructions.md"

    creator, agent = Account.create(), Account.create()
    for acct in (creator, agent):
        rpc("sim_fundAccount", [acct.address, 10 ** 18])
    accounts = {"creator": creator, "agent": agent}
    clients = {"creator": create_client(chain=studionet, account=creator),
               "agent": create_client(chain=studionet, account=agent)}
    for name, c in clients.items():
        for _ in range(40):
            if int(c.get_balance(accounts[name].address)) > 0:
                break
            time.sleep(3)
        print(f"{name:<8} {accounts[name].address}")

    def write(who, fn, *fn_args, value=0, label=None):
        c = clients[who]
        tx = c.write_contract(address=args.address, function_name=fn, args=list(fn_args), value=value)
        receipt = c.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.ACCEPTED,
                                                 interval=5000, retries=300)
        leader = ((receipt.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
        votes = list(((receipt.get("consensus_data") or {}).get("votes") or {}).values())
        tally = {v: votes.count(v) for v in sorted(set(votes))}
        tx_hex = tx.hex() if hasattr(tx, "hex") else str(tx)
        refused = leader.get("execution_result") not in (None, "SUCCESS")
        reason = ""
        if refused:
            payload = (leader.get("result") or {})
            reason = str(payload.get("payload") or payload)[:160]
        print(f"  {(label or fn):<28} {tx_hex[:18]}...  {receipt.get('status_name')} "
              f"{receipt.get('result_name')} {leader.get('execution_result')} {tally}"
              + (f"  REFUSED: {reason}" if refused else ""))
        return tx_hex, receipt, refused

    read = lambda fn, *a: clients["creator"].read_contract(address=args.address, function_name=fn,
                                                           args=list(a))

    # the deadline is measured by the contract at the moment of the lock, and a
    # StudioNet round can take minutes: give it room, and compute it late
    definition = {
        "constraints": CONSTRAINTS,
        "evidence_policy": {"min_independent_origins": 1, "required_kinds": ["WEB_SOURCE"],
                            "corroboration_required": True},
        "consequence_policy": {"economic": True, "amount_required": AMOUNT, "bond_required": BOND,
                               "fulfilled_bps": 10_000, "partially_fulfilled_bps": 5_000,
                               "breached_bps": 0, "bond_forfeit_bps": 5_000,
                               "recovery_rule": "REFUND_CREATOR"},
        "deadline": 0,
        "recovery_window": 3600,
    }

    print(f"\nPHASE create ({args.scenario})")
    tx, receipt, _ = write("creator", "create_agreement", TITLE, TERMS, agent.address)
    leader = ((receipt.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
    page = read("list_agreements", 0, 1)
    aid = page["items"][0]["agreement_id"]
    print(f"  agreement {aid}")
    definition["deadline"] = int(time.time()) + 45 * 60
    write("creator", "lock_agreement", aid, json.dumps(definition), label="lock_agreement")
    write("creator", "fund_agreement", aid, value=AMOUNT, label="fund (amount)")
    write("agent", "fund_agreement", aid, value=BOND, label="fund (bond)")

    print("\nPHASE evidence")
    both = ["C1", "C2", "C3", "C4", "C5"]
    write("agent", "submit_evidence", aid, json.dumps(
        {"kind": "WEB_SOURCE", "source": report, "related_constraints": both,
         "label": "the delivered report", "source_type": "deliverable"}), label="evidence: report")
    if args.scenario == "fulfilled":
        write("creator", "submit_evidence", aid, json.dumps(
            {"kind": "WEB_SOURCE", "source": index, "related_constraints": ["C1", "C2", "C3", "C4"],
             "label": "independent index", "source_type": "verification"}), label="evidence: index")
    else:
        write("creator", "submit_evidence", aid, json.dumps(
            {"kind": "WEB_SOURCE", "source": audit, "related_constraints": ["C1", "C3", "C4"],
             "label": "third party audit", "source_type": "audit"}), label="evidence: audit")
        write("agent", "submit_evidence", aid, json.dumps(
            {"kind": "WEB_SOURCE", "source": injection, "related_constraints": ["C1", "C2", "C3", "C4"],
             "label": "delivery note", "source_type": "note"}), label="evidence: note")

    print("\nPHASE adjudicate")
    tx, receipt, refused = write("creator", "request_adjudication", aid, label="request_adjudication")
    if refused:
        return 1
    verdict = read("get_verdict", aid, 0)
    print(f"\n  state      {verdict['agreement_state']}  ({verdict['materiality']})")
    print(f"  summary    {verdict['summary']}")
    for f in verdict["findings"]:
        print(f"  {f['id']}  {f['status']:<14} -> {f['effective_status']:<14} {f['corroboration']:<12} "
              f"{','.join(f['evidence_ids']) or '-':<8} {f['quote'][:60]!r}")
    for e in verdict["evidence"]:
        print(f"  {e['evidence_id']}  {e['availability']:<12} {e['origin']:<22} {e['excerpt_digest'][:16]}")
    print(f"\n  held for corroboration: {verdict['held_for_corroboration']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
