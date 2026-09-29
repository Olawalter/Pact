"""The wait between a verdict and its consequence, on the real clock.

A verdict is proposed, then it stands for a delay before anything irreversible
happens. These tests use the chain's own clock, not the wall clock of whoever
runs them, because the contract measures the delay from the transaction time.
"""


class TestFinalityDelay:
    def test_a_fresh_verdict_cannot_be_finalized(self, world):
        """Sent as a real transaction and refused by the contract, so the
        refusal is on the chain rather than asserted in a test's imagination."""
        world.adjudicated()
        wall = world.live.record["walls"]["finalize_early"]
        assert wall["refused"], wall
        assert "can be finalized at" in wall["refusal"], wall
        assert wall["consensus"] == "MAJORITY_AGREE", "validators must agree about a refusal too"

    def test_the_agreement_did_not_move_when_finalization_was_refused(self, world):
        world.adjudicated()
        for case in ("fulfilled", "breached"):
            agreement = world.agreement(case)
            assert agreement["lifecycle"] in ("VERDICT_PROPOSED", "FINALIZED", "CONSEQUENCE_EXECUTED")
            assert int(agreement["settled_at"]) == 0 or agreement["lifecycle"] == "CONSEQUENCE_EXECUTED"

    def test_after_the_delay_the_verdict_is_finalized_once(self, world):
        world.settled()
        for case in ("fulfilled", "breached"):
            finalized = world.live.record["agreements"][case]["finalized"]
            verdict = world.verdict(case)
            assert int(verdict["finalized_at"]) > 0, case
            assert int(verdict["finalized_at"]) >= int(verdict["proposed_at"]) + 300, (
                case, verdict["proposed_at"], verdict["finalized_at"])
            assert finalized["result_state"] == verdict["agreement_state"], case
            assert finalized["latest_verdict_id"] == verdict["verdict_id"], case


class TestWhatStaysFixed:
    def test_the_state_the_chain_kept_is_the_state_the_panel_agreed(self, world):
        world.settled()
        for case in ("fulfilled", "breached"):
            verdict = world.verdict(case)
            agreement = world.agreement(case)
            assert agreement["result_state"] == verdict["agreement_state"], case
            assert agreement["fingerprint"] == verdict["fingerprint"], (
                f"{case}: the settled agreement's fingerprint is not the one consensus covered")

    def test_the_history_records_each_step_in_order(self, world):
        world.settled()
        for case in ("fulfilled", "breached"):
            history = world.live.read("get_history", world.ids[case], 0, 40)["items"]
            steps = [h["to"] for h in history][::-1]          # the view returns newest first
            assert steps[0] == "DRAFT", (case, steps)
            assert steps[-1] == "CONSEQUENCE_EXECUTED", (case, steps)
            for expected in ("LOCKED", "ACTIVE", "VERDICT_PROPOSED", "FINALIZED"):
                assert expected in steps, (case, expected, steps)
            froms = [h["from"] for h in history][::-1]
            assert froms[1:] == steps[:-1], (case, list(zip(froms, steps)))
            times = [int(h["at"]) for h in history][::-1]
            assert times == sorted(times), (case, times)
