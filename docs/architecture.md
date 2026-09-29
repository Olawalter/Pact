# Architecture

PACT has four participants. Getting the boundary between them right is the whole design; almost
every way this could go wrong is a job given to the wrong one.

```
  a person                the contract              the GenLayer panel            the model
  --------                ------------              ------------------            ---------
  writes the terms  -->   stores them, unchanged
  names requirements -->  checks and locks them
  registers evidence -->  records the address,
                          the kind, the submitter
  asks for a round   -->  starts one round     -->  every node fetches
                                                    every source itself
                                                                             -->  reads one item,
                                                                                  answers one
                                                                                  requirement,
                                                                                  quotes the item
                                                    each node derives the
                                                    same result and compares
                                                    a fingerprint of it
                          re-derives the state <--  the agreed result
                          from the agreed
                          statuses, in code
                          waits 5 minutes
                          pays by basis points
```

## What each one owns

### The contract owns everything a mistake would be expensive in

Access control, custody, the finality delay, the corroboration floor, the caps, and the arithmetic
from a state name to a payment in GEN. None of it consults a model. A model result enters the
contract as one of four status words per requirement, and nothing else it returns can move value.

The contract also owns the *derivation*: given the agreed statuses, it computes `FULFILLED`,
`PARTIALLY_FULFILLED`, `BREACHED` or `INCONCLUSIVE` itself. This is deliberate. If the model named
the state, then a model that got one requirement subtly wrong could name a state that does not
follow from its own answers, and nobody reading the record could tell the difference.

### Consensus owns whether the agreement was kept

`request_adjudication` runs `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`.

The leader fetches the evidence, asks the model once per requirement, assembles a result and returns
it. Every validator does the same work independently -- its own fetches, its own model calls -- and
then compares. It does not check that the leader's JSON is well shaped and wave it through; it
produces its own answer and compares the fields a consequence depends on.

The comparison is deliberately narrow **and** deliberately complete:

| Compared | Not compared |
| --- | --- |
| each requirement's status and effective status | the reasoning text |
| each requirement's corroboration class | which item a quote was taken from |
| the list held for corroboration | the set of items cited in support |
| the derived agreement state and its materiality | the quote itself |
| each evidence item's id, availability and origin | the excerpt, which differs by renderer |

Everything on the left changes what happens to the money or what the record asserts about a party.
Everything on the right is a different way of saying the same thing, and putting it in the
comparison only produces disagreement without producing safety -- we watched a round fail that way
before narrowing it. A quote is still required and still checked, but by each node against *its own*
copy, which is a stronger test than agreeing with the leader's citation.

### The model owns reading

One prompt per requirement, with all the evidence fenced, asking for a status, a quote, and the
items relied on. It is never asked what the agreement's state is, never asked what should be paid,
and never trusted about whether a document exists -- availability is decided by the fetch, in code.

### The interface owns none of the decisions

`frontend/` is a Next.js app with no server of its own and no database. It reads the contract and
composes transactions the user signs in their wallet. Every rule it enforces in a form is a mirror
of a rule the contract enforces, so a mistake is caught while typing instead of costing a
transaction -- and the contract still checks it, because a mirror is a convenience, not a guarantee.

## Why not an oracle, or a backend

Ask of any step: *could an oracle or plain code do this?* Where the answer is yes, PACT does it in
plain code -- the deadlines, the splits, the caps, the custody. Where the answer is no, the step is
exactly the kind GenLayer exists for:

- *"Every required field is present for each company"* -- needs a reader, and a reader that one
  party hired is that party's opinion.
- *"No fabricated citation appears"* -- needs judgement about what a document says versus what it
  cites, and a single judgement is unfalsifiable.
- *"Does this audit contradict this delivery note?"* -- needs the contradiction to be recognised
  rather than resolved by whichever document was read last.

A backend could compute all three. It could not make them *binding*, because the counterparty has no
reason to accept a number produced by a machine the other side controls. The value of putting it on
GenLayer is that several independent nodes fetched the evidence, answered separately, and agreed
before a single GEN moved -- and that the disagreement, when it happens, is visible.

## One round, and what happens when it fails

A round that reaches no majority writes nothing. The agreement stays in force, the evidence stays
registered, and a party can ask again after ten minutes, up to four rounds. This is normal and is
shown as such in the interface: a failed round is not a verdict of `INCONCLUSIVE`, it is an absence.

If no round ever succeeds, the deadline and the recovery window pass and `recover` ends the
agreement under the rule locked at the start. There is no path where GEN stays in the contract
because a model never made up its mind.

## Storage

Agreements live in a `TreeMap[str, Agreement]`; each `Agreement` is an `@allow_storage` dataclass
holding its own `DynArray` lists of evidence ids, verdict ids and history rows. Sub-objects that
vary in shape -- the locked definition, an evidence row, a verdict record -- are stored as canonical
JSON strings with sorted keys, so the same content always hashes the same way.

Money is `u256` in atto-GEN throughout. No float touches a balance.
