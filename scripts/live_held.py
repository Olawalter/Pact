"""The floor that stops one party's word from moving money, proved on chain.

    python scripts/live_held.py <address>

PACT holds a decisive finding at INCONCLUSIVE when the only thing supporting it
is a party's own attestation and the agreement asked for corroboration. The
direct suite pins that; this proves it live, in both directions at once, which
is the part that matters:

  C1  the deliverer attests it delivered      -> SATISFIED, held
  C2  the buyer attests a field was missing   -> VIOLATED, held

Neither is corroborated, so neither may move value: a held SATISFIED cannot
release the amount any more than a held VIOLATED can forfeit the bond. The
agreement ends INCONCLUSIVE and settles under the locked recovery rule.

Takes about twelve minutes. Nothing here waits on a deadline.
"""
import argparse
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from live_probe import patient_transport, rpc                                # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "live-held.json"
AMOUNT = 2 * 10 ** 16
BOND = 10 ** 16

TITLE = "Monthly compliance filing"
TERMS = ("The filing agent must deliver the monthly compliance filing with every required field "
         "completed, before the deadline.")

CONSTRAINTS = [
    {"type": "FACTUAL", "requirement": "The filing was delivered.", "materiality": "MATERIAL"},
    {"type": "FACTUAL", "requirement": "Every required field in the filing is completed.",
     "materiality": "MATERIAL"},
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("address")
    args = ap.parse_args()

    from eth_account import Account
    from genlayer_py import create_client
    from genlayer_py.chains import studionet
    from genlayer_py.types import TransactionStatus

    patient_transport()
    creator, agent = Account.create(), Account.create()
    for acct in (creator, agent):
        rpc("sim_fundAccount", [acct.address, 10 ** 18])
    accounts = {"creator": creator, "agent": agent}
    clients = {name: create_client(chain=studionet, account=acct) for name, acct in accounts.items()}
    for name, c in clients.items():
        for _ in range(40):
            if int(c.get_balance(accounts[name].address)) > 0:
                break
            time.sleep(3)
        print(f"{name:<8} {accounts[name].address}")

    record = {"network": "GenLayer StudioNet", "chain_id": 61999, "contract": args.address,
              "scenario": "held for corroboration", "terms": TERMS,
              "accounts": {k: v.address for k, v in accounts.items()},
              "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "transactions": []}

    def save():
        OUT.write_text(json.dumps(record, indent=2, default=str) + chr(10), encoding="utf-8")

    def write(who, fn, *fn_args, value=0, label=None):
        c = clients[who]
        tx = c.write_contract(address=args.address, function_name=fn, args=list(fn_args), value=value)
        r = c.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.ACCEPTED,
                                           interval=5000, retries=300)
        leader = ((r.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
        votes = list(((r.get("consensus_data") or {}).get("votes") or {}).values())
        tally = {v: votes.count(v) for v in sorted(set(votes))}
        tx_hex = tx.hex() if hasattr(tx, "hex") else str(tx)
        record["transactions"].append({"step": label or fn, "caller": who, "tx": tx_hex,
                                       "status": r.get("status_name"), "consensus": r.get("result_name"),
                                       "execution": leader.get("execution_result"), "votes": tally})
        save()
        print(f"  {(label or fn):<28} {tx_hex[:18]}...  {r.get('status_name')} "
              f"{r.get('result_name')} {leader.get('execution_result')} {tally}")
        return r

    read = lambda fn, *a: clients["creator"].read_contract(address=args.address, function_name=fn,
                                                           args=list(a))

    print("\nPHASE create")
    write("creator", "create_agreement", TITLE, TERMS, agent.address)
    aid = read("list_agreements", 0, 1)["items"][0]["agreement_id"]
    print(f"  agreement {aid}")
    definition = {
        "constraints": CONSTRAINTS,
        # an attestation is allowed as evidence here, and corroboration is
        # required: that combination is the whole point of this run
        "evidence_policy": {"min_independent_origins": 0, "required_kinds": ["ATTESTATION"],
                            "corroboration_required": True},
        "consequence_policy": {"economic": True, "amount_required": AMOUNT, "bond_required": BOND,
                               "fulfilled_bps": 10_000, "partially_fulfilled_bps": 5_000,
                               "breached_bps": 0, "bond_forfeit_bps": 5_000,
                               "recovery_rule": "REFUND_CREATOR"},
        "deadline": int(time.time()) + 45 * 60,
        "recovery_window": 3600,
    }
    write("creator", "lock_agreement", aid, json.dumps(definition), label="lock_agreement")
    write("creator", "fund_agreement", aid, value=AMOUNT, label="fund (amount)")
    write("agent", "fund_agreement", aid, value=BOND, label="fund (bond)")

    print("\nPHASE evidence (one party's word each way, neither acknowledged)")
    write("agent", "submit_evidence", aid, json.dumps({
        "kind": "ATTESTATION", "related_constraints": ["C1"], "label": "the deliverer's account",
        "text": "I delivered the monthly compliance filing on 2026-09-20, before the deadline."}),
        label="attestation: it was delivered")
    write("creator", "submit_evidence", aid, json.dumps({
        "kind": "ATTESTATION", "related_constraints": ["C2"], "label": "the buyer's account",
        "text": "The filing I received left the beneficial ownership field blank."}),
        label="attestation: a field was missing")

    print("\nPHASE adjudicate")
    write("creator", "request_adjudication", aid, label="request_adjudication")
    verdict = read("get_verdict", aid, 0)
    record["verdict"] = verdict
    record["agreement"] = read("get_agreement", aid)
    save()

    print(f"\n  state      {verdict['agreement_state']}")
    print(f"  summary    {verdict['summary']}")
    for f in verdict["findings"]:
        print(f"  {f['id']}  answered {f['status']:<14} -> {f['effective_status']:<14} "
              f"support {f['corroboration']}")
    print(f"  held for corroboration: {verdict['held_for_corroboration']}")

    held = set(verdict["held_for_corroboration"])
    decisive = [f for f in verdict["findings"] if f["status"] in ("SATISFIED", "VIOLATED")]
    ok = (bool(decisive)
          and all(f["id"] in held for f in decisive)
          and all(f["effective_status"] == "INCONCLUSIVE" for f in decisive)
          and all(f["corroboration"] == "NONE" for f in decisive)
          and verdict["agreement_state"] == "INCONCLUSIVE")
    ways = {f["status"] for f in decisive}
    record["both_directions"] = sorted(ways)
    record["as_specified"] = bool(ok)
    save()
    if ways == {"SATISFIED", "VIOLATED"}:
        print("  both directions were held, which is the mirror")
    elif ways:
        print(f"  only {sorted(ways)} was answered decisively this round; "
              "the mirror needs both to appear")
    print(f"\n  record written to {OUT}")
    print("  RESULT:", "held, as specified" if ok else "NOT AS SPECIFIED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
