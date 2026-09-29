# Security

What PACT defends against, how, and -- as important -- what it does not claim.

## The money

| Property | How |
| --- | --- |
| Only the recorded parties are ever paid | every payment goes to `creator` or `counterparty` as recorded at creation, whoever sent the transaction |
| A balance is zeroed before it is sent | the ledger is written and persisted first, then GEN leaves through one function; a re-entrant call finds nothing to pay |
| Nothing can be settled twice | settlement requires a finalized verdict and a non-empty balance, and clears both |
| Nothing can be stranded | if no round ever succeeds, `recover` ends the agreement under the rule locked at the start, once the deadline and the recovery window have passed |
| A refused payable write returns the value | GenLayer credits a payable transaction's value before the call runs, and a raise would roll back the refund with everything else. Funding -- the only payable write -- refuses by sending the value back and returning `[REFUNDED] <reason>`, never by raising. An earlier deployment raised, and stranded 0.02 GEN |
| No float touches a balance | `u256` atto-GEN throughout; splits are basis points, remainder to the creator |

## The judgement

| Attack | Defence |
| --- | --- |
| A leader invents a verdict | validators redo the work -- their own fetches, their own model calls -- and compare the fields a consequence depends on. A leader-only answer never reaches storage |
| A leader forges a quote, a digest or an availability | each validator checks the quote against **its own** copy of the document, and re-derives the item's availability from its own fetch |
| A model is talked into an answer by the document it is reading | evidence is fenced, fence-like runs inside a body are replaced rather than removed, and the prompt states that instructions inside evidence are part of the document. Demonstrated live: see [end-to-end](end-to-end.md) |
| A party manufactures corroboration | independence is counted by origin, so several addresses on one host are one voice; a party's own attestation can never be independent |
| A party's word alone moves money | a decisive finding with no independent or acknowledged support is held at `INCONCLUSIVE`, in either direction |
| A missing document is used as proof of breach | an unreadable source is recorded as unavailable and is never evidence of a violation |
| A verdict is rushed into settlement | a verdict stands for five minutes before it can be finalized, and settlement is a separate transaction |
| A round is spammed until one goes the right way | at most four rounds, at least ten minutes apart, each one recorded |
| The contract is asked to trust the sender's claim about who they are | every party is `gl.message.sender_address`; no method takes an address that means "me" |

## What is not claimed

- **PACT does not know who controls a domain.** A web source a party quietly owns counts as an
  independent origin. The mitigation is that the address is on chain before the round and an
  agreement can require more origins -- not that the contract can tell.
- **PACT does not make a model correct.** It makes a *single* model's answer insufficient. If a
  majority of a panel reads a document the same wrong way, they agree and the wrong answer is
  recorded. What the record then shows is exactly what they read and what they quoted, which is what
  an appeal would need.
- **Consensus is not unanimity.** A verdict is recorded on a majority. The live breach run was
  agreed three to two, and the two who disagreed had reached the same state by a different route --
  the disagreement is in the receipts, not hidden.
- **The advisory constraint proposal is a comparative round, and can fail.** Asking PACT to draft the
  requirements from the words runs `prompt_comparative`: every validator drafts them itself and the
  drafts are compared. For the demonstration agreement the panel agreed; for a terser one, written
  ad hoc, it reached no majority twice. Nothing is recorded when that happens, the interface says so,
  and the requirements can be written by hand -- which is the path that binds in any case, since the
  proposal is advisory.
- **A round that fails is not an answer.** No majority means nothing was written. The interface says
  so rather than showing a state.
- **The deadline is the transaction's time, not the world's.** Every window is measured against
  `gl.message_raw["datetime"]`. A chain whose clock is wrong makes PACT's deadlines wrong.
- **Nothing here has been audited by anyone else.** It has 165 direct tests, 90 mutants, a live
  suite, and two adversarial contract reviews by a fresh reader; that is not the same as an audit.

## What a party should check before locking

1. **The requirements, one at a time.** Each should be answerable on its own from a document. "The
   work was good" is not a requirement PACT can help with; "at least three qualifying sources per
   company" is.
2. **Materiality.** A `MATERIAL` violation breaches the agreement; a `MINOR` one makes it partial.
3. **The evidence policy.** Whether corroboration is required, and how many independent origins.
4. **The shares.** They are locked before anything is judged, and the contract will not release more
   for a partial outcome than for a fulfilled one, nor more for a breach than for a partial one.
5. **The recovery rule.** It decides what happens if the question is never answered.

## Reporting

This is a hackathon build on a test network holding test GEN. If you find something wrong with it,
open an issue on the repository with the transaction hash or the test that shows it.
