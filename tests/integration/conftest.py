"""The live StudioNet suite: one agreement taken through PACT for real.

Nothing here is mocked. Validators fetch the demonstration pages from GitHub,
read each requirement for themselves and must agree before anything is
recorded, and the GEN moves on the chain.

    SKIP_INTEGRATION=0 PACT_CONTRACT_ADDRESS=0x... python -m pytest tests/integration -v -s

It is skipped by default: a full run takes about forty minutes of real
consensus rounds on a shared public network. Every phase runs once and the
record is written to docs/live-e2e.json, which the documentation is generated
from, so no hash in the docs is typed by hand.
"""
import json
import os
import pathlib
import re
import time

import pytest

from scenario import (AMOUNT, BOND, CONSTRAINTS, DEADLINE_AHEAD, DEMO, DEMO_COMMIT,
                      FINALITY_DELAY, RECOVERY_WINDOW, TERMS, TITLE)

ROOT = pathlib.Path(__file__).resolve().parents[2]
RECORD = ROOT / "docs" / "live-e2e.json"
RPC = "https://studio.genlayer.com/api"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36")
LIVE = os.environ.get("SKIP_INTEGRATION", "1") == "0"

def rpc(method, params, attempts=8):
    import urllib.request
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for i in range(attempts):
        try:
            req = urllib.request.Request(RPC, data=body,
                                         headers={"Content-Type": "application/json", "User-Agent": UA})
            out = json.load(urllib.request.urlopen(req, timeout=120))
            if "error" in out:
                err = str(out["error"])
                wait = _rate_limited(err)
                if wait:
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"{method}: {out['error']}")
            return out["result"]
        except RuntimeError:
            raise
        except Exception:
            if i == attempts - 1:
                raise
            time.sleep(5 + 5 * i)


def _rate_limited(text) -> int:
    """StudioNet refuses a call over its allowance (30 a minute, 500 an hour)
    with -32029, before processing it, so waiting and sending again is safe."""
    text = str(text)
    if "-32029" not in text and "Rate limit" not in text:
        return 0
    m = re.search(r"retry_after_seconds\W+(\d+)", text)
    if m:
        return min(int(m.group(1)), 3600) + 5
    return 65 if "per minute" in text else 300


def _patch_transport():
    """The public endpoint drops connections and serves error pages mid-poll.
    Retry transport failures; a JSON-RPC error is a real answer."""
    from genlayer_py.provider.provider import GenLayerProvider
    original = GenLayerProvider.make_request

    def patient(self, method, params):
        attempts = 0
        while attempts < 8:
            try:
                return original(self, method, params)
            except Exception as err:
                text = str(err)
                wait = _rate_limited(text)
                if wait:
                    time.sleep(wait)
                    continue                       # a refusal by the limiter is not an attempt
                if not any(s in text for s in ("Connection", "timed out", "SSL", "502", "503", "504",
                                               "<!DOCTYPE", "RemoteDisconnected", "reset",
                                               "temporarily unavailable", "-32002")):
                    raise
                attempts += 1
                time.sleep(5 + 5 * attempts)
        return original(self, method, params)

    GenLayerProvider.make_request = patient


def _hex(tx):
    return tx.hex() if hasattr(tx, "hex") else str(tx)


class Live:
    """One live session: two funded throwaway parties and the record of what happened."""

    def __init__(self):
        from eth_account import Account
        from genlayer_py import create_client
        from genlayer_py.chains import studionet

        _patch_transport()
        self._create_client = create_client
        self._chain = studionet
        self.address = os.environ.get("PACT_CONTRACT_ADDRESS") or json.loads(
            (ROOT / "docs" / "deployment.json").read_text(encoding="utf-8"))["contract_address"]
        self.creator, self.agent = Account.create(), Account.create()
        for acct in (self.creator, self.agent):
            rpc("sim_fundAccount", [acct.address, 10 ** 18])
        self.clients = {"creator": create_client(chain=studionet, account=self.creator),
                        "agent": create_client(chain=studionet, account=self.agent)}
        self.accounts = {"creator": self.creator, "agent": self.agent}
        for name in self.clients:
            for _ in range(40):
                if int(self.clients[name].get_balance(self.accounts[name].address)) > 0:
                    break
                time.sleep(3)
        self.record = {
            "network": "GenLayer StudioNet", "chain_id": 61999, "contract": self.address,
            "demo_commit": DEMO_COMMIT, "title": TITLE, "terms": TERMS,
            "accounts": {"creator": self.creator.address, "agent": self.agent.address},
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "transactions": [], "agreements": {}, "walls": {},
        }

    # ── acts ────────────────────────────────────────────────────────────────
    def write(self, who, fn, *args, value=0, step=None, agreement=None):
        from genlayer_py.types import TransactionStatus
        client = self.clients[who]
        tx = client.write_contract(address=self.address, function_name=fn, args=list(args), value=value)
        receipt = client.wait_for_transaction_receipt(transaction_hash=tx,
                                                      status=TransactionStatus.ACCEPTED,
                                                      interval=5000, retries=300)
        leader = ((receipt.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
        votes = list(((receipt.get("consensus_data") or {}).get("votes") or {}).values())
        entry = {
            "step": step or fn, "function": fn, "caller": who, "agreement": agreement,
            "tx": _hex(tx), "value": value, "status": receipt.get("status_name"),
            "consensus": receipt.get("result_name"), "execution": leader.get("execution_result"),
            "votes": {v: votes.count(v) for v in sorted(set(votes))},
            "refused": leader.get("execution_result") not in (None, "SUCCESS"),
        }
        if entry["refused"]:
            payload = (leader.get("result") or {})
            entry["refusal"] = str(payload.get("payload") or payload)[:200]
        self.record["transactions"].append(entry)
        print(f"  {entry['step']:<34} {entry['tx'][:18]}...  {entry['status']} {entry['consensus']} "
              f"{entry['execution']} {entry['votes']}"
              + (f"  REFUSED: {entry['refusal'][:90]}" if entry["refused"] else ""), flush=True)
        return entry

    def read(self, fn, *args):
        return self.clients["creator"].read_contract(address=self.address, function_name=fn,
                                                     args=list(args))

    def tx_facts(self, tx_hash):
        t = rpc("eth_getTransactionByHash", [tx_hash]) or {}
        votes = list(((t.get("consensus_data") or {}).get("votes") or {}).values())
        return {"status": t.get("status"), "consensus": t.get("result_name"),
                "votes": {v: votes.count(v) for v in sorted(set(votes))}}

    def sleep_until(self, unix_seconds, why=""):
        wait = int(unix_seconds) - int(time.time()) + 5
        if wait > 0:
            print(f"  ... waiting {wait}s of real time {why}", flush=True)
            time.sleep(wait)

    def save(self):
        self.record["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        RECORD.parent.mkdir(parents=True, exist_ok=True)
        RECORD.write_text(json.dumps(self.record, indent=2, default=str) + "\n", encoding="utf-8")


def definition(economic=True, **over):
    d = {
        "constraints": CONSTRAINTS,
        "evidence_policy": {"min_independent_origins": 1, "required_kinds": ["WEB_SOURCE"],
                            "corroboration_required": True},
        "consequence_policy": {"economic": economic, "amount_required": AMOUNT, "bond_required": BOND,
                               "fulfilled_bps": 10_000, "partially_fulfilled_bps": 5_000,
                               "breached_bps": 0, "bond_forfeit_bps": 5_000,
                               "recovery_rule": "REFUND_CREATOR"},
        "deadline": int(time.time()) + DEADLINE_AHEAD,
        "recovery_window": RECOVERY_WINDOW,
    }
    d.update(over)
    return json.dumps(d)


def evidence(source, constraints, label, kind="WEB_SOURCE", text=""):
    row = {"kind": kind, "related_constraints": list(constraints), "label": label}
    if kind == "WEB_SOURCE":
        row["source"] = source
    else:
        row["text"] = text
    return json.dumps(row)


class World:
    """The phases, each run once however many tests ask for them."""

    def __init__(self, live: Live):
        self.live = live
        self.done = set()
        self.failed = {}
        self.ids = {}

    def _once(self, name, fn):
        if name in self.failed:
            raise RuntimeError(f"phase {name} already failed: {self.failed[name]}")
        if name in self.done:
            return
        print(f"\nPHASE {name}", flush=True)
        try:
            fn()
        except Exception as err:
            self.failed[name] = f"{type(err).__name__}: {err}"
            raise
        finally:
            self.live.save()
        self.done.add(name)

    def agreement(self, case):
        return self.live.read("get_agreement", self.ids[case])

    def verdict(self, case, index=0):
        return self.live.read("get_verdict", self.ids[case], index)

    # ── create and lock ─────────────────────────────────────────────────────
    def created(self):
        def run():
            live = self.live
            for case in ("fulfilled", "breached"):
                before = live.read("get_protocol_info")["agreement_count"]
                live.write("creator", "create_agreement", TITLE, TERMS, live.agent.address,
                           step=f"create_agreement [{case}]")
                page = live.read("list_agreements", 0, 1)
                aid = page["items"][0]["agreement_id"]
                assert int(live.read("get_protocol_info")["agreement_count"]) == int(before) + 1
                self.ids[case] = aid
                live.record["agreements"][case] = {"agreement_id": aid}
                live.write("creator", "lock_agreement", aid, definition(),
                           step=f"lock_agreement [{case}]", agreement=case)
                live.record["agreements"][case]["locked"] = live.read("get_agreement", aid)

            # walls, each sent as a real transaction and refused by the contract
            aid = self.ids["fulfilled"]
            live.record["walls"]["lock_twice"] = live.write(
                "creator", "lock_agreement", aid, definition(), step="lock a second time (refused)")
            live.record["walls"]["stranger_locks"] = live.write(
                "agent", "lock_agreement", aid, definition(), step="lock by the counterparty (refused)")
            live.record["walls"]["evidence_before_funding"] = live.write(
                "agent", "submit_evidence", aid, evidence(f"{DEMO}/delivery-report.md", ["C1"], "early"),
                step="evidence before funding (refused)")
            live.record["walls"]["adjudicate_before_funding"] = live.write(
                "creator", "request_adjudication", aid, step="adjudication before funding (refused)")
        self._once("create", run)
        return self.ids

    # ── fund ────────────────────────────────────────────────────────────────
    def funded(self):
        self.created()

        def run():
            live = self.live
            for case in ("fulfilled", "breached"):
                aid = self.ids[case]
                live.write("creator", "fund_agreement", aid, value=AMOUNT,
                           step=f"fund the amount [{case}]", agreement=case)
                live.write("agent", "fund_agreement", aid, value=BOND,
                           step=f"post the bond [{case}]", agreement=case)
                live.record["agreements"][case]["funded"] = live.read("get_agreement", aid)
            live.record["walls"]["fund_twice"] = live.write(
                "creator", "fund_agreement", self.ids["fulfilled"], value=AMOUNT,
                step="fund an agreement already in force (refused)")
            live.record["walls"]["stranger_cancels"] = live.write(
                "agent", "cancel_agreement", self.ids["fulfilled"],
                step="cancel by the counterparty (refused)")
        self._once("fund", run)

    # ── evidence ────────────────────────────────────────────────────────────
    def evidenced(self):
        self.funded()

        def run():
            live = self.live
            both = ["C1", "C2", "C3", "C4", "C5"]
            live.write("agent", "submit_evidence", self.ids["fulfilled"],
                       evidence(f"{DEMO}/delivery-report.md", both, "the delivered report"),
                       step="evidence: the report", agreement="fulfilled")
            live.write("creator", "submit_evidence", self.ids["fulfilled"],
                       evidence(f"{DEMO}/independent-index.md", ["C1", "C2", "C3", "C4"],
                                "index verification"),
                       step="evidence: the index", agreement="fulfilled")

            live.write("creator", "submit_evidence", self.ids["breached"],
                       evidence(f"{DEMO}/audit-note.md", ["C1", "C3", "C4", "C5"], "third party audit"),
                       step="evidence: the audit", agreement="breached")
            live.write("agent", "submit_evidence", self.ids["breached"],
                       evidence(f"{DEMO}/delivery-note-with-instructions.md", ["C1", "C2", "C3", "C4"],
                                "delivery note"),
                       step="evidence: a note that instructs the panel", agreement="breached")

            for case in ("fulfilled", "breached"):
                live.record["agreements"][case]["evidence"] = live.read(
                    "list_evidence", self.ids[case], 0, 30)
            live.record["walls"]["stranger_submits"] = live.write(
                "agent", "submit_evidence", self.ids["fulfilled"],
                evidence(f"{DEMO}/delivery-report.md", ["C1"], "the same page again"),
                step="the same page registered twice (refused)")
        self._once("evidence", run)

    # ── adjudicate ──────────────────────────────────────────────────────────
    def adjudicated(self):
        self.evidenced()

        def run():
            live = self.live
            for case in ("fulfilled", "breached"):
                entry = self.adjudicate_until_recorded(case)
                live.record["agreements"][case]["adjudication_tx"] = entry["tx"]
                live.record["agreements"][case]["adjudication_facts"] = live.tx_facts(entry["tx"])
                verdict = self.verdict(case)
                live.record["agreements"][case]["verdict"] = verdict
                print(f"    -> {verdict['agreement_state']}: {verdict['summary']}", flush=True)
            live.record["walls"]["finalize_early"] = live.write(
                "creator", "finalize_verdict", self.ids["breached"],
                step="finalize before the delay (refused)")
        self._once("adjudicate", run)

    def adjudicate_until_recorded(self, case, attempts=3):
        """A round that reaches no majority records nothing and may be asked for
        again. Every such round is kept in the record, never hidden."""
        live = self.live
        for attempt in range(1, attempts + 1):
            label = f"request_adjudication [{case}]" + (f" (attempt {attempt})" if attempt > 1 else "")
            entry = live.write("creator", "request_adjudication", self.ids[case], step=label,
                               agreement=case)
            assert not entry["refused"], entry
            if entry["consensus"] == "MAJORITY_AGREE" and entry["status"] in ("ACCEPTED", "FINALIZED"):
                return entry
            facts = live.tx_facts(entry["tx"])
            live.record["agreements"][case].setdefault("rounds_without_majority", []).append(
                {"tx": entry["tx"], "votes": facts.get("votes"), "consensus": entry["consensus"]})
            print(f"    -> no majority ({facts.get('votes')}); nothing was recorded, asking again",
                  flush=True)
            time.sleep(620)                       # the contract's interval between rounds
        raise AssertionError(f"{case}: {attempts} rounds without a majority")

    # ── finalize and settle ─────────────────────────────────────────────────
    def settled(self):
        self.adjudicated()

        def run():
            live = self.live
            for case in ("fulfilled", "breached"):
                verdict = self.verdict(case)
                live.sleep_until(int(verdict["proposed_at"]) + FINALITY_DELAY,
                                 why=f"for the finality delay [{case}]")
                live.write("agent", "finalize_verdict", self.ids[case],
                           step=f"finalize_verdict [{case}]", agreement=case)
                live.record["agreements"][case]["finalized"] = live.read("get_agreement", self.ids[case])
                before = {who: int(live.clients[who].get_balance(live.accounts[who].address))
                          for who in ("creator", "agent")}
                live.write("agent", "execute_consequence", self.ids[case],
                           step=f"execute_consequence [{case}]", agreement=case)
                live.record["agreements"][case]["settled"] = live.read("get_agreement", self.ids[case])
                live.record["agreements"][case]["balances_before"] = {k: str(v) for k, v in before.items()}
            live.record["walls"]["settle_twice"] = live.write(
                "agent", "execute_consequence", self.ids["fulfilled"],
                step="settle a second time (refused)")
            live.record["protocol_after"] = live.read("get_protocol_info")
            held = 0
            page = live.read("list_agreements", 0, 50)
            for a in page["items"]:
                held += int(a["amount_deposited"]) + int(a["bond_deposited"])
            live.record["custody_held_by_agreements"] = str(held)
        self._once("settle", run)


@pytest.fixture(scope="session")
def world():
    if not LIVE:
        pytest.skip("live StudioNet suite; set SKIP_INTEGRATION=0 to run it (about 40 minutes)")
    if not DEMO_COMMIT:
        pytest.skip("set PACT_DEMO_COMMIT to the commit the demonstration pages are pinned at")
    live = Live()
    w = World(live)
    yield w
    live.save()
