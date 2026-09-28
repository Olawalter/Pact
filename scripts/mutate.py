"""Mutation sweep: break one guard at a time in a scratch copy of the contract
and require the direct suite to fail. A surviving mutant is a guard no test
holds, unless it is listed in EQUIVALENT with the reason no call can reach it.

    python scripts/mutate.py                      # every mutant
    python scripts/mutate.py "zero value accepted"

Exits non-zero on any undocumented survivor, and on any mutant whose pattern
does not match exactly once.
"""
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "contracts" / "PACT.py").read_text(encoding="utf-8")

MUTANTS = [
    # ── the agreement and its definition ──
    ("two parties may be one", 'if other.lower() == creator.lower():', "if False:"),
    ("any text may be a counterparty", 'if not re.fullmatch(r"0x[0-9a-fA-F]{40}", other):', "if False:"),
    ("the title is unbounded", 'title_s = _line(title, "the title", MAX_TITLE)', "title_s = str(title)"),
    ("a fence may be written into a one-line field",
     "if ANGLE_RUN.search(s):                          # one line of party text", "if False:"),
    ("a fence may be written into the terms",
     "if ANGLE_RUN.search(s):                          # longer party prose", "if False:"),
    ("an agreement may be locked twice", 'if str(a.lifecycle) not in (L_DRAFT, L_REVIEW):\n            _fail(f"the agreement is already locked; it is {a.lifecycle}")',
     'if False:\n            _fail(f"the agreement is already locked; it is {a.lifecycle}")'),
    ("constraints are unbounded", "if not isinstance(raw, list) or not MIN_CONSTRAINTS <= len(raw) <= MAX_CONSTRAINTS:", "if False:"),
    ("any constraint type is allowed", "if ctype not in CONSTRAINT_TYPES:", "if False:"),
    ("any materiality is allowed", "if materiality not in MATERIALITIES:", "if False:"),
    ("a requirement may repeat", "if _squash(requirement) in seen:", "if False:"),
    ("the evidence policy is unchecked", "if not 0 <= min_independent <= 6:", "if False:"),
    ("any evidence kind may be required", "if not isinstance(required_kinds, list) or any(k not in EVIDENCE_KINDS for k in required_kinds):", "if False:"),
    ("a partial outcome may pay more than a fulfilled one", 'if shares["partially_fulfilled_bps"] > shares["fulfilled_bps"]:', "if False:"),
    ("a breach may pay more than a partial outcome", 'if shares["breached_bps"] > shares["partially_fulfilled_bps"]:', "if False:"),
    ("any recovery rule is allowed", "if rule not in RECOVERY_RULES:", "if False:"),
    ("an economic agreement may stake nothing", "if amount == 0 and bond == 0:", "if False:"),
    ("amounts are unbounded", "if v and not MIN_AMOUNT <= v <= MAX_AMOUNT:", "if False:"),
    ("a deadline may be in the past", "if deadline < now + MIN_DEADLINE_AHEAD:", "if False:"),
    ("the deadline may be a decade away", "if deadline > now + MAX_DEADLINE_AHEAD:", "if False:"),
    ("the recovery window is unbounded", "if not MIN_RECOVERY_WINDOW <= window <= MAX_RECOVERY_WINDOW:", "if False:"),
    ("the fingerprint ignores the parties", '"creator": creator.lower(),\n        "counterparty": counterparty.lower(),', ""),
    ("the fingerprint ignores the definition",
     '"definition": definition,\n    }))',
     '}))'),
    ("the fingerprint ignores the words", '"terms": terms,', ""),

    # ── evidence ──
    ("a stranger may submit evidence", 'if not who:\n            _fail("only a party to this agreement can submit evidence")',
     'if False:\n            _fail("only a party to this agreement can submit evidence")'),
    ("evidence may be registered before the agreement is in force", 'if str(a.lifecycle) != L_ACTIVE:\n            _fail(f"evidence can be registered while the agreement is ACTIVE; it is {a.lifecycle}")',
     'if False:\n            _fail(f"evidence can be registered while the agreement is ACTIVE; it is {a.lifecycle}")'),
    ("evidence may name a constraint that does not exist", "if c not in constraint_ids:", "if False:"),
    ("evidence need not name a constraint", "if not isinstance(related, list) or not related:", "if False:"),
    ("plain http is a source", 'if not url.lower().startswith("https://"):', "if False:"),
    ("a credentialed or dotless host is a source", 'if "@" in rest.split("/", 1)[0] or not host or "." not in host or " " in url:', "if False:"),
    ("a trailing dot makes a second publisher", 'if host.endswith(".") or ".." in host or host.startswith("."):', "if False:"),
    ("a non-ASCII host makes a second publisher", "if not host.isascii():", "if False:"),
    ("an IP address is a publisher", 'if re.fullmatch(r"[0-9.]+", host) or host.startswith("["):', "if False:"),
    ("the same page may be registered twice", 'if other.get("normalized") and other["normalized"] == row["normalized"]:', "if False:"),
    ("one publisher is two origins", 'if host in PLATFORM_OWNER and len(path) > PLATFORM_OWNER[host]:', "if False:"),
    ("a second-level suffix is a publisher", "if len(labels) >= 3 and labels[-2] in SECOND_LEVEL and len(labels[-1]) == 2:", "if False:"),
    ("an author may acknowledge their own attestation", 'if row["submitter"].lower() == self._sender().lower():', "if False:"),
    ("an attestation may be acknowledged twice", 'if row["acknowledged_by"]:', "if False:"),
    ("a web source may be acknowledged", 'if row["kind"] != K_ATTESTATION:', "if False:"),

    # ── reading ──
    ("a status needs no passage", 'if status in (S_SATISFIED, S_VIOLATED) and not grounded:', "if False:"),
    ("a short passage grounds a claim", "return MIN_QUOTE <= len(quote) and _squash(quote) in _squash(text)",
     "return _squash(quote) in _squash(text)"),
    ("the passage need not come from a cited item", "grounded = bool(quote) and from_id in cited and _grounded(quote, bodies.get(from_id, \"\"))",
     "grounded = bool(quote)"),
    ("evidence the party did not register still decides", 'and constraint["id"] in rows_by_id[c]["related_constraints"]', ""),
    ("an unread item still decides", 'and rows_by_id[c]["availability"] in (A_AVAILABLE, A_SUBMITTED)', ""),
    ("any status name is accepted", "if status not in CONSTRAINT_STATUSES:", "if False:"),
    # the original bug: literal fences deleted, so their neighbours join into a new one
    ("fences deleted literally", 'ANGLE_RUN.sub(" ", str(text or ""))', 're.sub(r"<<<|>>>", "", str(text or ""))'),
    ("binary noise is a page", "if len(text[:4000]) and printable / len(text[:4000]) < 0.8:", "if False:"),

    # ── corroboration and derivation ──
    ("one party's word moves money", 'if policy["corroboration_required"] and status in (S_SATISFIED, S_VIOLATED) and cls == C_NONE:', "if False:"),
    ("an attestation is as good as a fetched page", 'if row["kind"] == K_WEB and row["availability"] == A_AVAILABLE and not row["origin"].startswith("party:"):',
     'if row["kind"] in (K_WEB, K_ATTESTATION):'),
    ("an unacknowledged attestation is bilateral", 'if row["kind"] == K_ATTESTATION and row.get("acknowledged_by"):', 'if row["kind"] == K_ATTESTATION:'),
    ("a material violation is not a breach", "if material_violated:", "if False:"),
    ("an unresolved material requirement is ignored", "elif material_unresolved or not applicable:", "elif False:"),
    ("a minor violation is a full fulfilment", "elif minor_violated:", "elif False:"),
    ("materiality is ignored", 'and by_id[f["id"]]["materiality"] == MATERIAL]\n    minor_violated', 'and True]\n    minor_violated'),

    # ── the boundary and the equivalence set ──
    ("the boundary accepts any shape", "if not _well_formed(res, definition, rows):", "if False:"),
    ("the boundary accepts a forged state", '_fingerprint(rederived) != _fingerprint(res)', "False"),
    ("the boundary accepts an unknown status", "if f.get(\"status\") not in CONSTRAINT_STATUSES or f.get(\"effective_status\") not in CONSTRAINT_STATUSES:", "if False:"),
    ("the boundary accepts an unknown corroboration", 'if f.get("corroboration") not in CORROBORATION:', "if False:"),
    ("the boundary accepts a passage with no source", 'if bool(f["quote"]) != bool(f["quote_evidence_id"]):', "if False:"),
    ("the boundary accepts a readable item with nothing behind it", 'if e["availability"] == A_AVAILABLE and not e.get("excerpt"):', "if False:"),
    ("the boundary accepts evidence ids that do not exist", 'if not isinstance(f.get("evidence_ids"), list) or any(e not in eids for e in f["evidence_ids"]):', "if False:"),
    ("validators skip the findings", '"findings": [(f["id"], f["status"], f["effective_status"], f["corroboration"],\n                      sorted(f["evidence_ids"]), f["quote_evidence_id"]) for f in res["findings"]],', ""),
    ("validators skip the state", '"state": res["agreement_state"],', ""),
    ("validators skip the evidence", '"evidence": [(e["evidence_id"], e["availability"], e["origin"]) for e in res["evidence"]],', ""),
    ("validators skip the passages", "if not quotes_hold(leader, bodies):", "if False:"),
    ("a passage need not be on the validator's copy", 'if q and (not src or not _grounded(q, bodies.get(src, ""))):', "if False:"),
    ("an excerpt need not match the bytes fetched", "if not _prefix_compatible(e.get(\"excerpt\", \"\"), mine):", "if False:"),
    ("an empty excerpt is a prefix of every page", "if not x or not y:\n        return False", "if False:\n        return False"),
    ("a digest need not cover the excerpt", 'if _digest(_squash(e.get("excerpt", ""))) != e.get("excerpt_digest"):', "if False:"),

    # ── rounds, funding and settlement ──
    ("a stranger may ask for adjudication", 'if not self._party(a, self._sender()):\n            _fail("only a party to this agreement can request adjudication")',
     'if False:\n            _fail("only a party to this agreement can request adjudication")'),
    ("adjudication needs no evidence", "if not rows:", "if False:"),
    ("the required evidence kinds are ignored", "if missing:", "if False:"),
    ("independent origins are not counted", 'if len(origins) < int(policy["min_independent_origins"]):', "if False:"),
    ("a verdict may be finalized at once", "if now < ready:\n            _fail(f\"the verdict can be finalized at {ready}; the transaction time is {now}\")",
     "if False:\n            _fail(f\"the verdict can be finalized at {ready}; the transaction time is {now}\")"),
    ("the creator amount may be any size",
     "if sent != need:                         # the creator's amount, in one payment", "if False:"),
    ("the bond may be any size",
     "if sent != need:                         # the counterparty's bond, in one payment", "if False:"),
    ("a stranger may fund", "if not who:\n            self._send_gen(self._sender(), sent)", "if False:\n            self._send_gen(self._sender(), sent)"),
    ("a zero deposit is accepted", "if sent <= 0:", "if False:"),
    ("funding is possible in any state", 'if str(a.lifecycle) != L_LOCKED:\n            self._send_gen(self._sender(), sent)', 'if False:\n            self._send_gen(self._sender(), sent)'),
    ("an agreement is in force before it is funded", "funded = (int(a.amount_deposited) >= int(a.amount_required)\n                  and int(a.bond_deposited) >= int(a.bond_required))", "funded = True"),
    ("a consequence needs no verdict", 'if str(a.lifecycle) != L_FINALIZED:', "if False:"),
    ("an empty ledger is settled again", "if amount + bond <= 0:", "if False:"),
    ("the ledger is not zeroed before the transfer",
     "a.amount_deposited = u256(0)                 # the settled agreement", "pass"),
    ("an agreement with evidence may be cancelled", "if int(a.evidence_count) > 0:", "if False:"),
    ("recovery ignores the window", "if now < ready:\n            _fail(f\"recovery is possible at {ready}; the transaction time is {now}\")",
     "if False:\n            _fail(f\"recovery is possible at {ready}; the transaction time is {now}\")"),
    ("recovery applies after a verdict", "if str(a.lifecycle) not in (L_LOCKED, L_ACTIVE):", "if False:"),
    ("a breach forfeits nothing", 'forfeit = bond * policy["bond_forfeit_bps"] // BPS if state == R_BREACHED else 0', "forfeit = 0"),
    ("every state pays the same", 'if state == R_FULFILLED:\n        release = policy["fulfilled_bps"]', 'if True:\n        release = policy["fulfilled_bps"]'),
]

# Guards no public call can reach, kept as defence in depth. Removing one
# changes nothing observable, so no test can kill it; each reason says why.
EQUIVALENT = {
    "an empty ledger is settled again":
        "execute_consequence requires the agreement to be FINALIZED, which it can only reach through an "
        "adjudication that required it to be ACTIVE, which required the full amount and bond to be "
        "deposited; a settled agreement is CONSEQUENCE_EXECUTED, so the ledger is never zero here",
    "the boundary accepts evidence ids that do not exist":
        "a reading keeps only ids that exist on this agreement, so a well formed round never carries an "
        "unknown id; the check guards a forged result, which the fingerprint comparison already refuses",
}


def main() -> int:
    only = set(sys.argv[1:])
    unknown = only - {name for name, _, _ in MUTANTS}
    if unknown:
        print(f"no such mutant: {', '.join(sorted(unknown))}")
        return 2
    chosen = [m for m in MUTANTS if not only or m[0] in only]
    survivors, bad = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for name, old, new in chosen:
            if SOURCE.count(old) != 1:
                print(f"BAD MUTANT {name!r}: pattern found {SOURCE.count(old)} times", flush=True)
                bad.append(name)
                continue
            path = pathlib.Path(tmp) / "PACT.py"
            path.write_text(SOURCE.replace(old, new), encoding="utf-8")
            env = {**os.environ, "PACT_CONTRACT": str(path), "PYTHONUTF8": "1"}
            proc = subprocess.run([sys.executable, "-m", "pytest", "tests/direct", "-q", "-x",
                                   "-p", "no:cacheprovider"], cwd=ROOT, env=env, capture_output=True,
                                  text=True)
            killed = proc.returncode != 0
            print(f"{'killed  ' if killed else 'SURVIVED'} {name}", flush=True)
            if not killed:
                survivors.append(name)
    equivalent = [s for s in survivors if s in EQUIVALENT]
    real = [s for s in survivors if s not in EQUIVALENT]
    ran = len(chosen) - len(bad)
    print(f"\n{ran - len(survivors)}/{ran} mutants killed, {len(equivalent)} documented equivalent, "
          f"{len(real)} undocumented" + (f", {len(bad)} bad pattern(s)" if bad else ""))
    for s in equivalent:
        print(f"  equivalent  {s}: {EQUIVALENT[s]}")
    for s in real:
        print(f"  SURVIVOR    {s}")
    return 1 if real or bad else 0


if __name__ == "__main__":
    sys.exit(main())
