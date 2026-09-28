"""The proposal step: PACT reads the agreement and suggests explicit
requirements. It is drafting help, and the contract treats it as such: what
binds is the definition the creator locks."""
import json

import pytest

from tests.direct.conftest import create, hex_of, lock
from tests.direct.support import CONSTRAINTS, TERMS, constraint, definition

PROPOSAL = json.dumps({
    "reasoning": "the terms name a count, fields, sources, citations and a deadline",
    "constraints": [
        {"type": "THRESHOLD", "requirement": "The report contains at least 50 companies.",
         "materiality": "MATERIAL", "description": ""},
        {"type": "FACTUAL", "requirement": "Every required field is present for each company.",
         "materiality": "MATERIAL", "description": ""},
        {"type": "EXCLUSION", "requirement": "No fabricated citation appears in the report.",
         "materiality": "MATERIAL", "description": ""},
        {"type": "TEMPORAL", "requirement": "The report was delivered before the deadline.",
         "materiality": "MATERIAL", "description": ""},
    ],
})

PROMPT = r"explicit requirements"


def propose(pact, direct_vm, signer, aid, body=PROPOSAL):
    direct_vm.clear_mocks()
    direct_vm.mock_llm(PROMPT, body)
    direct_vm.sender = signer
    return pact.propose_constraints(aid)


def test_a_proposal_is_offered_for_review_and_binds_nothing(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    raw = propose(pact, direct_vm, creator, aid)
    record = json.loads(raw)
    a = pact.get_agreement(aid)
    assert a["lifecycle"] == "CONSTRAINTS_REVIEW"
    assert a["fingerprint"] == "", "nothing is binding until the creator locks it"
    assert record["advisory"] is True
    assert [c["type"] for c in record["constraints"]] == ["THRESHOLD", "FACTUAL", "EXCLUSION", "TEMPORAL"]
    assert pact.get_proposal(aid)["constraints"] == record["constraints"]


def test_the_creator_locks_what_they_mean_not_what_was_proposed(pact, direct_vm, creator, agent):
    """The proposal suggested four requirements; the creator locks six, two of
    them edited. The locked definition is the one that is judged."""
    aid = create(pact, direct_vm, creator, agent)
    propose(pact, direct_vm, creator, aid)
    lock(pact, direct_vm, creator, aid, economic=False)
    locked = pact.get_agreement(aid)["definition"]["constraints"]
    assert len(locked) == 6
    assert locked[5]["materiality"] == "MINOR"
    assert pact.get_proposal(aid)["constraints"] != locked, "the proposal is not the definition"


def test_an_agreement_with_no_proposal_says_so(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    empty = pact.get_proposal(aid)
    assert empty["constraints"] == [] and empty["proposed_at"] == 0


def test_a_proposal_cannot_be_asked_for_once_the_agreement_is_locked(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(PROMPT, PROPOSAL)
    direct_vm.sender = creator
    with direct_vm.expect_revert("only before the agreement is locked"):
        pact.propose_constraints(aid)


@pytest.mark.parametrize("body,words", [
    (json.dumps({"reasoning": "x", "constraints": []}), "no constraints"),
    (json.dumps({"reasoning": "x"}), "no constraints"),
    (json.dumps({"constraints": [{"type": "GUESS", "requirement": "something long enough here",
                                  "materiality": "MATERIAL"}]}), "no usable constraint"),
    (json.dumps({"constraints": [{"type": "FACTUAL", "requirement": "short", "materiality": "MATERIAL"}]}),
     "no usable constraint"),
])
def test_a_proposal_the_protocol_cannot_use_is_refused(pact, direct_vm, creator, agent, body, words):
    aid = create(pact, direct_vm, creator, agent)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(PROMPT, body)
    direct_vm.sender = creator
    with direct_vm.expect_revert(words):
        pact.propose_constraints(aid)


def test_the_proposal_prompt_asks_for_requirements_and_nothing_about_money(pact, direct_vm, creator,
                                                                           agent):
    aid = create(pact, direct_vm, creator, agent)
    seen = []
    direct_vm.clear_mocks()
    direct_vm.mock_llm(PROMPT, PROPOSAL)
    original = direct_vm._match_llm_mock
    direct_vm._match_llm_mock = lambda prompt: (seen.append(prompt), original(prompt))[1]
    direct_vm.sender = creator
    pact.propose_constraints(aid)
    direct_vm._match_llm_mock = original
    p = seen[0]
    assert "do not decide whether anything was met" in p
    assert "do not mention money or amounts" in p
    assert TERMS[:40] in p
    for word in ("bond", "deposit", "atto", "payout"):
        assert word not in p.lower(), word


def test_a_second_proposal_replaces_the_first(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    propose(pact, direct_vm, creator, aid)
    other = json.dumps({"constraints": [
        {"type": "QUALITY", "requirement": "The report is usable as delivered.",
         "materiality": "MINOR", "description": ""}]})
    propose(pact, direct_vm, creator, aid, other)
    stored = pact.get_proposal(aid)["constraints"]
    assert len(stored) == 1 and stored[0]["type"] == "QUALITY"


def test_the_constraint_vocabulary_is_small_and_fixed(pact):
    info = pact.get_protocol_info()
    assert info["constraint_types"] == ["FACTUAL", "TEMPORAL", "THRESHOLD", "QUALITY", "EXCLUSION",
                                        "COMPOSITE"]
    assert info["materialities"] == ["MATERIAL", "MINOR"]
    assert info["limits"]["max_constraints"] == 12
