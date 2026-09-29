# PACT — specification

Written before the contract. It fixes what PACT decides, what is decided by code, what is decided by
consensus, and what may never be decided by either.

## 1. The decision PACT exists to make

> Given a locked natural-language agreement, its explicit constraints, its evidence policy and the
> submitted evidence: has each requirement been satisfied?

That question cannot be answered by ordinary contract code (it needs reading and judgement) and must
not be answered by one server (whoever runs it decides the outcome). It is answered by GenLayer
validators, each reading the evidence for itself.

Everything else in PACT is deterministic: what the agreement says, which evidence counts, how
constraint results map to an agreement state, and what that state pays.

## 2. Responsibility boundary

| Decided by | What |
|---|---|
| **Contract code, deterministic** | party authorization, the agreement fingerprint, the lifecycle, deadlines, evidence registration and independence grouping, the corroboration class, the mapping from constraint results to the agreement state, the consequence policy, GEN custody and settlement |
| **GenLayer consensus, non-deterministic** | fetching each web source, reading what the evidence states, and deciding each constraint's status with the passage that supports it |
| **The model** | reading only. It never sees the deposit, never names the agreement state, never chooses an amount, and never decides whether a deadline passed |
| **The interface** | forms, drafts, previews, wallet requests, display. It decides nothing and stores nothing |

Two non-deterministic paths exist, and only one of them can move value:

| Path | Purpose | Consensus-critical |
|---|---|---|
| `propose_constraints` | drafting help: turn the terms into a proposed constraint list a human then edits | No. The proposal is advisory and is never binding until a human locks it |
| `adjudicate` | decide each constraint against the evidence | Yes. Its result is the only input to settlement |

## 3. Agreement model

Stored per agreement (GenLayer storage types: `TreeMap`, `DynArray`, `u256`, `Address`,
`@allow_storage` dataclasses; large sub-objects are canonical JSON strings inside `DynArray[str]`):

| Field | Meaning |
|---|---|
| `agreement_id` | `A1`, `A2`, … assigned by the contract |
| `creator`, `counterparty` | the two parties; both are recorded from the transaction signer or fixed at creation |
| `title`, `original_terms` | the human text, never reinterpreted after lock |
| `constraints` | the locked constraint list (below) |
| `evidence_policy` | required kinds, minimum independent sources, whether an adverse finding needs corroboration |
| `deadline` | UTC seconds; the moment delivery is due |
| `consequence_policy` | locked basis points per outcome, plus the bond rules |
| `economic_commitment` | `bond_required`, `amount_required`, and the separate **deposited ledgers** |
| `agreement_fingerprint` | sha256 over the canonical agreement definition |
| `lifecycle_state` | see §8 |
| `adjudication` | the finalized result: per-constraint statuses, materiality, evidence references, digests |
| `settlement` | what was paid, to whom, and when |

## 4. Constraint vocabulary

Six types, deliberately small: `FACTUAL`, `TEMPORAL`, `THRESHOLD`, `QUALITY`, `EXCLUSION`,
`COMPOSITE`.

Each constraint carries `id` (`C1`…), `type`, `requirement` (one sentence, the thing to be judged),
`materiality` (`MATERIAL` or `MINOR`), and `evidence_requirements` (which evidence kinds may support
it).

Constraint results: `SATISFIED`, `VIOLATED`, `INCONCLUSIVE`, `NOT_APPLICABLE`. No scores, no
percentages; a `THRESHOLD` constraint states its own number and the reading must quote it.

## 5. Evidence model

An evidence item is registered by a party before adjudication:

| Field | Rule |
|---|---|
| `evidence_id` | `E1`, `E2`, … |
| `kind` | `WEB_SOURCE` (an https address the contract fetches itself) or `ATTESTATION` (text a party submits) |
| `submitter` | the transaction signer, recorded; only the creator or the counterparty may submit |
| `source` | the address, or the attested text |
| `source_type` | what the party says it is (a claim, never relied on) |
| `origin` | derived in code from the address: the publisher, not the URL |
| `observation_period` | what the evidence is said to cover |
| `related_constraints` | which constraints it speaks to |
| `submitted_at` | the transaction's own time |

Three rules follow from the judges' standards, and they are architecture, not later patches:

- **Independence is not diversity (S35).** Addresses are normalized (case, `www.`, default port,
  fragment, trailing slash, tracking parameters) and de-duplicated, and independence is counted by
  **origin** (registrable domain, with the common code-hosting and package hosts attributed to the
  account that publishes them). Two addresses from one publisher are one voice. Kind diversity and
  independence are two separate rules, checked separately.
- **The record proves what the panel read (S36, S39).** At adjudication every node fetches every
  `WEB_SOURCE` itself. What is stored for each item is agreed by validators at that moment: its
  availability, the observation time, and a digest over the normalized excerpt **each node fetched
  for itself**, compared by prefix (one node may render more than another) with the empty excerpt
  explicitly refused for an item marked readable. A later reading never inherits bytes only the
  leader saw.
- **An uncorroborated adverse finding does not move money (S34).** The contract derives a
  corroboration class in code, per finding, from the items that finding rests on:
  `INDEPENDENT` (at least one `WEB_SOURCE` that was readable at adjudication and whose origin is not
  a party to this agreement), `BILATERAL` (an `ATTESTATION` the other party has acknowledged on
  chain), or `NONE`. When the evidence policy requires corroboration and the class is `NONE`, the
  finding is held at `INCONCLUSIVE` whichever way it pointed -- a held `SATISFIED` cannot release the
  amount any more than a held `VIOLATED` can forfeit the bond -- and the consequence policy's
  recovery rule applies to what the held findings leave unresolved.

  What `INDEPENDENT` claims is exactly this and no more: **the item is not a party's own word.** A
  party attestation registers with an origin of `party:<address>` and can never reach the class. The
  contract cannot know who controls a domain, so a web source a party quietly owns counts as
  independent here; what protects the other side is that the address was registered on chain before
  the round, is visible to both parties, and that `min_independent_origins` counts *origins*, not
  addresses, so a party cannot manufacture corroboration by publishing the same claim at three URLs
  on one host. Where that is not enough for the value at stake, the agreement should require more
  origins, or a kind the counterparty has to acknowledge.

## 6. Adjudication, and what validators must agree on

`adjudicate` runs `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`.

On every node, in the same order:

1. fetch every `WEB_SOURCE` (bounded response, gzip/deflate decoded, 404/410 is `MISSING`, anything
   else unreadable is `UNAVAILABLE`, and neither is ever evidence of a violation);
2. reduce each fetched body to text and keep a bounded excerpt;
3. ask the model, **once per constraint**, with the agreement's terms, that one constraint, the
   evidence policy and every evidence item fenced as untrusted data: what is this constraint's status,
   which evidence supports it, and what passage states it;
4. in code: keep a status only if its quote is found in this node's own copy of the evidence item it
   cites; otherwise the constraint is `INCONCLUSIVE`;
5. in code: derive the corroboration class, the agreement state and the materiality summary.

The validator repeats all of it and compares a fingerprint of every decision-bearing field:

```text
per constraint : status, cited evidence ids, materiality
per evidence   : availability, origin, corroboration class, excerpt digest (prefix-compatible)
derived        : agreement state, whether any material constraint is violated
```

Reasoning text is never compared. Quotes are checked against each node's own copy, not against the
leader's bytes (S39). Every field the payout reads is inside this set (S7): the agreement state is
derived in code from the constraint statuses, which are all compared.

**Errors** are classified `[EXPECTED]`, `[EXTERNAL]`, `[TRANSIENT]`, `[LLM_ERROR]`: the first two must
match exactly, transient agrees with transient, and anything else disagrees so the round rotates.

## 7. From constraint results to the agreement state (code, not the model)

```text
any MATERIAL constraint VIOLATED                      → BREACHED
no MATERIAL violation, some MINOR violation           → PARTIALLY_FULFILLED
every applicable constraint SATISFIED                 → FULFILLED
any MATERIAL constraint INCONCLUSIVE                  → INCONCLUSIVE
corroboration required, class NONE, outcome adverse   → INCONCLUSIVE
```

The model never returns an agreement state; the contract computes it. A state the contract cannot
derive from the agreed constraint statuses cannot be stored.

## 8. Lifecycle

```text
DRAFT ──propose_constraints──► CONSTRAINTS_REVIEW ──lock_agreement──► LOCKED
                                                                        │ fund (payable, when an economic consequence is defined)
                                                                        ▼
                                                                      ACTIVE ──submit_evidence──► ACTIVE
                                                                        │ request_adjudication
                                                                        ▼
                                                              ADJUDICATION_PENDING
                                                                        │ (consensus)
                                                                        ▼
                                                              VERDICT_PROPOSED ──finalize_verdict (after the finality delay)──► FINALIZED
                                                                        │                                                        │ execute_consequence
                                                                        ▼                                                        ▼
                                                                    CANCELLED                                         CONSEQUENCE_EXECUTED
```

Exception paths: `cancel_agreement` (creator, before funding is complete or before any evidence),
`recover` (after the deadline plus the recovery window with no finalized verdict → the locked recovery
rule pays out), and an adjudication that yields `INCONCLUSIVE`, which settles by the recovery rule.

The agreement's **result** (`FULFILLED`, `PARTIALLY_FULFILLED`, `BREACHED`, `INCONCLUSIVE`) is a
separate field from the lifecycle state, shown beside it. The brief lists the results among the
exception states; keeping them apart is what lets one record say "FINALIZED · BREACHED".

## 9. Access control (S43)

| Act | Who |
|---|---|
| `create_agreement`, `propose_constraints`, `lock_agreement`, `cancel_agreement` | the creator (recorded as the signer) |
| `fund_agreement` | the creator (the amount) and the counterparty (the bond), each payable |
| `submit_evidence`, `acknowledge_evidence` | either recorded party, as the signer |
| `request_adjudication` | either recorded party, after the deadline or once required evidence exists |
| `finalize_verdict`, `execute_consequence`, `recover` | anyone: the payees are the recorded parties, so nobody can redirect value |

A recorded account is always the signer of the transaction that records it. An account passed as data
and not signing is refused, in words.

## 10. Custody and settlement (§27, §28 of the brief)

- Funding is payable, and it is the only payable write. The deposited ledger is `gl.message.value`,
  never an argument.
- **A payable write refuses by returning, not by raising.** GenLayer credits the transaction's value
  to the contract before the call runs, and a raise rolls back the refund along with everything else:
  the value would stay in the contract, recorded in no ledger and recoverable by nobody. So every
  funding refusal that has value attached sends it straight back and returns
  `"[REFUNDED] <reason>"` -- a transaction that succeeded, having done nothing but return the money.
  The interface shows that as the refusal it is.

  This is not a hypothetical. An earlier deployment raised on those branches, and 0.02 GEN sent to an
  agreement that was already funded was stranded: the contract's balance exceeded `total_custody` by
  exactly that amount. `tests/direct/test_settlement.py` now pins the shape that fixes it, and three
  mutants cover it -- keeping the value, raising instead of returning, and returning without saying
  it was a refusal.
- A refusal with no value attached still raises, because there is nothing to give back.
- `amount_required` and `bond_required` are the terms; `amount_deposited` and `bond_deposited` are the
  ledgers. Payouts read the ledgers.
- Every payout path: read ledger → require it is above zero → compute the deterministic split from the
  locked policy → zero the ledgers and persist → then emit the transfers.
- Every exit is enumerated: `FULFILLED`, `PARTIALLY_FULFILLED`, `BREACHED`, `INCONCLUSIVE`,
  `CANCELLED`, `RECOVERY`. A second settlement finds a zero ledger and is refused.
- The mirror of every asymmetric rule is tested in the same commit (S42).

## 11. Limits

| | |
|---|---|
| Constraints per agreement | 1 to 12 |
| Evidence items per agreement | up to 24 |
| Adjudication rounds per agreement | up to 4 (a round that reaches no majority records nothing and may be retried) |
| Finality delay before a verdict can be finalized | 300 seconds |
| Recovery window after the deadline | locked per agreement, at least 1 hour |
| Amounts | 0 (no economic consequence) or 0.001 GEN to 1,000,000 GEN |

## 12. What the interface must expose (S40, S45)

Every act above is reachable in the app with the transaction lifecycle visible and the contract's own
refusal sentence on failure; an act the contract would refuse is listed with its reason rather than
offered as a button that fails. The availability rule is a pure function of (agreement, signer, clock,
ledgers), tested without a browser or a chain, and the live proof asserts that same rule against chain
state at every stage.
