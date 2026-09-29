# Deployment

## What is deployed

| | |
| --- | --- |
| Network | GenLayer StudioNet, chain `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Contract | `0xdba02A566960639FF86C6dBe81cb33D511254Ba2` |
| Explorer | [address](https://explorer-studio.genlayer.com/address/0xdba02A566960639FF86C6dBe81cb33D511254Ba2) |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |

The full record -- deploy transaction, source commit, source digest, on-chain digest, and the method
list read back from the chain -- is in [`deployment.json`](deployment.json), written by the deploy
script rather than by hand.

## Deploying

```bash
python scripts/deploy.py
```

The script deploys the contract **from the committed source**, waits for the transaction to finalize,
then reads the deployed code back off the chain and compares it byte for byte with the file it sent.
It writes `docs/deployment.json` only if they match, and records `byte_identical` either way.

Two things it handles that are easy to get wrong:

- **The runner must be pinned.** `py-genlayer:test` and `py-genlayer:latest` are local aliases and
  are rejected by every GenLayer network. The pinned hash above is the first line of the contract.
- **StudioNet refuses calls over its allowance** (30 a minute, 500 an hour) with `-32029`, *before*
  processing them, and the public endpoint sometimes drops a connection mid-poll. The script waits
  out a refusal and retries a transport failure; it never retries a real answer.

## Proving the deployed bytes are this source

```bash
python scripts/verify_deployment.py 0xdba02A566960639FF86C6dBe81cb33D511254Ba2
```

It fetches the contract's code and schema from the chain and prints:

- the sha-256 of the deployed bytes beside the sha-256 of `contracts/PACT.py`, and whether they match;
- the method list the chain reports, checked against the 22 the contract defines (11 writes, 11 views).

Add `--write-schema` to write `frontend/lib/genlayer/pact-schema.json`. The interface compares the
chain's schema against that file at load and refuses to offer an action the deployed contract does
not have, so an interface pointed at an older deployment says so instead of failing at signing time.

## Pointing the interface at a deployment

```bash
cd frontend
cp .env.example .env.local
```

| Variable | |
| --- | --- |
| `NEXT_PUBLIC_GENLAYER_NETWORK` | `studionet` |
| `NEXT_PUBLIC_GENLAYER_CHAIN` | `61999` |
| `NEXT_PUBLIC_PACT_CONTRACT_ADDRESS` | the deployed address |

All three are validated at startup; if one is missing or malformed the app renders what is wrong
rather than running against a default. There is no server, no database and no secret: the interface
reads the chain and the user's wallet signs every write.

**A redeploy changes the address.** Update `.env.local` (and the hosting environment) and rebuild, or
the app will keep serving the old contract. Regenerate the schema file in the same step.

## The demonstration documents

The live scenarios adjudicate the files in `demo/`, fetched over commit-pinned
`raw.githubusercontent.com` addresses. Pinning to a commit matters: an address that serves whatever
is on a branch today is not evidence of anything, because the bytes the panel read could change
afterwards. The commit is recorded with each run.

After changing anything in `demo/`, commit and push first, then pass the new commit to a run:

```bash
python scripts/live_probe.py <address> --scenario breached --commit <sha>
```
