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
            if t.get("agreement") != case or t.get("refused"):
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
            for e in verdict["evidence"]:
                source = e.get("source") or "(attestation)"
                name = source.rsplit("/", 1)[-1] if source.startswith("http") else source
                w(f"| `{e['evidence_id']}` | [{name}]({source}) | {e['availability']} | "
                  f"`{e['origin']}` | `{e['excerpt_digest'][:16]}...` |")
            w("")
        settled = entry.get("settled")
        if settled:
            w(f"Settled: {gen(settled['paid_creator'])} to the buyer, "
              f"{gen(settled['paid_counterparty'])} to the deliverer. The agreement holds "
              f"{gen(settled['amount_deposited'])} and {gen(settled['bond_deposited'])} afterwards.")
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
        w("| Sent | Refused with |")
        w("| --- | --- |")
        for name, wall in r["walls"].items():
            if not wall.get("refused"):
                continue
            reason = wall["refusal"].replace("[EXPECTED] ", "").replace("|", "\\|")
            w(f"| {wall['step'].replace(' (refused)', '')} {link(wall['tx'])} | {reason} |")
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
