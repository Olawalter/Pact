# End to end, on StudioNet

Everything below happened on chain. It is generated from `docs/live-e2e.json`, which the live
suite in `tests/integration/` writes while it runs, so every hash here is a transaction that
was sent and every state is one the contract returned when asked afterwards.

| | |
| --- | --- |
| Network | GenLayer StudioNet, chain `61999` |
| Contract | [`0xdba02A566960639FF86C6dBe81cb33D511254Ba2`](https://explorer-studio.genlayer.com/address/0xdba02A566960639FF86C6dBe81cb33D511254Ba2) |
| Evidence pinned at | commit [`bc3aa92b76d4`](https://github.com/Olawalter/Pact/tree/bc3aa92b76d4bcae00dc0c1b3f5ec570a1900a1a/demo) |
| Run | 2026-09-29T05:33:10Z to 2026-09-29T05:53:04Z |

The two parties are throwaway accounts funded for the run, so nothing here depends on a
wallet only the author holds:

| Party | Address |
| --- | --- |
| creator | `0xaE4Fa54088bf779f7fD4c3Df7D40Ebd0961a463f` |
| agent | `0xC948ea45c45cB8D363180238f8EDbd1Ff49b7034` |

## The agreement

> The research agent must deliver a report containing at least 50 verified companies before the deadline. Each company must carry at least three qualifying sources, every required field must be present, and no fabricated citation may appear in the report.

Locked as five requirements, four of them material:

| | Type | Requirement | Materiality |
| --- | --- | --- | --- |
| `C1` | Threshold | The report contains at least 50 companies. | Material |
| `C2` | Factual | Every required field is present for each company. | Material |
| `C3` | Threshold | Each company carries at least three qualifying sources. | Material |
| `C4` | Exclusion | No fabricated citation appears in the report. | Material |
| `C5` | Temporal | The report was delivered before 2026-09-30T18:00:00Z. | Minor |

The buyer holds 0.02 GEN against delivery; the deliverer posts a 0.01 GEN bond. A fulfilled agreement releases 100% of the amount, a partial one 50%, a breach 0%, and a breach forfeits 50% of the bond. These shares were locked before any evidence existed.

## The delivery was kept

The deliverer registered the report. The buyer registered an independent index of the same companies. Neither party told the panel what to conclude.

| Step | Transaction | Consensus |
| --- | --- | --- |
| create_agreement | [`0x99cffb0f94c4...`](https://explorer-studio.genlayer.com/tx/0x99cffb0f94c4598605d8523b168f07f52c8d0295b66457b18d3a50bcaef07dc7) | 5 agree |
| lock_agreement | [`0x2c04ca5650c9...`](https://explorer-studio.genlayer.com/tx/0x2c04ca5650c98e9b8dacd82d520d60f19b704231500e97ca8bc9c53e300b5dd1) | 5 agree |
| fund the amount | [`0xfde5d409e576...`](https://explorer-studio.genlayer.com/tx/0xfde5d409e57603922338f318b81e8c36c454ac33068ed07c30fd0e9062b99092) | 3 agree, 2 idle |
| post the bond | [`0xd41ac943851a...`](https://explorer-studio.genlayer.com/tx/0xd41ac943851ac141c72502bd43b0acc8e13d29cd35a2e1f78ecbcb2343d931ba) | 3 agree, 2 idle |
| evidence: the report | [`0x5179b08c240d...`](https://explorer-studio.genlayer.com/tx/0x5179b08c240dc74972869b55289381efd0d8c07e393918fac11b8eaa4e435416) | 5 agree |
| evidence: the index | [`0x77c86a559c68...`](https://explorer-studio.genlayer.com/tx/0x77c86a559c688303fed9df6c85ec9158735c51392591de6c7eef352e61143ca2) | 4 agree, 1 idle |
| request_adjudication | [`0xe6a99c469c29...`](https://explorer-studio.genlayer.com/tx/0xe6a99c469c29f12ab1970a82ce97211e2c93d9779c635ee3b571a5ce4ad8cea7) | 3 agree, 2 idle |
| finalize_verdict | [`0x9c79439a4bfb...`](https://explorer-studio.genlayer.com/tx/0x9c79439a4bfba5e111786cf2a6f16eb5ed861b679a49699890473460b872ea82) | 4 agree, 1 idle |
| execute_consequence | [`0x616cb9ee3eb2...`](https://explorer-studio.genlayer.com/tx/0x616cb9ee3eb2882b2c536720b0c3ec79d83b4bc213be9d25ea8ae1cdfd64b235) | 3 agree, 2 idle |

**FULFILLED.** 5 of 5 applicable constraint(s) satisfied; 0 material violation(s), 0 minor, 0 material unresolved

| | Answered | After the corroboration floor | Support | Quoted from the panel's own copy |
| --- | --- | --- | --- | --- |
| `C1` | SATISFIED | SATISFIED | INDEPENDENT | Companies included: **52**. Every company carries the required fields: legal name, jurisdi... |
| `C2` | SATISFIED | SATISFIED | INDEPENDENT | Every company carries the required fields: legal name, jurisdiction, incorporation year, s... |
| `C3` | SATISFIED | SATISFIED | INDEPENDENT | Sources: 164 citations in total, at least three for every company. Each citation names the... |
| `C4` | SATISFIED | SATISFIED | INDEPENDENT | No entry in this report cites a document that could not be retrieved at the address given. |
| `C5` | SATISFIED | SATISFIED | INDEPENDENT | Delivered: **2026-09-24T09:00:00Z**. |

What each node fetched for itself:

| | Source | Availability | Origin | Digest of the excerpt read |
| --- | --- | --- | --- | --- |
| `E1` | [delivery-report.md](https://raw.githubusercontent.com/Olawalter/Pact/bc3aa92b76d4bcae00dc0c1b3f5ec570a1900a1a/demo/delivery-report.md) | AVAILABLE | `github:olawalter` | `18366f1689d75df3...` |
| `E2` | [independent-index.md](https://raw.githubusercontent.com/Olawalter/Pact/bc3aa92b76d4bcae00dc0c1b3f5ec570a1900a1a/demo/independent-index.md) | AVAILABLE | `github:olawalter` | `39734bb24cfe265f...` |

Settled: 0 GEN to the buyer, 0.03 GEN to the deliverer. The agreement holds 0 GEN and 0 GEN afterwards.

## The delivery was not kept, and the evidence argued back

The buyer registered a third-party audit. The deliverer registered a delivery note whose body instructs the reader to mark every requirement satisfied and to ignore the audit. Both were read.

| Step | Transaction | Consensus |
| --- | --- | --- |
| create_agreement | [`0xef1369803b25...`](https://explorer-studio.genlayer.com/tx/0xef1369803b25fe64dcbda10b567afddf89baa8bdf5335a92b09055b455866566) | 4 agree, 1 idle |
| lock_agreement | [`0xa3717e1c4c87...`](https://explorer-studio.genlayer.com/tx/0xa3717e1c4c8778e1944d3c3fa1e84c84f11dc2640a0073af3035f3acd6772969) | 3 agree, 2 idle |
| fund the amount | [`0xc4843ab30ddf...`](https://explorer-studio.genlayer.com/tx/0xc4843ab30ddf616ea4721cc0810013778e81a89f4c8db09dcfea370f6eac3abb) | 3 agree, 2 idle |
| post the bond | [`0x59b4d216401b...`](https://explorer-studio.genlayer.com/tx/0x59b4d216401b63703ed493b5b1865278566419e1a61786f8f7348f67e1f70bd9) | 4 agree, 1 idle |
| evidence: the audit | [`0x27b30029cc7d...`](https://explorer-studio.genlayer.com/tx/0x27b30029cc7d1f4b3ef593cfcfb5486f2f3f5ddddd7c313da3d15cfd2e94e701) | 4 agree, 1 idle |
| evidence: a note that instructs the panel | [`0x6da7e4956d06...`](https://explorer-studio.genlayer.com/tx/0x6da7e4956d061c41145900336c1bde3b05443f10f860d8a5d39007e1fd433afa) | 4 agree, 1 idle |
| request_adjudication | [`0x3f107a6a368b...`](https://explorer-studio.genlayer.com/tx/0x3f107a6a368b3a8ff7a8b07f3a112b60d28e77c3fd30dbe2ea81c18c7d483c7f) | 3 agree, 2 disagree |
| finalize_verdict | [`0xcfb1e687483e...`](https://explorer-studio.genlayer.com/tx/0xcfb1e687483eb94c640db513750951ab106a1370c95b89a4d45a7e16a338fb62) | 3 agree, 2 idle |
| execute_consequence | [`0x22f30d4ecc5f...`](https://explorer-studio.genlayer.com/tx/0x22f30d4ecc5fbe2e42a3870eb6724aa1252382b28005c5a4344936a2c97b5bcb) | 5 agree |

**BREACHED.** 1 of 5 applicable constraint(s) satisfied; 3 material violation(s), 0 minor, 1 material unresolved

| | Answered | After the corroboration floor | Support | Quoted from the panel's own copy |
| --- | --- | --- | --- | --- |
| `C1` | VIOLATED | VIOLATED | INDEPENDENT | Companies present in the submission at the deadline: **31**, not the 50 the agreement requ... |
| `C2` | INCONCLUSIVE | INCONCLUSIVE | INDEPENDENT | -- |
| `C3` | VIOLATED | VIOLATED | INDEPENDENT | Of the 31, **fourteen** carry fewer than three citations. |
| `C4` | VIOLATED | VIOLATED | INDEPENDENT | Two citations in the submission name documents that the publishers do not carry, at the ad... |
| `C5` | SATISFIED | SATISFIED | INDEPENDENT | The submission was received on 2026-09-24T09:00:00Z, before the deadline. |

What each node fetched for itself:

| | Source | Availability | Origin | Digest of the excerpt read |
| --- | --- | --- | --- | --- |
| `E1` | [audit-note.md](https://raw.githubusercontent.com/Olawalter/Pact/bc3aa92b76d4bcae00dc0c1b3f5ec570a1900a1a/demo/audit-note.md) | AVAILABLE | `github:olawalter` | `5bf4ac088d854b0b...` |
| `E2` | [delivery-note-with-instructions.md](https://raw.githubusercontent.com/Olawalter/Pact/bc3aa92b76d4bcae00dc0c1b3f5ec570a1900a1a/demo/delivery-note-with-instructions.md) | AVAILABLE | `github:olawalter` | `ad86f5d8c7260b60...` |

Settled: 0.025 GEN to the buyer, 0.005 GEN to the deliverer. The agreement holds 0 GEN and 0 GEN afterwards.

## The same thing, through the interface

Everything above was sent by a script, which proves the contract and not the pages. This one
was driven by clicking: an agreement written, locked, funded from both sides, evidence
registered, adjudicated, finalized and settled, with every transaction signed by a wallet the
app discovered through EIP-6963. The table is read back from the chain by
`scripts/collect_ui_run.py`, which decodes each method from the transaction's own calldata
rather than trusting what the browser said it did.

| Called | Transaction | Consensus | Votes |
| --- | --- | --- | --- |
| `create_agreement` | [`0x7dccbf9af7d3...`](https://explorer-studio.genlayer.com/tx/0x7dccbf9af7d301418e0ad97d0def817d7b1706e427e5b7126741a35c95f7553e) | MAJORITY_AGREE | 3 agree, 2 idle |
| `propose_constraints` | [`0xce6f9cf9dfe4...`](https://explorer-studio.genlayer.com/tx/0xce6f9cf9dfe40e379e12cd7d263d0e0962ddb3f86280b13c126f4098185cb866) | MAJORITY_DISAGREE | 1 agree, 3 disagree, 1 idle |
| `propose_constraints` | [`0x9934d112970f...`](https://explorer-studio.genlayer.com/tx/0x9934d112970fb158b4ef30dcd5f2a01fab4779214e927dd3e39438f5979ab447) | MAJORITY_DISAGREE | 3 disagree, 2 idle |
| `lock_agreement` | [`0xcac28857e02b...`](https://explorer-studio.genlayer.com/tx/0xcac28857e02ba763ff30b786ac5bb65b3dffe91a59adf53f8ebf7586e7d5b255) | MAJORITY_AGREE | 5 agree |
| `fund_agreement` | [`0x1ff9f6e3da8a...`](https://explorer-studio.genlayer.com/tx/0x1ff9f6e3da8a4780882e492b8420fa1d0193d5c5f2610ccd2127aa312fdae634) | MAJORITY_AGREE | 3 agree, 2 idle |
| `fund_agreement` | [`0x4909ae1a0414...`](https://explorer-studio.genlayer.com/tx/0x4909ae1a04143498695a89828014c4c0fb58c249808ea172a16885181bec7869) | MAJORITY_AGREE | 3 agree, 2 idle |
| `submit_evidence` | [`0x0205619aac2f...`](https://explorer-studio.genlayer.com/tx/0x0205619aac2fc1481bf25dff38fa12470b82ebcff90dbd924f9a58d7001c9ac8) | MAJORITY_AGREE | 4 agree, 1 idle |
| `request_adjudication` | [`0x98d330bb6258...`](https://explorer-studio.genlayer.com/tx/0x98d330bb62580d1ccc6e1e85a28f94e3c5436a396a541cd9e6ef0b35d605bafe) | MAJORITY_AGREE | 3 agree, 1 disagree, 1 idle |
| `finalize_verdict` | [`0xcf065832e2ef...`](https://explorer-studio.genlayer.com/tx/0xcf065832e2efed7ddb20884220b7aa94ea2cd361d44636f100b6652549501823) | MAJORITY_AGREE | 3 agree, 2 idle |
| `execute_consequence` | [`0xa38ba6114527...`](https://explorer-studio.genlayer.com/tx/0xa38ba61145270df27997721bf3de5162221bff30a7745fec38abbb1a20b885ac) | MAJORITY_AGREE | 4 agree, 1 idle |

2 of those reached no majority, and they are in the table because they
happened. Both were the advisory constraint proposal, which is a comparative round: the
validators draft the requirements themselves and compare. Nothing was written, the
interface said so in those words, and the requirements were then written by hand, which
is the path that binds in any case.

Reloading the page afterwards, with no wallet connected at all, still shows the finished
record: the interface holds nothing that the chain does not.

## Nobody ever asked for a verdict

A third scenario, run separately by `scripts/live_recovery.py`: an agreement is funded and
then nothing happens. No evidence, no round. The deadline passes, the recovery window
passes, and the rule locked at the start ends it. This is the path that makes it impossible
for GEN to sit in the contract because a question was never answered.

| Step | Transaction | Consensus |
| --- | --- | --- |
| create_agreement | [`0x84e0495a7a9b...`](https://explorer-studio.genlayer.com/tx/0x84e0495a7a9b10da147cbf459467fed4c5393937d0ea0c1a18b833cdaf6bee5e) | 5 agree |
| lock_agreement | [`0x18fc5b22678d...`](https://explorer-studio.genlayer.com/tx/0x18fc5b22678d9278b381ee5d29d591e6994fa3d902f37654b56c125c72ba2a10) | 5 agree |
| fund (amount) | [`0xb0a86ec5c801...`](https://explorer-studio.genlayer.com/tx/0xb0a86ec5c801cad605b78c398826437cb6aa05d6406529235bb83711801596fb) | 3 agree, 2 idle |
| fund (bond) | [`0x4370d7ee2ed4...`](https://explorer-studio.genlayer.com/tx/0x4370d7ee2ed4a4d545747dc348d0b9e35963b29ec509f1ee8a59a7fab5af9840) | 5 agree |
| recover before the window -- refused | [`0xc89ef4476cfc...`](https://explorer-studio.genlayer.com/tx/0xc89ef4476cfcbac3104130a6bfd22e6e0168ceca694aed3c8e825bc872504e0e) | 3 agree, 2 idle |

Sent too early, and refused: recovery is possible at 1790665196; the transaction time is 1790660982

## What the contract refused

Each of these is a real transaction. Validators agreed about the refusal, which is why it
appears on chain with a reason rather than as a failure somewhere off it.

| Sent | Refused with | |
| --- | --- | --- |
| lock a second time [`0x4f97a28c284e...`](https://explorer-studio.genlayer.com/tx/0x4f97a28c284e957fa7460f2e39c645a22aa94a91c612598a56ca6e612a6fa64a) | the agreement is already locked; it is LOCKED | the transaction raised |
| lock by the counterparty [`0x05b0ca572a89...`](https://explorer-studio.genlayer.com/tx/0x05b0ca572a899ed1e6246a318f6916eeaec966a79072a4f1444f35f61457757c) | only the creator can lock the agreement | the transaction raised |
| evidence before funding [`0xd5cbde67c7b2...`](https://explorer-studio.genlayer.com/tx/0xd5cbde67c7b2fcc990ef3815db34b2381ddf3c1b7e8f1de1e15c82a79ba9081d) | evidence can be registered while the agreement is ACTIVE; it is LOCKED | the transaction raised |
| adjudication before funding [`0x39301fb52a64...`](https://explorer-studio.genlayer.com/tx/0x39301fb52a649fdc18cc5ddfae635f7e8fcadd97413d0a51291251a97124acbb) | adjudication needs an agreement in force; it is LOCKED | the transaction raised |
| fund an agreement already in force [`0xb42b8f53bb9a...`](https://explorer-studio.genlayer.com/tx/0xb42b8f53bb9a6d10ed627ed1286be0538b4853a0c78b2b4bafc7faef069c146b) | funding is possible while the agreement is LOCKED; it is ACTIVE | the value was sent back |
| cancel by the counterparty [`0xd46216f33b6b...`](https://explorer-studio.genlayer.com/tx/0xd46216f33b6bb5c722737f2fe52c626547ab8f71a676b477df605bd65ed85b44) | only the creator can cancel the agreement | the transaction raised |
| the same page registered twice [`0x8aed31dffe7b...`](https://explorer-studio.genlayer.com/tx/0x8aed31dffe7b7cd718479cb4934470624a93b85bcbc03582473b3130012ff6af) | that address is already registered as E1 | the transaction raised |
| finalize before the delay [`0x6e4201185cdb...`](https://explorer-studio.genlayer.com/tx/0x6e4201185cdb049060cfb4b85513d4e6bf8be26eca07a24caf4af2e96c2ac791) | the verdict can be finalized at 1790660590; the transaction time is 1790660403 | the transaction raised |
| settle a second time [`0x41b0421b3f41...`](https://explorer-studio.genlayer.com/tx/0x41b0421b3f4193dca843bc78b5159a8429927d8a90a36e2e0fdf00cbc7411ddb) | the consequence follows a finalized verdict; the agreement is CONSEQUENCE_EXECUTED | the transaction raised |

The funding refusal is the odd one out, and deliberately so. GenLayer credits a payable
transaction's value to the contract before the call runs, so a refusal that raises would
roll back its own refund and keep the GEN. That one refuses by returning, having sent the
value back, which is why its transaction succeeded.

## Custody afterwards

The contract reports 0 GEN held in total, and the agreements themselves account for 0 GEN. Nothing was left behind by a settlement, and nothing was paid twice.

## Reproducing it

```bash
SKIP_INTEGRATION=0 PACT_DEMO_COMMIT=bc3aa92b76d4bcae00dc0c1b3f5ec570a1900a1a \
  PACT_CONTRACT_ADDRESS=0xdba02A566960639FF86C6dBe81cb33D511254Ba2 python -m pytest tests/integration -v -s
```

It takes about forty minutes and costs real consensus rounds on a shared network. To re-check
the assertions against this record instead, without sending anything:

```bash
PACT_REPLAY=1 SKIP_INTEGRATION=0 python -m pytest tests/integration -q
```
