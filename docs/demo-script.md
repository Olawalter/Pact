# Demo video script

Three minutes. Everything on screen is the deployed contract on StudioNet; nothing is a mockup.

**Before recording**

- Wallet on StudioNet (chain `61999`), funded.
- `NEXT_PUBLIC_PACT_CONTRACT_ADDRESS` set to `0x36d759366baF6d9A531dAD4Fe134795A3c812989`, app running.
- Two browser tabs: the app, and the explorer at the contract address.
- One agreement already settled from the live run, open at its detail page, so the finished record
  can be shown without waiting for consensus on camera.

---

## 0:00 -- The problem, in one sentence

> *Landing page.*

"Two parties agree on something in words. Fifty verified companies, three sources each, no
fabricated citations, delivered before Tuesday. A smart contract can hold the money, but it cannot
read the report. So today either a person decides, or the side that wrote the cheque decides."

## 0:20 -- What PACT does

> *Scroll the landing page to the three-step explanation.*

"PACT turns those words into requirements that can be answered one at a time, asks a panel of
GenLayer validators to answer each one against evidence they fetch themselves, and then works out
what the agreement's state is in ordinary code. The model reads. The contract decides."

## 0:35 -- Creating one

> *New agreement, step through the five steps briskly.*

"Terms in plain language. Then the requirements -- and PACT can propose a first draft of them from
the terms, which is advisory: what binds is what the creator locks."

> *Show the materiality toggle.*

"Material or minor. A material violation breaches the agreement; a minor one makes it partial."

> *Show the consequence step.*

"The shares are locked here, before anything is judged. Fulfilled releases the amount, a breach
forfeits half the bond. No model output ever reaches this arithmetic except one word: the state."

> *Lock it. Show the wallet signature and the write lifecycle panel.*

"Every write is signed in the wallet, and the app follows it: submitted, leader proposed, validating,
decided, finalized. It never claims a step it has not seen."

## 1:15 -- Evidence

> *Open the settled agreement. Evidence panel.*

"Evidence is registered before a round, so both sides can see what will be read. At adjudication
every validator fetches every source itself and records what it found -- available or not, and a
digest of the text it read. Not the leader's copy. Its own."

## 1:35 -- The verdict

> *The requirements table on the detail page.*

"Five requirements, five answers, each with a quote the validator found in its own copy of the
document. If a quote can't be grounded there, the answer is demoted to inconclusive. A confident
answer no one can trace is worth less than an honest 'unclear'."

> *Point at the corroboration column.*

"And a finding resting only on one party's word is held, in either direction. A held 'satisfied'
can't release the money any more than a held 'violated' can take the bond."

## 2:00 -- The interesting one

> *Open the breached agreement from the live run.*

"This is the run that matters. The buyer registered an independent audit. The deliverer registered a
delivery note -- and the note's text tells whoever reads it to mark every requirement satisfied and
ignore the audit."

> *Open the note's source in the other tab, show the instruction text. Return to the record.*

"The panel read it. It's in the record, marked available, with its digest. And the verdict is
breached: thirty-one companies, fourteen under-sourced, two fabricated citations. The note asked and
got nothing."

## 2:25 -- The money

> *Scroll to the consequence panel.*

"Breached, so the amount goes back to the buyer and half the bond is forfeit. That's basis-point
arithmetic over one word, and it's a separate transaction after a five-minute delay, so a verdict
can be read before it becomes irreversible."

> *Switch to the explorer, show the settlement transaction.*

"On chain. Real GEN, real validators."

## 2:45 -- What it is underneath

> *Verify panel on the detail page, or the repository.*

"The deployed bytes are the file in the repository -- verified byte for byte. A hundred and
sixty-three tests run the contract in Direct Mode, including the validator replayed against a forged
leader. Eighty-seven mutants. And a live suite that does exactly what you just watched, and asserts
it."

"PACT. An agreement written in words, adjudicated by GenLayer, settled in code."

---

**Do not say on camera**

- "Verified" about anything the video does not show.
- That validators always agree. The breach run was agreed three to two, and the dissent is in the
  receipts. If it comes up, say that: a majority decides, and disagreement is visible.
- That an independent origin means a party cannot control the domain. It means the item is not the
  party's own word.
