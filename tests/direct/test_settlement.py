"""Custody and consequence: what the contract holds, what each finalized state
pays, and why a second settlement finds nothing."""
import pytest

from tests.direct.conftest import (adjudicate, create, finalize, fund, hex_of, in_force,
                                   latest_verdict, lock, submit, transfers_to, warp_to)
from tests.direct.support import (AMOUNT, BOND, DAY, DEADLINE, RECOVERY_WINDOW, READING_BREACHED,
                                  READING_FULFILLED, SHORT_BODY, URL_INDEX, URL_REPORT, URL_SECOND,
                                  AUDIT_BODY, answer)


def reading(**over):
    r = dict(READING_FULFILLED)
    r.update(over)
    return r


BREACH_WEB = {URL_REPORT: (200, SHORT_BODY), URL_INDEX: (200, AUDIT_BODY), URL_SECOND: (200, AUDIT_BODY)}


def settle(pact, direct_vm, creator, agent, reading_used, web=None, **over):
    aid = in_force(pact, direct_vm, creator, agent, **over)
    adjudicate(direct_vm, pact, creator, aid, reading_used, web=web)
    finalize(direct_vm, pact, creator, aid)
    direct_vm.sender = creator
    pact.execute_consequence(aid)
    return aid


# ── funding ──────────────────────────────────────────────────────────────────

def test_the_deposit_is_the_transactions_own_value_and_both_sides_must_pay(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid)
    assert pact.get_agreement(aid)["lifecycle"] == "LOCKED"
    fund(pact, direct_vm, creator, aid, AMOUNT)
    a = pact.get_agreement(aid)
    assert a["amount_deposited"] == str(AMOUNT) and a["lifecycle"] == "LOCKED", "the bond is still owed"
    fund(pact, direct_vm, agent, aid, BOND)
    a = pact.get_agreement(aid)
    assert (a["bond_deposited"], a["lifecycle"]) == (str(BOND), "ACTIVE")
    assert pact.get_protocol_info()["total_custody"] == str(AMOUNT + BOND)


def test_a_deposit_of_the_wrong_size_comes_straight_back(pact, direct_vm, creator, agent, transfers):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid)
    direct_vm.sender = creator
    direct_vm.value = AMOUNT - 1
    try:
        answer = pact.fund_agreement(aid)
    finally:
        direct_vm.value = 0
    assert answer.startswith("[REFUNDED]") and "must be exactly" in answer, answer
    assert pact.get_agreement(aid)["amount_deposited"] == "0"


# A refused deposit must come back. GenLayer credits a payable transaction's
# value to the contract before the call runs, so a refusal that raises keeps the
# GEN: the value is credited, the refund is rolled back with everything else, and
# nothing in the ledger records it. These tests exist because that happened on
# StudioNet -- 0.02 GEN stranded by a funding sent twice -- and they pin the
# shape that fixes it: refuse by returning, having sent the value back.
def test_a_refused_deposit_is_sent_back_and_not_kept(pact, direct_vm, creator, agent, transfers):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid)
    direct_vm.sender = creator
    direct_vm.value = AMOUNT + 1
    try:
        answer = pact.fund_agreement(aid)
    finally:
        direct_vm.value = 0
    assert transfers_to(transfers, hex_of(creator)) == AMOUNT + 1, transfers
    assert answer.startswith("[REFUNDED]"), answer
    assert pact.get_agreement(aid)["amount_deposited"] == "0"
    assert pact.get_protocol_info()["total_custody"] == "0"


def test_a_stranger_cannot_fund_and_is_refunded(pact, direct_vm, creator, agent, stranger,
                                                transfers):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid)
    direct_vm.sender = stranger
    direct_vm.value = AMOUNT
    try:
        answer = pact.fund_agreement(aid)
    finally:
        direct_vm.value = 0
    assert "only a party to this agreement can fund it" in answer, answer
    assert transfers_to(transfers, hex_of(stranger)) == AMOUNT, transfers
    assert pact.get_protocol_info()["total_custody"] == "0"


def test_funding_needs_a_locked_agreement(pact, direct_vm, creator, agent, transfers):
    aid = create(pact, direct_vm, creator, agent)
    direct_vm.sender = creator
    direct_vm.value = AMOUNT
    try:
        answer = pact.fund_agreement(aid)
    finally:
        direct_vm.value = 0
    assert "while the agreement is LOCKED" in answer, answer
    assert transfers_to(transfers, hex_of(creator)) == AMOUNT, transfers


def test_funding_an_agreement_in_force_is_refunded_not_kept(pact, direct_vm, creator, agent,
                                                            transfers):
    """The exact transaction that stranded GEN on StudioNet: an amount sent to an
    agreement that is already funded."""
    aid = in_force(pact, direct_vm, creator, agent)
    held = pact.get_protocol_info()["total_custody"]
    direct_vm.sender = creator
    direct_vm.value = AMOUNT
    try:
        answer = pact.fund_agreement(aid)
    finally:
        direct_vm.value = 0
    assert "while the agreement is LOCKED" in answer and "ACTIVE" in answer, answer
    assert transfers_to(transfers, hex_of(creator)) == AMOUNT, transfers
    assert pact.get_protocol_info()["total_custody"] == held, "a refused deposit entered custody"
    assert pact.get_agreement(aid)["amount_deposited"] == str(AMOUNT)


def test_a_deposit_with_no_value_is_refused(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid)
    direct_vm.sender = creator
    with direct_vm.expect_revert("attach the deposit as the transaction value"):
        pact.fund_agreement(aid)


# ── each finalized state pays what was locked ────────────────────────────────

def test_fulfilled_releases_the_whole_amount_and_returns_the_bond(pact, direct_vm, creator, agent,
                                                                  transfers):
    aid = settle(pact, direct_vm, creator, agent, READING_FULFILLED)
    a = pact.get_agreement(aid)
    assert a["result_state"] == "FULFILLED" and a["lifecycle"] == "CONSEQUENCE_EXECUTED"
    assert transfers_to(transfers, hex_of(agent)) == AMOUNT + BOND
    assert transfers_to(transfers, hex_of(creator)) == 0
    assert (a["amount_deposited"], a["bond_deposited"]) == ("0", "0")
    assert pact.get_protocol_info()["total_custody"] == "0"


def test_a_partial_outcome_pays_the_share_that_was_locked(pact, direct_vm, creator, agent, transfers):
    aid = settle(pact, direct_vm, creator, agent, reading(C6=answer("VIOLATED", "This report lists 52")),
                 partial=6_000)
    assert pact.get_agreement(aid)["result_state"] == "PARTIALLY_FULFILLED"
    assert transfers_to(transfers, hex_of(agent)) == AMOUNT * 6_000 // 10_000 + BOND
    assert transfers_to(transfers, hex_of(creator)) == AMOUNT - AMOUNT * 6_000 // 10_000


def test_a_breach_refunds_the_creator_and_forfeits_the_agreed_share_of_the_bond(pact, direct_vm,
                                                                                creator, agent, transfers):
    aid = in_force(pact, direct_vm, creator, agent, forfeit=5_000)
    submit(pact, direct_vm, creator, aid, source=URL_SECOND, constraints=("C1", "C4"), label="audit")
    adjudicate(direct_vm, pact, creator, aid, READING_BREACHED, web=BREACH_WEB)
    finalize(direct_vm, pact, creator, aid)
    direct_vm.sender = agent
    pact.execute_consequence(aid)
    assert pact.get_agreement(aid)["result_state"] == "BREACHED"
    assert transfers_to(transfers, hex_of(creator)) == AMOUNT + BOND // 2
    assert transfers_to(transfers, hex_of(agent)) == BOND - BOND // 2


def test_an_inconclusive_outcome_follows_the_recovery_rule(pact, direct_vm, creator, agent, transfers):
    aid = settle(pact, direct_vm, creator, agent, reading(C2=answer("INCONCLUSIVE", "")),
                 recovery="SPLIT_EVENLY")
    assert pact.get_agreement(aid)["result_state"] == "INCONCLUSIVE"
    assert transfers_to(transfers, hex_of(creator)) == AMOUNT - AMOUNT // 2
    assert transfers_to(transfers, hex_of(agent)) == AMOUNT // 2 + BOND


def test_an_agreement_with_no_economic_consequence_still_ends_in_a_record(pact, direct_vm, creator,
                                                                          agent, transfers):
    aid = settle(pact, direct_vm, creator, agent, READING_FULFILLED, economic=False)
    a = pact.get_agreement(aid)
    assert (a["lifecycle"], a["result_state"]) == ("CONSEQUENCE_EXECUTED", "FULFILLED")
    assert transfers == [], "nothing moves when nothing was staked"


# ── settlement safety ────────────────────────────────────────────────────────

def test_the_ledger_is_zero_before_a_single_transfer_is_emitted(pact, direct_vm, creator, agent,
                                                                monkeypatch):
    """The order is: read the ledger, zero it, persist, then pay."""
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    finalize(direct_vm, pact, creator, aid)

    from gltest.direct import wasi_mock
    seen = []
    original = wasi_mock._handle_gl_call

    def recording(vm, request):
        if isinstance(request, dict) and "EthSend" in request:
            seen.append(pact.get_agreement(aid))
        return original(vm, request)

    monkeypatch.setattr(wasi_mock, "_handle_gl_call", recording)
    direct_vm.sender = creator
    pact.execute_consequence(aid)
    assert seen, "a transfer was emitted"
    for state in seen:
        assert (state["amount_deposited"], state["bond_deposited"]) == ("0", "0")
        assert state["lifecycle"] == "CONSEQUENCE_EXECUTED"


def test_a_second_settlement_finds_nothing(pact, direct_vm, creator, agent):
    aid = settle(pact, direct_vm, creator, agent, READING_FULFILLED)
    direct_vm.sender = creator
    with direct_vm.expect_revert("follows a finalized verdict"):
        pact.execute_consequence(aid)


def test_a_consequence_needs_a_finalized_verdict(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    direct_vm.sender = creator
    with direct_vm.expect_revert("follows a finalized verdict"):
        pact.execute_consequence(aid)


def test_anyone_may_send_the_consequence_and_the_money_still_goes_to_the_parties(pact, direct_vm,
                                                                                 creator, agent,
                                                                                 stranger, transfers):
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    finalize(direct_vm, pact, stranger, aid)
    direct_vm.sender = stranger
    pact.execute_consequence(aid)
    assert transfers_to(transfers, hex_of(stranger)) == 0
    assert transfers_to(transfers, hex_of(agent)) == AMOUNT + BOND


# ── cancelling and recovery ──────────────────────────────────────────────────

def test_cancelling_returns_every_deposit(pact, direct_vm, creator, agent, transfers):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid)
    fund(pact, direct_vm, creator, aid, AMOUNT)
    fund(pact, direct_vm, agent, aid, BOND)
    direct_vm.sender = creator
    pact.cancel_agreement(aid)
    a = pact.get_agreement(aid)
    assert a["lifecycle"] == "CANCELLED"
    assert transfers_to(transfers, hex_of(creator)) == AMOUNT
    assert transfers_to(transfers, hex_of(agent)) == BOND
    assert pact.get_protocol_info()["total_custody"] == "0"


def test_an_agreement_carrying_evidence_is_adjudicated_not_cancelled(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    direct_vm.sender = creator
    with direct_vm.expect_revert("must be adjudicated or recovered"):
        pact.cancel_agreement(aid)


def test_recovery_waits_for_the_deadline_and_the_window(pact, direct_vm, creator, agent, transfers):
    aid = in_force(pact, direct_vm, creator, agent)
    direct_vm.sender = creator
    with direct_vm.expect_revert("recovery is possible at"):
        pact.recover(aid)
    warp_to(direct_vm, DEADLINE + RECOVERY_WINDOW + 1)
    direct_vm.sender = agent
    pact.recover(aid)
    a = pact.get_agreement(aid)
    assert (a["lifecycle"], a["result_state"]) == ("CONSEQUENCE_EXECUTED", "INCONCLUSIVE")
    assert transfers_to(transfers, hex_of(creator)) == AMOUNT          # REFUND_CREATOR
    assert transfers_to(transfers, hex_of(agent)) == BOND


def test_recovery_does_not_apply_once_a_verdict_exists(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    warp_to(direct_vm, DEADLINE + RECOVERY_WINDOW + 1)
    direct_vm.sender = creator
    with direct_vm.expect_revert("never adjudicated"):
        pact.recover(aid)


@pytest.mark.parametrize("rule,to_creator,to_agent", [
    ("REFUND_CREATOR", AMOUNT, BOND),
    ("SPLIT_EVENLY", AMOUNT - AMOUNT // 2, AMOUNT // 2 + BOND),
    ("RELEASE_COUNTERPARTY", 0, AMOUNT + BOND),
])
def test_every_recovery_rule_pays_what_it_says(pact, direct_vm, creator, agent, transfers, rule,
                                               to_creator, to_agent):
    aid = in_force(pact, direct_vm, creator, agent, recovery=rule)
    warp_to(direct_vm, DEADLINE + RECOVERY_WINDOW + 1)
    direct_vm.sender = creator
    pact.recover(aid)
    assert transfers_to(transfers, hex_of(creator)) == to_creator
    assert transfers_to(transfers, hex_of(agent)) == to_agent


def test_the_split_is_arithmetic_on_the_locked_policy_alone(mod):
    """No model output reaches the payout: only the state name, and the basis
    points locked before anything was judged."""
    policy = {"fulfilled_bps": 10_000, "partially_fulfilled_bps": 4_000, "breached_bps": 0,
              "bond_forfeit_bps": 2_500, "recovery_rule": "REFUND_CREATOR"}
    assert mod._split_payout("FULFILLED", policy, 1000, 100) == (0, 1100)
    assert mod._split_payout("PARTIALLY_FULFILLED", policy, 1000, 100) == (600, 500)
    assert mod._split_payout("BREACHED", policy, 1000, 100) == (1025, 75)
    assert mod._split_payout("INCONCLUSIVE", policy, 1000, 100) == (1000, 100)
    assert sum(mod._split_payout("BREACHED", policy, 999, 99)) == 999 + 99, "nothing is created or lost"


def test_the_bond_must_be_exactly_what_the_policy_names(pact, direct_vm, creator, agent, transfers):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid)
    fund(pact, direct_vm, creator, aid, AMOUNT)
    direct_vm.sender = agent
    direct_vm.value = BOND // 2
    try:
        answer = pact.fund_agreement(aid)
    finally:
        direct_vm.value = 0
    assert "the bond must be exactly" in answer, answer
    assert transfers_to(transfers, hex_of(agent)) == BOND // 2, transfers
    assert pact.get_agreement(aid)["bond_deposited"] == "0"
    assert pact.get_protocol_info()["total_custody"] == str(AMOUNT)
