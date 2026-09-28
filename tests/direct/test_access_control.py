"""Who may do what. Every account the contract records is the signer of the
transaction that recorded it; an account passed as data is never taken on
trust, and the open acts pay only the recorded parties."""
import pytest

from tests.direct.conftest import (adjudicate, create, finalize, fund, hex_of, in_force, lock,
                                   submit, warp_to)
from tests.direct.support import (AMOUNT, BOND, DEADLINE, RECOVERY_WINDOW, READING_FULFILLED,
                                  URL_REPORT, definition, evidence)


def test_the_creator_is_the_signer_not_an_argument(pact, direct_vm, creator, agent):
    """create_agreement takes one address, the counterparty. The creator cannot
    be claimed: it is whoever signed."""
    aid = create(pact, direct_vm, creator, agent)
    a = pact.get_agreement(aid)
    assert a["creator"].lower() == hex_of(creator)
    assert a["counterparty"].lower() == hex_of(agent)


def test_a_submitter_is_the_signer(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False)
    eid = submit(pact, direct_vm, agent, aid, source=URL_REPORT)
    assert pact.get_evidence(aid, eid)["submitter"].lower() == hex_of(agent)


@pytest.mark.parametrize("act", ["propose_constraints", "cancel_agreement"])
def test_only_the_creator_may_shape_or_withdraw_the_agreement(pact, direct_vm, creator, agent, act):
    aid = create(pact, direct_vm, creator, agent)
    direct_vm.sender = agent
    with direct_vm.expect_revert("only the creator"):
        getattr(pact, act)(aid)


def test_only_the_creator_may_lock(pact, direct_vm, creator, agent, stranger):
    aid = create(pact, direct_vm, creator, agent)
    for who in (agent, stranger):
        direct_vm.sender = who
        with direct_vm.expect_revert("only the creator can lock"):
            pact.lock_agreement(aid, definition())


def test_only_a_party_may_submit_acknowledge_or_ask_for_adjudication(pact, direct_vm, creator, agent,
                                                                     stranger):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False)
    direct_vm.sender = stranger
    with direct_vm.expect_revert("only a party"):
        pact.submit_evidence(aid, evidence())
    eid = submit(pact, direct_vm, agent, aid, kind="ATTESTATION", text="delivered in full",
                 constraints=("C1",))
    direct_vm.sender = stranger
    with direct_vm.expect_revert("only a party"):
        pact.acknowledge_evidence(aid, eid)
    with direct_vm.expect_revert("only a party"):
        pact.request_adjudication(aid)


def test_finalizing_and_settling_are_open_because_the_payees_are_fixed(pact, direct_vm, creator,
                                                                       agent, stranger, transfers):
    """A stranger may push the lifecycle along. They cannot redirect a single
    atto by doing so."""
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    finalize(direct_vm, pact, stranger, aid)
    direct_vm.sender = stranger
    pact.execute_consequence(aid)
    paid = {a.lower() for a, _ in transfers}
    assert paid <= {hex_of(creator), hex_of(agent)}
    assert hex_of(stranger) not in paid


def test_recovery_is_open_and_still_pays_only_the_parties(pact, direct_vm, creator, agent, stranger,
                                                          transfers):
    aid = in_force(pact, direct_vm, creator, agent)
    warp_to(direct_vm, DEADLINE + RECOVERY_WINDOW + 1)
    direct_vm.sender = stranger
    pact.recover(aid)
    paid = {a.lower() for a, _ in transfers}
    assert paid <= {hex_of(creator), hex_of(agent)} and hex_of(stranger) not in paid


def test_an_agreement_that_does_not_exist_is_refused_by_name(pact, direct_vm, creator):
    direct_vm.sender = creator
    with direct_vm.expect_revert("there is no agreement A9"):
        pact.get_agreement("A9")


def test_evidence_that_does_not_exist_is_refused_by_name(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False)
    direct_vm.sender = creator
    with direct_vm.expect_revert("there is no evidence E4"):
        pact.acknowledge_evidence(aid, "E4")


def test_a_party_cannot_act_on_another_agreement_through_this_one(pact, direct_vm, creator, agent,
                                                                  stranger):
    mine = create(pact, direct_vm, creator, agent)
    theirs = create(pact, direct_vm, stranger, agent)
    lock(pact, direct_vm, creator, mine, economic=False)
    lock(pact, direct_vm, stranger, theirs, economic=False)
    direct_vm.sender = creator
    with direct_vm.expect_revert("only a party"):
        pact.submit_evidence(theirs, evidence())
