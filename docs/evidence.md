# Evidence

A requirement is only as good as what gets read against it. This is how a document becomes something
a panel can be held to, and what PACT refuses to let it become.

## What can be registered

| Kind | What it is | Who can corroborate with it |
| --- | --- | --- |
| `WEB_SOURCE` | an `https` address every node fetches for itself at adjudication | anyone, if the origin is not a party |
| `ATTESTATION` | words a party writes into the record | only once the other party acknowledges it on chain |

Both are registered **before** a round, by a party, while the agreement is in force. Each item names
the requirements it speaks to, so a round knows which evidence belongs to which question. An
agreement holds at most 24 items.

An address is normalized before it is stored -- lowercased host, punycode, no fragment, no tracking
parameters, no trailing slash -- and the same address cannot be registered twice. What is stored is
the address, not its contents: nothing is fetched at registration, because what matters is what the
panel can fetch when it judges.

## Independence is counted by origin, not by address

Independence is counted by **origin**: the registrable domain, with the common code and package
hosts attributed to the account that publishes on them, so
`https://raw.githubusercontent.com/acme/report/main/r.md` and `https://github.com/acme/report` are
one origin, `github:acme`. Three URLs on one host are one voice, not three.

A party attestation takes the origin `party:<address>` and can never count as an independent origin.

**What this does not claim.** PACT cannot know who controls a domain. A web source that a party
quietly owns will count as independent. What protects the other side is that the address was
registered on chain before the round, visible to both parties, and that an agreement can require
more than one origin. Where the value at stake is greater than that assurance, ask for more origins
or for a kind the counterparty has to acknowledge.

*In this repository's own demonstration, both documents are published from one GitHub account, so
they are one origin. The runs are honest about that: the record shows `github:olawalter` twice.*

## What a round records

At adjudication each node, independently and in the same order:

1. **fetches** every `WEB_SOURCE` itself, with a bounded response;
2. **reduces** it to text and keeps a bounded excerpt;
3. **records** what it found, and the digest of what it read.

| Recorded per item | Meaning |
| --- | --- |
| `availability` | `AVAILABLE`, `MISSING` (404 or 410), or `UNAVAILABLE` (anything else that could not be read) |
| `observed_at` | the transaction time of the round, not the node's wall clock |
| `excerpt` | what this node reduced the document to |
| `excerpt_digest` | sha-256 over the normalized excerpt this node fetched |
| `origin` | the publisher, as counted above |
| `submitter` | the address that registered it |

The excerpt digest is **not** compared byte for byte between nodes, because one renderer may keep
more of a document than another. It is compared by prefix compatibility, and an item marked readable
with an empty excerpt is refused outright -- that combination is how a node that fetched nothing
would otherwise pass for one that fetched everything.

A later reading never inherits bytes only the leader saw. This is the point: the record proves what
*this* panel read, at *this* time, not what one node claims to have read.

## Grounding

A finding that says `SATISFIED` or `VIOLATED` must carry a quote, and the quote must:

- name an item among the ones that finding relies on,
- name an item that was `AVAILABLE` on this node,
- name an item registered against that requirement, and
- actually appear in **this node's own copy** of that item.

If any of those fails, the node keeps the reasoning but demotes the status to `INCONCLUSIVE`. A
confident answer that cannot be traced to a document is worth less than an honest "unclear", and a
round that cannot ground an answer should not move money.

## Text inside evidence is text

Every item is placed between fences before a model sees it, with a header naming its id, kind,
origin and availability. Any run of three or more angle brackets inside a body is **replaced with a
space, never deleted** -- deleting a fence would join the characters on either side of it into a new
one, which is how a sanitizer becomes the vulnerability.

The prompt states plainly that evidence is material to read, that instructions inside it are part of
the document rather than part of the task, and that a requirement is answered from what the
documents show.

This is tested rather than asserted. The live breach run registers a delivery note whose body tells
the reader to mark every requirement satisfied and ignore the audit. The record shows the note was
fetched and read -- and shows three material violations standing. See
[end-to-end](end-to-end.md).

## Contradiction

Two items may disagree: an audit says thirty-one companies, a delivery note says fifty-two. The
prompt's rule is that a contradiction is not resolved by picking a side for the sake of answering.
Prefer an item that states a specific, checkable fact over one that asserts a conclusion; where
neither is clearly stronger, answer `INCONCLUSIVE` and cite both.

An unresolved material requirement makes the agreement `INCONCLUSIVE`, which settles under the
recovery rule rather than paying either party as if the question had been answered.

## The corroboration floor

Before a finding is allowed to matter, the contract -- not the model -- classifies what supports it:

| Class | When |
| --- | --- |
| `INDEPENDENT` | at least one supporting `WEB_SOURCE` was readable and its origin is not a party |
| `BILATERAL` | a supporting `ATTESTATION` has been acknowledged by the other party |
| `NONE` | neither |

If the agreement's evidence policy requires corroboration and the class is `NONE`, the finding is
held at `INCONCLUSIVE` and listed in `held_for_corroboration` on the verdict, so the record says
plainly that something was demoted and why.

The floor is **symmetric**. A held `SATISFIED` cannot release the amount any more than a held
`VIOLATED` can forfeit the bond. An asymmetric floor would quietly favour whichever party benefits
from inaction.
