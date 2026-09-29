"""The GEN, on the chain.

The point of these is that custody is real: what the contract holds is what it
was sent, what it pays is what the policy says about the state consensus
reached, and after settlement it holds nothing on that agreement's account.
"""
import pytest

from scenario import AMOUNT, BOND

BPS = 10_000
SHARE = {"FULFILLED": 10_000, "PARTIALLY_FULFILLED": 5_000, "BREACHED": 0, "INCONCLUSIVE": None}
FORFEIT = {"FULFILLED": 0, "PARTIALLY_FULFILLED": 0, "BREACHED": 5_000}


class TestCustody:
    """These read the snapshot each phase recorded, not the agreement as it
    stands now: by the time the later tests run the same agreement has settled,
    and an assertion about what was held then must be made against then."""

    def test_the_contract_holds_exactly_what_was_sent(self, world):
        world.funded()
        for case in ("fulfilled", "breached"):
            funded = world.live.record["agreements"][case]["funded"]
            assert int(funded["amount_deposited"]) == AMOUNT, case
            assert int(funded["bond_deposited"]) == BOND, case
            assert funded["lifecycle"] == "ACTIVE", case

    def test_funding_an_agreement_already_in_force_is_refused_and_returns_the_value(self, world):
        """StudioNet credits the value of a payable write even when the write
        raises, so the contract must return it rather than raise. What proves it
        is the settlement: exactly the amount and the bond left the contract, so
        the refused second amount was never in it."""
        world.settled()
        wall = world.live.record["walls"]["fund_twice"]
        assert wall["refused"], wall
        assert wall["refunded"], "a refused deposit must refuse by returning, not by raising"
        assert wall["execution"] == "SUCCESS", (
            "a raise would roll back the refund along with everything else", wall)
        assert "[REFUNDED]" in wall["refusal"], wall
        assert wall["consensus"] == "MAJORITY_AGREE", wall
        settled = world.live.record["agreements"]["fulfilled"]["settled"]
        paid = int(settled["paid_creator"]) + int(settled["paid_counterparty"])
        assert paid == AMOUNT + BOND, (paid, settled)
        after = world.live.record["agreements"]["fulfilled"].get("after_walls")
        if after:                             # recorded by runs after this test was written
            assert int(after["amount_deposited"]) == AMOUNT, (
                "a refused second funding was added to custody anyway")


class TestPayout:
    @pytest.mark.parametrize("case", ["fulfilled", "breached"])
    def test_the_split_follows_the_locked_policy_and_the_agreed_state(self, world, case):
        world.settled()
        settled = world.live.record["agreements"][case]["settled"]
        state = settled["result_state"]
        share = SHARE[state]
        if share is None:
            pytest.skip(f"{case} reached {state}; the recovery path covers this")

        released = AMOUNT * share // BPS
        forfeited = BOND * FORFEIT[state] // BPS
        to_counterparty = released + (BOND - forfeited)
        to_creator = (AMOUNT - released) + forfeited

        assert int(settled["paid_counterparty"]) == to_counterparty, (case, state, settled)
        assert int(settled["paid_creator"]) == to_creator, (case, state, settled)
        assert to_creator + to_counterparty == AMOUNT + BOND, "GEN was created or destroyed"

    def test_a_breach_costs_the_bond_and_a_fulfilment_returns_it(self, world):
        world.settled()
        states = {case: world.live.record["agreements"][case]["settled"]["result_state"]
                  for case in ("fulfilled", "breached")}
        for case, state in states.items():
            settled = world.live.record["agreements"][case]["settled"]
            if state == "FULFILLED":
                assert int(settled["paid_counterparty"]) == AMOUNT + BOND, case
                assert int(settled["paid_creator"]) == 0, case
            if state == "BREACHED":
                assert int(settled["paid_creator"]) > AMOUNT, (
                    "a breach returned the amount but did not touch the bond")
                assert int(settled["paid_counterparty"]) < BOND, case


class TestAfterwards:
    def test_the_agreement_holds_nothing_once_it_has_settled(self, world):
        world.settled()
        for case in ("fulfilled", "breached"):
            agreement = world.agreement(case)
            assert agreement["lifecycle"] == "CONSEQUENCE_EXECUTED", case
            assert int(agreement["amount_deposited"]) == 0, case
            assert int(agreement["bond_deposited"]) == 0, case
            assert int(agreement["settled_at"]) > 0, case

    def test_settling_a_second_time_pays_nothing(self, world):
        world.settled()
        wall = world.live.record["walls"]["settle_twice"]
        assert wall["refused"], "an agreement was allowed to settle twice"
        agreement = world.agreement("fulfilled")
        settled = world.live.record["agreements"]["fulfilled"]["settled"]
        assert agreement["paid_creator"] == settled["paid_creator"]
        assert agreement["paid_counterparty"] == settled["paid_counterparty"]

    def test_the_chain_and_the_ledger_agree_about_what_the_contract_holds(self, world):
        """The assertion that was missing. An earlier deployment refused a second
        funding by raising, which rolled back its own refund, so the contract held
        GEN that no ledger recorded: its balance exceeded total_custody by exactly
        the refused amount. Both numbers are read live, now, from the chain."""
        world.settled()
        balance = world.live.contract_balance()
        custody = int(world.live.read("get_protocol_info")["total_custody"])
        assert balance == custody, (
            f"the chain says the contract holds {balance} atto and its ledger says {custody}: "
            f"{balance - custody} atto is unaccounted for")

    def test_the_protocol_ledger_matches_what_the_agreements_hold(self, world):
        world.settled()
        info = world.live.record["protocol_after"]
        assert int(info["total_custody"]) == int(world.live.record["custody_held_by_agreements"]), info


class TestWalls:
    @pytest.mark.parametrize("wall,expect", [
        ("lock_twice", "locked"),
        ("stranger_locks", "creator"),
        ("evidence_before_funding", "active"),
        ("adjudicate_before_funding", "in force"),
        ("stranger_cancels", "creator"),
        ("same_source_twice", "already registered"),
    ])
    def test_the_contract_refuses_in_its_own_words(self, world, wall, expect):
        """Each of these was a real transaction. The refusal text is the one a
        person sees in the interface, so it is worth pinning."""
        world.evidenced()
        entry = world.live.record["walls"][wall]
        assert entry["refused"], (wall, entry)
        assert expect in entry["refusal"].lower(), (wall, entry["refusal"])
        assert entry["consensus"] == "MAJORITY_AGREE", (
            f"{wall}: validators must agree that a write is refused, not merely fail")
