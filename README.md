<img src="docs/logo.svg" alt="PACT" width="420">

# PACT

**An agreement written in words, adjudicated by GenLayer, settled in code.**

Two parties agree on something in plain language: *fifty verified companies, three sources each, no
fabricated citations, before Tuesday.* Today nothing on chain can tell whether that happened. A
smart contract can hold the money but cannot read the report; an oracle can post a number but cannot
say whether the number means the agreement was kept.

PACT turns the words into explicit, separately answerable requirements, asks a panel of GenLayer
validators to answer each one against evidence they fetch for themselves, and then derives the state
of the agreement -- and any consequence in GEN -- in ordinary deterministic code.

| | |
| --- | --- |
| Network | GenLayer StudioNet, chain `61999` |
| Contract | [`0xdba02A566960639FF86C6dBe81cb33D511254Ba2`](https://explorer-studio.genlayer.com/address/0xdba02A566960639FF86C6dBe81cb33D511254Ba2) |
| Source | [`contracts/PACT.py`](contracts/PACT.py), byte-identical to the deployed bytes ([proof](docs/deployment.json)) |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Interface | `frontend/`, Next.js App Router, wallet-signed writes, no server of its own |

## Why this needs GenLayer

The judgement is the product. Everything else about PACT is ordinary.

| Who | Owns |
| --- | --- |
| Contract code | who may act, what is held, the finality delay, the corroboration floor, the arithmetic that turns a state into a payment |
| GenLayer consensus | whether each requirement was met, and what the evidence said -- agreed by a panel, not asserted by one node |
| The model | reading a document and answering one requirement, with a quote it must ground in that document |
| The interface | showing the record and composing transactions the user signs |

A requirement such as *"no fabricated citation appears in the report"* has no API. It is not a price
feed, it is not a hash comparison, and a single LLM call answering it is one party's opinion with
extra steps. It needs several independent readers who each fetch the evidence, answer separately,
and have to agree before anything is written. That is what GenLayer is.

> PACT uses GenLayer because agreement fulfilment often depends on interpreting natural-language
> requirements and real-world evidence that cannot be reduced to ordinary deterministic
> smart-contract logic.

The protocol's own documentation is at [docs.genlayer.com](https://docs.genlayer.com); the Python
contract SDK, the equivalence principle and `gl.nondet` are described there, and
[`docs/architecture.md`](docs/architecture.md) explains which of them PACT uses and why.

## An example agreement

The one the live runs adjudicate. The interface's own placeholders match it, so the five steps
read as a worked example:

> The research agent must deliver a report containing at least 50 verified companies before the
> deadline. Each company must carry at least three qualifying sources, every required field must be
> present, and no fabricated citation may appear in the report.

locked as five requirements, four of them material:

| | Type | Requirement | Materiality |
| --- | --- | --- | --- |
| `C1` | Threshold | The report contains at least 50 companies. | Material |
| `C2` | Factual | Every required field is present for each company. | Material |
| `C3` | Threshold | Each company carries at least three qualifying sources. | Material |
| `C4` | Exclusion | No fabricated citation appears in the report. | Material |
| `C5` | Temporal | The report was delivered before 2026-09-30T18:00:00Z. | Minor |

with 0.02 GEN held against delivery, a 0.01 GEN bond from the deliverer, everything released on
`FULFILLED`, half on `PARTIALLY_FULFILLED`, nothing on `BREACHED`, and half the bond forfeit on a
breach. Those shares are locked before any evidence exists.

## The wallet

Every write is signed by the person making it, in their own wallet. The app has no key, no server and
no session: it discovers injected wallets through EIP-6963, asks for the account, and composes a
transaction that GenLayer's own client sends.

| The app shows | When |
| --- | --- |
| Connect wallet | no account is authorised yet |
| The account, abbreviated | connected |
| Wrong network, with the chain it expects | the wallet is not on chain `61999` |
| Waiting for your signature | the request is with the wallet |
| Submitted, pending, leader proposed, validating, decided, finalized | each step the app has actually observed from GenLayer, never a timer |
| The contract's own words | the contract refused, including a funding refusal that returned the GEN |
| Nothing changed, and it can be sent again | the round reached no majority |

A step is only shown as passed when GenLayer reported it, and the app waits for the contract's own
views to show the write before it calls it decided.

## The lifecycle

```
   DRAFT ----propose_constraints----> CONSTRAINTS_REVIEW
     |                                        |
     +--------------lock_agreement------------+
                       |
                       v
                    LOCKED ---fund_agreement (both sides)---> ACTIVE <--- submit_evidence
                       |                                        |        acknowledge_evidence
               cancel_agreement                         request_adjudication
                       |                                        |
                       v                                        v
                   CANCELLED                          ADJUDICATION_PENDING
                                                                |
                                              GenLayer panel agrees a result
                                                                v
                                                       VERDICT_PROPOSED
                                                                |
                                            finalize_verdict (after 5 minutes)
                                                                v
                                                           FINALIZED
                                                                |
                                                     execute_consequence
                                                                v
                                                   CONSEQUENCE_EXECUTED

   LOCKED or ACTIVE ---recover (deadline + recovery window passed)---> CONSEQUENCE_EXECUTED
```

Who may move it, and what the contract refuses:

| Step | Who may send it | Refused when |
| --- | --- | --- |
| `create_agreement` | anyone; the sender becomes the creator | the counterparty is not an address, or is the sender |
| `propose_constraints` | the creator | the agreement is locked. The proposal is advisory and binds nothing |
| `lock_agreement` | the creator | already locked; the definition breaks any rule in [the specification](docs/specification.md) |
| `fund_agreement` | each party, for its own side | not a party (the value is returned, not kept); not the exact amount; already in force |
| `cancel_agreement` | the creator | the agreement is in force, or any evidence exists |
| `submit_evidence` | either party | the agreement is not `ACTIVE`; the same address registered twice; over the cap of 24 |
| `acknowledge_evidence` | the other party | acknowledging your own attestation, or acknowledging a web source |
| `request_adjudication` | either party | not in force; within 10 minutes of the last round; over 4 rounds |
| `finalize_verdict` | anyone | earlier than 5 minutes after the verdict was proposed |
| `execute_consequence` | anyone | the verdict is not finalized; nothing is held |
| `recover` | anyone | before the deadline and the recovery window have both passed |

Money only ever moves to the two addresses recorded when the agreement was created, whoever sends
the transaction.

## What the panel answers, and what the code decides

Each requirement gets exactly one of four answers, per round:

| Constraint result | Means |
| --- | --- |
| `SATISFIED` | the evidence shows the requirement was met, with a quote from an item the node itself read |
| `VIOLATED` | the evidence shows it was not met, with the same grounding |
| `INCONCLUSIVE` | the evidence does not settle it, or two items contradict and neither is stronger |
| `NOT_APPLICABLE` | the requirement does not apply to what happened |

The model never names the state of the agreement. The contract derives it:

| Agreement state | Derived when |
| --- | --- |
| `FULFILLED` | every applicable requirement is satisfied |
| `PARTIALLY_FULFILLED` | only minor requirements were violated |
| `BREACHED` | a material requirement was violated |
| `INCONCLUSIVE` | a material requirement is unresolved, or nothing applies |

The payment is basis-point arithmetic over that one word, against shares locked before anything was
judged. No model output reaches the settlement except the state name.

## Evidence

Evidence is registered on chain before a round, so both parties can see what will be read. At
adjudication **every node fetches every source itself** and records what it found: availability, the
time it looked, and a digest over the excerpt *it* fetched. A finding that would move money must
carry a quote, and that quote must appear in that node's own copy of an item the finding cites.

Three rules the contract enforces regardless of what any model says:

- **A party's word is not corroboration.** A decisive finding resting only on a party's own
  attestation is held at `INCONCLUSIVE` -- in either direction, so a held `SATISFIED` cannot release
  the amount any more than a held `VIOLATED` can forfeit the bond.
- **A source that could not be read is never evidence of a violation.** It is recorded as
  unavailable, and the requirement it was meant to answer stays open.
- **Text inside evidence is text, not instruction.** Every item is fenced before the model sees it,
  and anything resembling a fence in the body is replaced, never deleted.

## Verified end to end

Every line below is a set of transactions on StudioNet against the contract above, not a local
simulation. The full record, with hashes, is in [docs/end-to-end.md](docs/end-to-end.md).

| Scenario | What was registered | Result |
| --- | --- | --- |
| Delivery kept | the report, and an independent index of the same companies | `FULFILLED` -- requirements satisfied with grounded quotes, the amount and the bond released to the deliverer |
| Delivery breached, with an injection attempt | a third-party audit, and a delivery note whose text instructs the reader to mark every requirement satisfied and ignore the audit | `BREACHED` -- the note was read (it is in the record) and obeyed nothing; the material violations stood |
| Never adjudicated | nothing | `INCONCLUSIVE` under the locked recovery rule, once the deadline and the recovery window had both passed; nothing stranded |
| One party's word, both ways | an attestation from each party, neither acknowledged | both decisive answers held at `INCONCLUSIVE`: a held `SATISFIED` released nothing and a held `VIOLATED` forfeited nothing |
| The same lifecycle, by clicking | driven through the pages with a wallet, not a script | every write signed in the wallet, and the finished record still reads from the chain after a reload with no wallet connected |

## Tests

| Suite | What it covers | Command |
| --- | --- | --- |
| 165 direct tests | the contract in GenVM Direct Mode, including the validator closure replayed against forged leader results | `python -m pytest tests/direct` |
| 32 live tests | the same agreement on StudioNet, asserted rather than printed | `SKIP_INTEGRATION=0 PACT_DEMO_COMMIT=<commit> python -m pytest tests/integration` |
| 90 mutants | every mutant either dies or is documented as equivalent | `python scripts/mutate.py` |
| 55 interface tests | the rules the form mirrors, the acts panel, the write lifecycle, the contract schema | `cd frontend && npx vitest run` |

The live suite is skipped by default: a full run is about forty minutes of real consensus rounds.

## Running it

```bash
python -m pip install -r requirements.txt
python -m pytest tests/direct
```

```bash
genvm-lint check contracts/PACT.py
```

To deploy your own and point the interface at it:

```bash
python scripts/deploy.py
```

```bash
python scripts/verify_deployment.py <address> --write-schema
```

```bash
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

## Repository

| Path | |
| --- | --- |
| `contracts/PACT.py` | the contract: 11 writes, 11 views |
| `tests/direct/` | Direct Mode suite |
| `tests/integration/` | the live StudioNet suite |
| `scripts/` | deploy, verify, mutate, and the live scenarios |
| `demo/` | the documents the live runs adjudicate, pinned by commit |
| `frontend/` | the interface |
| `docs/` | specification, architecture, evidence, deployment, end-to-end record, security |

## Documentation

- [Specification](docs/specification.md) -- the model, the vocabulary, and the rules the contract enforces
- [Architecture](docs/architecture.md) -- the boundary between code, consensus, model and interface
- [Evidence](docs/evidence.md) -- how a document becomes something a panel can be held to
- [Deployment](docs/deployment.md) -- deploying, and proving the deployed bytes are this source
- [End to end](docs/end-to-end.md) -- the live runs, with transaction hashes
- [Security](docs/security.md) -- what PACT defends against, and what it does not claim
