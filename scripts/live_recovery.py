"""The ending nobody asks for: an agreement that was never adjudicated.

    python scripts/live_recovery.py <address>

The deadline passes, the recovery window passes, and the locked recovery rule
ends the agreement without any model judging anything. This is the path that
guarantees GEN can never be stranded in the contract, so it is worth proving on
the chain rather than only in the direct suite. It takes about eighty minutes:
the contract's minimum recovery window is an hour and it is measured from a
deadline that cannot be sooner than ten minutes away.
"""
import argparse
import json
import pathlib
import sys
import time

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from live_probe import TERMS, TITLE, patient_transport, rpc                  # noqa: E402

AMOUNT = 2 * 10 ** 16
BOND = 10 ** 16
DEADLINE_AHEAD = 11 * 60
RECOVERY_WINDOW = 3600

CONSTRAINTS = [
    {"type": "FACTUAL", "requirement": "The report was delivered.", "materiality": "MATERIAL"},
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
    creator, agent, stranger = Account.create(), Account.create(), Account.create()
    for acct in (creator, agent, stranger):
        rpc("sim_fundAccount", [acct.address, 10 ** 18])
    accounts = {"creator": creator, "agent": agent, "stranger": stranger}
    clients = {name: create_client(chain=studionet, account=acct) for name, acct in accounts.items()}
    for name, c in clients.items():
        for _ in range(40):
            if int(c.get_balance(accounts[name].address)) > 0:
                break
            time.sleep(3)
        print(f"{name:<9} {accounts[name].address}")

    record = {"network": "GenLayer StudioNet", "chain_id": 61999, "contract": args.address,
              "scenario": "recovery", "accounts": {k: v.address for k, v in accounts.items()},
              "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "transactions": []}
    out = pathlib.Path(__file__).resolve().parents[1] / "docs" / "live-recovery.json"

    def save():
        out.write_text(json.dumps(record, indent=2, default=str) + chr(10), encoding="utf-8")

    def write(who, fn, *fn_args, value=0, label=None):
        c = clients[who]
        tx = c.write_contract(address=args.address, function_name=fn, args=list(fn_args), value=value)
        receipt = c.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.ACCEPTED,
                                                 interval=5000, retries=300)
        leader = ((receipt.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
        votes = list(((receipt.get("consensus_data") or {}).get("votes") or {}).values())
        refused = leader.get("execution_result") not in (None, "SUCCESS")
        reason = str((leader.get("result") or {}).get("payload") or "")[:150] if refused else ""
        tx_hex = tx.hex() if hasattr(tx, "hex") else str(tx)
        tally = {v: votes.count(v) for v in sorted(set(votes))}
        record["transactions"].append({
            "step": label or fn, "function": fn, "caller": who, "tx": tx_hex, "value": value,
            "status": receipt.get("status_name"), "consensus": receipt.get("result_name"),
            "execution": leader.get("execution_result"), "votes": tally,
            "refused": refused, "refusal": reason})
        save()
        print(f"  {(label or fn):<30} {tx_hex[:18]}...  {receipt.get('status_name')} "
              f"{receipt.get('result_name')} {leader.get('execution_result')} {tally}"
              + (f"  REFUSED: {reason}" if refused else ""))
        return tx_hex, refused

    read = lambda fn, *a: clients["creator"].read_contract(address=args.address, function_name=fn,
                                                           args=list(a))
    balance = lambda who: int(clients[who].get_balance(accounts[who].address))

    print("\nPHASE create")
    write("creator", "create_agreement", TITLE, TERMS, agent.address)
    aid = read("list_agreements", 0, 1)["items"][0]["agreement_id"]
    print(f"  agreement {aid}")
    deadline = int(time.time()) + DEADLINE_AHEAD
    definition = {
        "constraints": CONSTRAINTS,
        "evidence_policy": {"min_independent_origins": 1, "required_kinds": ["WEB_SOURCE"],
                            "corroboration_required": True},
        "consequence_policy": {"economic": True, "amount_required": AMOUNT, "bond_required": BOND,
                               "fulfilled_bps": 10_000, "partially_fulfilled_bps": 5_000,
                               "breached_bps": 0, "bond_forfeit_bps": 5_000,
                               "recovery_rule": "REFUND_CREATOR"},
        "deadline": deadline,
        "recovery_window": RECOVERY_WINDOW,
    }
    write("creator", "lock_agreement", aid, json.dumps(definition), label="lock_agreement")
    write("creator", "fund_agreement", aid, value=AMOUNT, label="fund (amount)")
    write("agent", "fund_agreement", aid, value=BOND, label="fund (bond)")
    held = read("get_agreement", aid)
    print(f"  in custody: amount {held['amount_deposited']}  bond {held['bond_deposited']}")

    print("\nPHASE too early")
    _, refused = write("stranger", "recover", aid, label="recover before the window")
    assert refused, "recovery was allowed before the window had passed"
    assert read("get_agreement", aid)["amount_deposited"] == str(AMOUNT), "a refused recovery paid out"

    ready = deadline + RECOVERY_WINDOW
    print(f"\nPHASE wait  (deadline {deadline}, recoverable at {ready})")
    while True:
        left = ready - int(time.time())
        if left <= 0:
            break
        print(f"  {left // 60} minutes to go", flush=True)
        time.sleep(min(left, 300) + 5)

    print("\nPHASE recover")
    before = {who: balance(who) for who in ("creator", "agent")}
    write("stranger", "recover", aid, label="recover (sent by a stranger)")

    # GenLayer applies a transfer when the transaction finalizes, not when it is
    # accepted, so a balance read straight after acceptance still shows the old
    # number. Waiting for the money is the whole point of this scenario.
    after = {}
    for _ in range(60):
        after = {who: balance(who) for who in ("creator", "agent")}
        if after["creator"] > before["creator"] and after["agent"] > before["agent"]:
            break
        time.sleep(10)
    final = read("get_agreement", aid)
    print(f"\n  lifecycle      {final['lifecycle']}  ({final['result_state']})")
    print(f"  paid creator   {final['paid_creator']}   (expected {AMOUNT})")
    print(f"  paid agent     {final['paid_counterparty']}   (expected {BOND})")
    print(f"  still held     amount {final['amount_deposited']}  bond {final['bond_deposited']}")
    for who in ("creator", "agent"):
        print(f"  {who} balance {before[who]} -> {after[who]}  (+{after[who] - before[who]})")
    print(f"  protocol custody {read('get_protocol_info')['total_custody']}")

    ok = (final["lifecycle"] == "CONSEQUENCE_EXECUTED" and final["result_state"] == "INCONCLUSIVE"
          and int(final["paid_creator"]) == AMOUNT and int(final["paid_counterparty"]) == BOND
          and after["creator"] - before["creator"] == AMOUNT
          and after["agent"] - before["agent"] == BOND)
    record.update({
        "agreement_id": aid, "deadline": deadline, "recovery_window": RECOVERY_WINDOW,
        "amount": str(AMOUNT), "bond": str(BOND), "final": final,
        "balances_before": {k: str(v) for k, v in before.items()},
        "balances_after": {k: str(v) for k, v in after.items()},
        "protocol_after": read("get_protocol_info"),
        "as_locked": bool(ok),
        "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    save()
    print(f"\n  record written to {out}")
    print("  RESULT:", "as locked" if ok else "NOT AS LOCKED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
