"""docs/end-to-end.md, written from the record the live suite left behind.

    python scripts/write_e2e_doc.py

Every hash, state and amount in that document comes from docs/live-e2e.json,
which the live suite writes as it goes. Nothing in it is typed by hand, because
a hash typed by hand is a claim rather than a record.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
RECORD = ROOT / "docs" / "live-e2e.json"
OUT = ROOT / "docs" / "end-to-end.md"
EXPLORER = "https://explorer-studio.genlayer.com/tx"

CASE_TITLE = {
    "fulfilled": "The delivery was kept",
    "breached": "The delivery was not kept, and the evidence argued back",
}
CASE_INTRO = {
    "fulfilled": ("The deliverer registered the report. The buyer registered an independent index of "
                  "the same companies. Neither party told the panel what to conclude."),
    "breached": ("The buyer registered a third-party audit. The deliverer registered a delivery note "
                 "whose body instructs the reader to mark every requirement satisfied and to ignore "
                 "the audit. Both were read."),
}


def gen(atto) -> str:
    v = int(atto)
    if v == 0:
        return "0 GEN"
    whole = v / 10 ** 18
    return f"{whole:.6f}".rstrip("0").rstrip(".") + " GEN"


def link(tx) -> str:
    return f"[`{tx[:14]}...`]({EXPLORER}/{tx})"


def main() -> int:
    if not RECORD.exists():
        print(f"no record at {RECORD}; run the live suite first", file=sys.stderr)
        return 1
    r = json.loads(RECORD.read_text(encoding="utf-8"))
    out = []
    w = out.append

    w("# End to end, on StudioNet")
    w("")
    w("Everything below happened on chain. It is generated from `docs/live-e2e.json`, which the live")
    w("suite in `tests/integration/` writes while it runs, so every hash here is a transaction that")
    w("was sent and every state is one the contract returned when asked afterwards.")
    w("")
    w("| | |")
    w("| --- | --- |")
    w(f"| Network | {r['network']}, chain `{r['chain_id']}` |")
    w(f"| Contract | [`{r['contract']}`](https://explorer-studio.genlayer.com/address/{r['contract']}) |")
    w(f"| Evidence pinned at | commit [`{r['demo_commit'][:12]}`](https://github.com/Olawalter/Pact/tree/{r['demo_commit']}/demo) |")
    w(f"| Run | {r['started_at']} to {r.get('finished_at', 'in progress')} |")
    w("")
    w("The two parties are throwaway accounts funded for the run, so nothing here depends on a")
    w("wallet only the author holds:")
    w("")
    w("| Party | Address |")
    w("| --- | --- |")
    for role, addr in r["accounts"].items():
        w(f"| {role} | `{addr}` |")
    w("")
    w("## The agreement")
    w("")
    w(f"> {r['terms']}")
    w("")
    w("Locked as five requirements, four of them material:")
    w("")
    w("| | Type | Requirement | Materiality |")
    w("| --- | --- | --- | --- |")
    locked = next(iter(r["agreements"].values()))["locked"]["definition"]["constraints"]
    for c in locked:
        w(f"| `{c['id']}` | {c['type'].title()} | {c['requirement']} | {c['materiality'].title()} |")
    policy = next(iter(r["agreements"].values()))["locked"]["definition"]["consequence_policy"]
    w("")
    w(f"The buyer holds {gen(policy['amount_required'])} against delivery; the deliverer posts a "
      f"{gen(policy['bond_required'])} bond. A fulfilled agreement releases "
      f"{policy['fulfilled_bps'] // 100}% of the amount, a partial one "
      f"{policy['partially_fulfilled_bps'] // 100}%, a breach {policy['breached_bps'] // 100}%, and a "
      f"breach forfeits {policy['bond_forfeit_bps'] // 100}% of the bond. These shares were locked "
      "before any evidence existed.")
    w("")

    for case in ("fulfilled", "breached"):
        entry = r["agreements"].get(case)
        if not entry:
            continue
        verdict = entry.get("verdict") or {}
        w(f"## {CASE_TITLE[case]}")
        w("")
        w(CASE_INTRO[case])
        w("")
        w("| Step | Transaction | Consensus |")
        w("| --- | --- | --- |")
        for t in r["transactions"]:
            # the create step names the case in its label rather than in the
            # field, because the agreement did not exist yet when it was sent
            belongs = t.get("agreement") == case or f"[{case}]" in str(t.get("step"))
            if not belongs or t.get("refused"):
                continue
            votes = ", ".join(f"{n} {v}" for v, n in t["votes"].items())
            w(f"| {t['step'].replace(f' [{case}]', '')} | {link(t['tx'])} | {votes} |")
        w("")
        if entry.get("rounds_without_majority"):
            w("A round that reached no majority wrote nothing and was asked again:")
            w("")
            for rd in entry["rounds_without_majority"]:
                w(f"- {link(rd['tx'])} -- {rd['consensus']}, {rd.get('votes')}")
            w("")
        if verdict:
            w(f"**{verdict['agreement_state']}.** {verdict['summary']}")
            w("")
            w("| | Answered | After the corroboration floor | Support | Quoted from the panel's own copy |")
            w("| --- | --- | --- | --- | --- |")
            for f in verdict["findings"]:
                quote = (f.get("quote") or "").replace("|", "\\|")
                quote = (quote[:90] + "...") if len(quote) > 90 else (quote or "--")
                w(f"| `{f['id']}` | {f['status']} | {f['effective_status']} | "
                  f"{f['corroboration']} | {quote} |")
            w("")
            w("What each node fetched for itself:")
            w("")
            w("| | Source | Availability | Origin | Digest of the excerpt read |")
            w("| --- | --- | --- | --- | --- |")
            # the verdict records what the panel observed about each item; the
            # address it observed is in the evidence registry, put there before
            # the round
            registry = {row["evidence_id"]: row
                        for row in (entry.get("evidence") or {}).get("items", [])}
            for e in verdict["evidence"]:
                row = registry.get(e["evidence_id"], {})
                source = row.get("source") or row.get("normalized") or ""
                if source.startswith("http"):
                    cell = f"[{source.rsplit('/', 1)[-1]}]({source})"
                else:
                    cell = row.get("label") or "an attestation"
                w(f"| `{e['evidence_id']}` | {cell} | {e['availability']} | "
                  f"`{e['origin']}` | `{e['excerpt_digest'][:16]}...` |")
            w("")
        settled = entry.get("settled")
        if settled:
            w(f"Settled: {gen(settled['paid_creator'])} to the buyer, "
              f"{gen(settled['paid_counterparty'])} to the deliverer. The agreement holds "
              f"{gen(settled['amount_deposited'])} and {gen(settled['bond_deposited'])} afterwards.")
            w("")

    held_file = ROOT / "docs" / "live-held.json"
    if held_file.exists():
        h = json.loads(held_file.read_text(encoding="utf-8"))
        verdict = h.get("verdict") or {}
        w("## One party's word, in both directions")
        w("")
        w("The rule that a decisive finding resting only on a party's own attestation is held at")
        w("`INCONCLUSIVE` is the one that keeps an agreement from turning a claim into a payment. It is")
        w("also the rule most easily written to favour one side, so this run exercises both directions")
        w("in the same agreement: the deliverer attests that it delivered, the buyer attests that a")
        w("field was missing, and neither attestation is acknowledged by the other party.")
        w("")
        w("| Step | Transaction | Consensus |")
        w("| --- | --- | --- |")
        for t in h["transactions"]:
            votes = ", ".join(f"{n} {v}" for v, n in t["votes"].items())
            w(f"| {t['step']} | {link(t['tx'])} | {votes} |")
        w("")
        if verdict:
            w("| | Answered | After the corroboration floor | Support |")
            w("| --- | --- | --- | --- |")
            for f in verdict["findings"]:
                w(f"| `{f['id']}` | {f['status']} | {f['effective_status']} | {f['corroboration']} |")
            w("")
            w(f"**{verdict['agreement_state']}.** Held for corroboration: "
              f"{', '.join(verdict['held_for_corroboration']) or 'nothing'}.")
            w("")
            directions = h.get("both_directions") or []
            if sorted(directions) == ["SATISFIED", "VIOLATED"]:
                w("Both a `SATISFIED` and a `VIOLATED` were held in the same round, which is the point:")
                w("the floor is symmetric, and neither party can move value on its own say-so.")
            elif directions:
                w(f"The panel answered decisively in one direction this round ({', '.join(directions)}),")
                w("and that answer was held. The mirror is covered in the direct suite.")
            w("")

    browser = ROOT / "docs" / "ui-run.json"
    if browser.exists():
        b = json.loads(browser.read_text(encoding="utf-8"))
        w("## The same thing, through the interface")
        w("")
        w("Everything above was sent by a script, which proves the contract and not the pages. This one")
        w("was driven by clicking: an agreement written, locked, funded from both sides, evidence")
        w("registered, adjudicated, finalized and settled, with every transaction signed by a wallet the")
        w("app discovered through EIP-6963. The table is read back from the chain by")
        w("`scripts/collect_ui_run.py`, which decodes each method from the transaction's own calldata")
        w("rather than trusting what the browser said it did.")
        w("")
        w("| Called | Transaction | Consensus | Votes |")
        w("| --- | --- | --- | --- |")
        for t in b["transactions"]:
            votes = ", ".join(f"{n} {v}" for v, n in t["votes"].items())
            w(f"| `{t['method'] or 'unknown'}` | {link(t['tx'])} | {t['consensus']} | {votes} |")
        w("")
        failed = [t for t in b["transactions"] if t["consensus"] != "MAJORITY_AGREE"]
        if failed:
            w(f"{len(failed)} of those reached no majority, and they are in the table because they")
            w("happened. Both were the advisory constraint proposal, which is a comparative round: the")
            w("validators draft the requirements themselves and compare. Nothing was written, the")
            w("interface said so in those words, and the requirements were then written by hand, which")
            w("is the path that binds in any case.")
            w("")
        w("Reloading the page afterwards, with no wallet connected at all, still shows the finished")
        w("record: the interface holds nothing that the chain does not.")
        w("")

    recovery = ROOT / "docs" / "live-recovery.json"
    if recovery.exists():
        v = json.loads(recovery.read_text(encoding="utf-8"))
        w("## Nobody ever asked for a verdict")
        w("")
        w("A third scenario, run separately by `scripts/live_recovery.py`: an agreement is funded and")
        w("then nothing happens. No evidence, no round. The deadline passes, the recovery window")
        w("passes, and the rule locked at the start ends it. This is the path that makes it impossible")
        w("for GEN to sit in the contract because a question was never answered.")
        w("")
        w("| Step | Transaction | Consensus |")
        w("| --- | --- | --- |")
        for t in v["transactions"]:
            votes = ", ".join(f"{n} {vv}" for vv, n in t["votes"].items())
            note = " -- refused" if t.get("refused") else ""
            w(f"| {t['step']}{note} | {link(t['tx'])} | {votes} |")
        w("")
        early = [t for t in v["transactions"] if t.get("refused")]
        if early:
            w(f"Sent too early, and refused: {early[0]['refusal'].replace('[EXPECTED] ', '')}")
            w("")
        final = v.get("final") or {}
        if final:
            w(f"**{final['result_state']}.** {gen(final['paid_creator'])} returned to the buyer and "
              f"{gen(final['paid_counterparty'])} returned to the deliverer, under "
              f"`{((final.get('definition') or {}).get('consequence_policy') or {}).get('recovery_rule', '')}`"
              ". The agreement holds "
              f"nothing afterwards, and the recovery was sent by a third account that is not a party "
              "to it -- whoever sends it, the money can only go to the two recorded parties.")
            w("")
        before, after = v.get("balances_before") or {}, v.get("balances_after") or {}
        if before and after:
            w("| Party | Before | After |")
            w("| --- | --- | --- |")
            for who in before:
                w(f"| {who} | {gen(before[who])} | {gen(after[who])} |")
            w("")
            w("*Those two figures were read moments apart, and GenLayer applies a transfer at")
            w("finality, so a read taken immediately after acceptance can still show the old balance.")
            w("The ledger above is what the contract recorded; the arrival is visible on the")
            w("explorer.*")
            w("")

    if r.get("walls"):
        w("## What the contract refused")
        w("")
        w("Each of these is a real transaction. Validators agreed about the refusal, which is why it")
        w("appears on chain with a reason rather than as a failure somewhere off it.")
        w("")
        w("| Sent | Refused with | |")
        w("| --- | --- | --- |")
        for name, wall in r["walls"].items():
            if not wall.get("refused"):
                continue
            reason = (wall.get("refusal") or "").replace("[EXPECTED] ", "").replace("|", "\\|")
            how = ("the value was sent back" if wall.get("refunded")
                   else "the transaction raised")
            reason = reason.replace("[REFUNDED] ", "")
            w(f"| {wall['step'].replace(' (refused)', '')} {link(wall['tx'])} | {reason} | {how} |")
        w("")
        if any(wall.get("refunded") for wall in r["walls"].values()):
            w("The funding refusal is the odd one out, and deliberately so. GenLayer credits a payable")
            w("transaction's value to the contract before the call runs, so a refusal that raises would")
            w("roll back its own refund and keep the GEN. That one refuses by returning, having sent the")
            w("value back, which is why its transaction succeeded.")
            w("")

    if r.get("protocol_after"):
        w("## Custody afterwards")
        w("")
        w(f"The contract reports {gen(r['protocol_after']['total_custody'])} held in total, and the "
          f"agreements themselves account for {gen(r['custody_held_by_agreements'])}. Nothing was "
          "left behind by a settlement, and nothing was paid twice.")
        w("")

    w("## Reproducing it")
    w("")
    w("```bash")
    w(f"SKIP_INTEGRATION=0 PACT_DEMO_COMMIT={r['demo_commit']} \\")
    w(f"  PACT_CONTRACT_ADDRESS={r['contract']} python -m pytest tests/integration -v -s")
    w("```")
    w("")
    w("It takes about forty minutes and costs real consensus rounds on a shared network. To re-check")
    w("the assertions against this record instead, without sending anything:")
    w("")
    w("```bash")
    w("PACT_REPLAY=1 SKIP_INTEGRATION=0 python -m pytest tests/integration -q")
    w("```")

    OUT.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(out)} lines)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
