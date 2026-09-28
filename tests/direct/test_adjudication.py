"""Adjudication: what the panel is asked, what the contract keeps from the
answer, what it derives itself, and what a validator refuses."""
import copy
import json

import pytest

from tests.direct.conftest import (adjudicate, create, findings_by_id, finalize, fund, hex_of,
                                   in_force, latest_verdict, lock, mock_round, submit, warp_to)
from tests.direct.support import (AUDIT_BODY, DEADLINE, INJECTION_BODY, NOW_UNIX, Q_AUDIT_COUNT,
                                  Q_CITATIONS, Q_COUNT, Q_DELIVERED, Q_FABRICATED, Q_SHORT,
                                  Q_SOURCES, READING_BREACHED, READING_FULFILLED, REPORT_BODY,
                                  ROUND_INTERVAL, SHORT_BODY, URL_GONE, URL_INDEX, URL_REPORT,
                                  URL_SECOND, WEB_BREACHED, WEB_FULFILLED, answer, evidence)


def reading(**over):
    r = dict(READING_FULFILLED)
    r.update(over)
    return r


# ── the ordinary paths ───────────────────────────────────────────────────────

def test_every_requirement_met_is_fulfilled_and_each_finding_cites_its_passage(pact, direct_vm,
                                                                               creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    vid = adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    v = latest_verdict(pact, aid)
    assert vid == f"{aid}-V0" and v["status"] == "VERDICT_PROPOSED"
    assert v["agreement_state"] == "FULFILLED"
    assert pact.get_agreement(aid)["lifecycle"] == "VERDICT_PROPOSED"
    f = findings_by_id(v)
    assert {k: x["effective_status"] for k, x in f.items()} == {c: "SATISFIED" for c in f}
    assert f["C1"]["quote"] in REPORT_BODY and f["C1"]["quote_evidence_id"] == "E1"
    assert f["C1"]["corroboration"] == "INDEPENDENT"
    assert v["fingerprint"] == pact.get_agreement(aid)["fingerprint"]


def test_a_material_violation_is_a_breach_and_names_the_constraint(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    submit(pact, direct_vm, creator, aid, source=URL_SECOND, constraints=("C1", "C4"), label="audit")
    web = {URL_REPORT: (200, SHORT_BODY), URL_INDEX: (200, AUDIT_BODY), URL_SECOND: (200, AUDIT_BODY)}
    adjudicate(direct_vm, pact, creator, aid, READING_BREACHED, web=web)
    v = latest_verdict(pact, aid)
    f = findings_by_id(v)
    assert v["agreement_state"] == "BREACHED" and v["materiality"] == "MATERIAL"
    assert f["C1"]["effective_status"] == "VIOLATED"
    assert f["C4"]["effective_status"] == "VIOLATED" and f["C4"]["quote_evidence_id"] == "E2"
    assert "material violation" in v["summary"]


def test_only_a_minor_violation_is_partial_fulfilment(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid,
               reading(C6=answer("VIOLATED", Q_COUNT)))          # C6 is the MINOR constraint
    v = latest_verdict(pact, aid)
    assert v["agreement_state"] == "PARTIALLY_FULFILLED"
    assert findings_by_id(v)["C6"]["effective_status"] == "VIOLATED"


def test_a_material_requirement_left_open_is_inconclusive(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid, reading(C2=answer("INCONCLUSIVE", "")))
    assert latest_verdict(pact, aid)["agreement_state"] == "INCONCLUSIVE"


def test_a_requirement_that_cannot_apply_does_not_hold_the_agreement_open(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid, reading(C6=answer("NOT_APPLICABLE", "")))
    v = latest_verdict(pact, aid)
    assert v["agreement_state"] == "FULFILLED"
    assert "5 applicable" in v["summary"]


# ── what the contract refuses to take from the model ─────────────────────────

def test_a_status_without_a_passage_from_the_evidence_is_not_kept(pact, direct_vm, creator, agent):
    """The model may say anything; a decisive status stands only on a passage
    this node found in its own copy of the cited evidence."""
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid,
               reading(C1=answer("SATISFIED", "The report lists 90 companies, all verified.")))
    f = findings_by_id(latest_verdict(pact, aid))["C1"]
    assert (f["status"], f["effective_status"]) == ("INCONCLUSIVE", "INCONCLUSIVE")
    assert f["quote"] == "" and "no passage" in f["note"]


def test_a_passage_from_an_item_the_finding_does_not_cite_is_not_grounding(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid,
               reading(C1=answer("SATISFIED", Q_COUNT, evidence_ids=("E2",), from_id="E1")))
    assert findings_by_id(latest_verdict(pact, aid))["C1"]["effective_status"] == "INCONCLUSIVE"


def test_evidence_the_party_did_not_register_against_the_constraint_cannot_decide_it(pact, direct_vm,
                                                                                     creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False)
    submit(pact, direct_vm, agent, aid, source=URL_REPORT, constraints=("C5",))   # only C5
    adjudicate(direct_vm, pact, creator, aid,
               reading(C1=answer("SATISFIED", Q_COUNT, evidence_ids=("E1",), from_id="E1")))
    assert findings_by_id(latest_verdict(pact, aid))["C1"]["effective_status"] == "INCONCLUSIVE"


def test_a_source_that_is_gone_is_not_evidence_of_a_violation(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False)
    submit(pact, direct_vm, agent, aid, source=URL_GONE, constraints=("C1",))
    submit(pact, direct_vm, agent, aid, source=URL_REPORT, constraints=("C2", "C3", "C4", "C5", "C6"))
    web = {URL_GONE: (404, ""), URL_REPORT: (200, REPORT_BODY)}
    adjudicate(direct_vm, pact, creator, aid,
               reading(C1=answer("VIOLATED", Q_COUNT, evidence_ids=("E1",), from_id="E1")), web=web)
    v = latest_verdict(pact, aid)
    assert [e["availability"] for e in v["evidence"]] == ["MISSING", "AVAILABLE"]
    assert findings_by_id(v)["C1"]["effective_status"] == "INCONCLUSIVE"
    assert v["agreement_state"] == "INCONCLUSIVE"


def test_an_unreadable_body_is_unavailable_not_a_page_that_says_nothing(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False, constraints=[{"type": "FACTUAL", "requirement": "The report lists at least 50 companies.",
                     "materiality": "MATERIAL"}])
    submit(pact, direct_vm, agent, aid, source=URL_REPORT, constraints=("C1",))
    direct_vm.clear_mocks()
    direct_vm.mock_web("^" + URL_REPORT + "$",
                       {"response": {"status": 200, "headers": {}, "body": bytes(range(256)) * 40}})
    for pattern, body in [(r'"id":"C1"', answer("SATISFIED", Q_COUNT))]:
        direct_vm.mock_llm(pattern, body)
    direct_vm.sender = creator
    pact.request_adjudication(aid)
    v = latest_verdict(pact, aid)
    assert v["evidence"][0]["availability"] == "UNAVAILABLE"
    assert findings_by_id(v)["C1"]["effective_status"] == "INCONCLUSIVE"


@pytest.mark.parametrize("bad", [
    answer("PROBABLY", Q_COUNT),
    json.dumps({"reasoning": "x", "status": "SATISFIED", "evidence_ids": "E1", "quote": Q_COUNT,
                "quote_evidence_id": "E1"}),
])
def test_an_answer_the_protocol_cannot_read_is_a_model_error(pact, direct_vm, creator, agent, bad):
    aid = in_force(pact, direct_vm, creator, agent)
    with direct_vm.expect_revert("LLM_ERROR"):
        adjudicate(direct_vm, pact, creator, aid, reading(C1=bad))


# ── corroboration: an uncorroborated finding does not move money ─────────────

def test_one_partys_word_alone_cannot_establish_a_breach(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False, required_kinds=["ATTESTATION"], min_origins=0,
         constraints=[{"type": "FACTUAL", "requirement": "The report lists at least 50 companies.",
                     "materiality": "MATERIAL"}])
    submit(pact, direct_vm, creator, aid, kind="ATTESTATION", constraints=("C1",),
           text="The agent delivered only 31 companies, far short of the 50 we agreed.")
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r'"id":"C1"', answer("VIOLATED", "delivered only 31 companies"))
    direct_vm.sender = creator
    pact.request_adjudication(aid)
    f = findings_by_id(latest_verdict(pact, aid))["C1"]
    assert (f["status"], f["corroboration"]) == ("VIOLATED", "NONE")
    assert f["effective_status"] == "INCONCLUSIVE", "an uncorroborated adverse finding is held"
    assert latest_verdict(pact, aid)["held_for_corroboration"] == ["C1"]
    assert latest_verdict(pact, aid)["agreement_state"] == "INCONCLUSIVE"


def test_one_partys_word_alone_cannot_establish_fulfilment_either(pact, direct_vm, creator, agent):
    """The mirror of the rule above: the floor is symmetric, so it cannot be
    used by whichever party stands to gain."""
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False, required_kinds=["ATTESTATION"], min_origins=0,
         constraints=[{"type": "FACTUAL", "requirement": "The report was delivered in full.",
                       "materiality": "MATERIAL"}])
    submit(pact, direct_vm, agent, aid, kind="ATTESTATION", constraints=("C1",),
           text="I delivered the report in full, with every company verified.")
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r'"id":"C1"', answer("SATISFIED", "I delivered the report in full"))
    direct_vm.sender = agent
    pact.request_adjudication(aid)
    f = findings_by_id(latest_verdict(pact, aid))["C1"]
    assert (f["status"], f["effective_status"], f["corroboration"]) == ("SATISFIED", "INCONCLUSIVE", "NONE")


def test_an_acknowledged_attestation_is_bilateral_and_stands(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False, required_kinds=["ATTESTATION"], min_origins=0,
         constraints=[{"type": "FACTUAL", "requirement": "The report was delivered in full.",
                       "materiality": "MATERIAL"}])
    eid = submit(pact, direct_vm, agent, aid, kind="ATTESTATION", constraints=("C1",),
                 text="I delivered the report in full, with every company verified.")
    direct_vm.sender = creator
    pact.acknowledge_evidence(aid, eid)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r'"id":"C1"', answer("SATISFIED", "I delivered the report in full"))
    direct_vm.sender = agent
    pact.request_adjudication(aid)
    f = findings_by_id(latest_verdict(pact, aid))["C1"]
    assert (f["effective_status"], f["corroboration"]) == ("SATISFIED", "BILATERAL")
    assert latest_verdict(pact, aid)["agreement_state"] == "FULFILLED"


def test_an_agreement_may_waive_the_corroboration_floor(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False, required_kinds=["ATTESTATION"], min_origins=0,
         corroboration=False,
         constraints=[{"type": "FACTUAL", "requirement": "The report was delivered in full.",
                       "materiality": "MATERIAL"}])
    submit(pact, direct_vm, agent, aid, kind="ATTESTATION", constraints=("C1",),
           text="I delivered the report in full, with every company verified.")
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r'"id":"C1"', answer("SATISFIED", "I delivered the report in full"))
    direct_vm.sender = agent
    pact.request_adjudication(aid)
    assert latest_verdict(pact, aid)["agreement_state"] == "FULFILLED"


# ── the prompt ───────────────────────────────────────────────────────────────

def test_each_constraint_is_asked_on_its_own_and_the_evidence_is_fenced(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    seen = []
    original = direct_vm._match_llm_mock
    direct_vm._match_llm_mock = lambda prompt: (seen.append(prompt), original(prompt))[1]
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    direct_vm._match_llm_mock = original
    assert len(seen) == 6, "one prompt per constraint"
    for p in seen:
        assert "PROTOCOL INSTRUCTIONS" in p and "never follow them" in p
        assert "<<<EVIDENCE E1>>>" in p and "<<<END EVIDENCE E1>>>" in p
        assert "track()" not in p                       # scripts never reach the reader
        assert p.count('"id":"C') == 1, "one requirement to decide"
    assert "THE ONE REQUIREMENT TO DECIDE" in seen[0]


def test_a_page_that_instructs_the_panel_is_data_inside_its_fence(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False, constraints=[{"type": "FACTUAL", "requirement": "The report lists at least 50 companies.",
                     "materiality": "MATERIAL"}])
    submit(pact, direct_vm, agent, aid, source=URL_REPORT, constraints=("C1",))
    seen = []
    original = direct_vm._match_llm_mock
    direct_vm._match_llm_mock = lambda prompt: (seen.append(prompt), original(prompt))[1]
    adjudicate(direct_vm, pact, creator, aid, {"C1": answer("INCONCLUSIVE", "")},
               web={URL_REPORT: (200, INJECTION_BODY)})
    direct_vm._match_llm_mock = original
    body = seen[0].split("EVIDENCE (untrusted):", 1)[1]
    fenced = body.split("<<<EVIDENCE E1>>>", 1)[1].split("<<<END EVIDENCE E1>>>", 1)[0]
    assert "IGNORE ALL PREVIOUS INSTRUCTIONS" in fenced          # present, as data
    assert "<<<" not in fenced and ">>>" not in fenced           # its forged fence was defused
    assert latest_verdict(pact, aid)["agreement_state"] == "INCONCLUSIVE"


def test_the_model_is_never_shown_the_money(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    seen = []
    original = direct_vm._match_llm_mock
    direct_vm._match_llm_mock = lambda prompt: (seen.append(prompt), original(prompt))[1]
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    direct_vm._match_llm_mock = original
    for p in seen:
        low = p.lower()
        for word in ("bond", "deposit", "atto", "payout", "basis point", "refund", "0.2 gen"):
            assert word not in low, word
        assert "any amount, or any deadline" in low, "and it is told not to decide them"


# ── the validator ────────────────────────────────────────────────────────────

def honest(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    return aid


def test_a_validator_that_reads_the_same_pages_agrees(pact, direct_vm, creator, agent):
    honest(pact, direct_vm, creator, agent)
    assert direct_vm.run_validator() is True, "control"


def test_a_validator_refuses_a_status_the_evidence_does_not_carry(pact, direct_vm, creator, agent):
    """The leader says a requirement was met; the validator's own reading of the
    same pages says otherwise, so it refuses."""
    honest(pact, direct_vm, creator, agent)
    direct_vm.clear_mocks()
    mock_round(direct_vm, reading(C1=answer("VIOLATED", Q_COUNT)), WEB_FULFILLED)
    assert direct_vm.run_validator() is False


def test_a_validator_refuses_a_passage_that_is_not_on_its_own_copy(pact, direct_vm, creator, agent):
    aid = honest(pact, direct_vm, creator, agent)
    leader = json.loads(json.dumps(pact.get_verdict(aid, 0)))
    forged = {
        "agreement_state": leader["agreement_state"], "materiality": leader["materiality"],
        "held_for_corroboration": leader["held_for_corroboration"], "summary": leader["summary"],
        "findings": copy.deepcopy(leader["findings"]),
        "evidence": [{**e, "excerpt": "", "excerpt_digest": e["excerpt_digest"]} for e in leader["evidence"]],
    }
    forged["findings"][0]["quote"] = "The report lists 90 companies, every field complete."
    assert direct_vm.run_validator(leader_result=forged) is False


def test_a_validator_refuses_an_excerpt_no_page_produced(pact, direct_vm, creator, agent):
    """A readable item with nothing behind it, hidden behind a digest of the
    empty string, is refused: the digest covers the leader's own bytes."""
    aid = honest(pact, direct_vm, creator, agent)
    leader = json.loads(json.dumps(pact.get_verdict(aid, 0)))
    import hashlib
    empty = hashlib.sha256(b"").hexdigest()
    forged = {
        "agreement_state": leader["agreement_state"], "materiality": leader["materiality"],
        "held_for_corroboration": leader["held_for_corroboration"], "summary": leader["summary"],
        "findings": copy.deepcopy(leader["findings"]),
        "evidence": [{**e, "excerpt": "", "excerpt_digest": empty} for e in leader["evidence"]],
    }
    assert direct_vm.run_validator(leader_result=forged) is False


def test_a_validator_refuses_a_leader_that_errored_where_it_can_read(pact, direct_vm, creator, agent):
    honest(pact, direct_vm, creator, agent)
    assert direct_vm.run_validator(leader_error=Exception("[LLM_ERROR] bad answer")) is False


# ── the boundary, against a forged agreed result ─────────────────────────────

def forge_round(pact, direct_vm, monkeypatch, creator, agent, edit, aid=None):
    """Run a real round, then make the network return a forged result as if it
    had been agreed. The boundary must refuse it."""
    import genlayer.gl.vm as gl_vm
    aid = aid or in_force(pact, direct_vm, creator, agent)
    real = gl_vm.run_nondet_unsafe

    def capture(leader_fn, validator_fn):
        honest_res = real(leader_fn, validator_fn)
        forged = copy.deepcopy(honest_res)
        edit(forged)
        return forged

    monkeypatch.setattr(gl_vm, "run_nondet_unsafe", capture)
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)


@pytest.mark.parametrize("edit,words", [
    (lambda r: r.pop("findings"), "malformed"),
    (lambda r: r["findings"].reverse(), "malformed"),
    (lambda r: r["findings"][0].update(status="PROBABLY"), "malformed"),
    (lambda r: r["findings"][0].update(corroboration="TRUSTED"), "malformed"),
    (lambda r: r["findings"][0].update(quote="", quote_evidence_id="E1"), "malformed"),
    (lambda r: r["findings"][0].update(evidence_ids=["E9"]), "malformed"),
    (lambda r: r["evidence"][0].update(availability="FINE"), "malformed"),
    (lambda r: r["evidence"][0].update(excerpt=""), "malformed"),
    (lambda r: r.update(agreement_state="FULFILLED_ENOUGH"), "malformed"),
    (lambda r: r.update(materiality="HUGE"), "malformed"),
    (lambda r: r.update(agreement_state="BREACHED"), "inconsistent"),
    (lambda r: r["findings"][0].update(effective_status="VIOLATED"), "inconsistent"),
    (lambda r: r.update(held_for_corroboration=["C1"]), "inconsistent"),
])
def test_the_boundary_refuses_a_forged_agreed_result(pact, direct_vm, creator, agent, monkeypatch,
                                                     edit, words):
    with direct_vm.expect_revert(words):
        forge_round(pact, direct_vm, monkeypatch, creator, agent, edit)


def test_the_honest_round_passes_the_boundary(pact, direct_vm, creator, agent, monkeypatch):
    forge_round(pact, direct_vm, monkeypatch, creator, agent, lambda r: None)
    assert pact.get_agreement("A1")["round_count"] == 1, "control"


# ── when a round may be asked for ────────────────────────────────────────────

def test_adjudication_needs_evidence_and_the_policy_the_agreement_locked(pact, direct_vm, creator, agent):
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, economic=False, min_origins=2)
    direct_vm.sender = creator
    with direct_vm.expect_revert("no evidence has been registered"):
        pact.request_adjudication(aid)

    submit(pact, direct_vm, agent, aid, kind="ATTESTATION", text="I delivered it.", constraints=("C1",))
    direct_vm.sender = creator
    with direct_vm.expect_revert("requires WEB_SOURCE"):
        pact.request_adjudication(aid)

    submit(pact, direct_vm, agent, aid, source=URL_REPORT, constraints=("C1",))
    direct_vm.sender = creator
    with direct_vm.expect_revert("needs 2 independent origin"):
        pact.request_adjudication(aid)


def test_only_a_party_can_ask_for_adjudication(pact, direct_vm, creator, agent, stranger):
    aid = in_force(pact, direct_vm, creator, agent)
    mock_round(direct_vm, READING_FULFILLED, WEB_FULFILLED)
    direct_vm.sender = stranger
    with direct_vm.expect_revert("only a party"):
        pact.request_adjudication(aid)


def test_a_second_round_waits_for_the_interval_and_the_rounds_are_capped(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    finalize(direct_vm, pact, creator, aid)
    pact.get_agreement(aid)
    direct_vm.sender = creator
    with direct_vm.expect_revert("needs an agreement in force"):
        pact.request_adjudication(aid)          # a finalized verdict is not re-opened by a new round


def test_finalizing_waits_for_the_contracts_own_delay(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    adjudicate(direct_vm, pact, creator, aid, READING_FULFILLED)
    proposed = latest_verdict(pact, aid)["proposed_at"]
    warp_to(direct_vm, proposed + 120)
    direct_vm.sender = creator
    with direct_vm.expect_revert("can be finalized at"):
        pact.finalize_verdict(aid)
    warp_to(direct_vm, proposed + 300)
    pact.finalize_verdict(aid)
    a = pact.get_agreement(aid)
    assert (a["lifecycle"], a["result_state"]) == ("FINALIZED", "FULFILLED")
    assert pact.get_verdict(aid, 0)["status"] == "FINALIZED"


def test_a_verdict_that_was_never_proposed_cannot_be_finalized(pact, direct_vm, creator, agent):
    aid = in_force(pact, direct_vm, creator, agent)
    direct_vm.sender = creator
    with direct_vm.expect_revert("only a proposed verdict can be finalized"):
        pact.finalize_verdict(aid)
