"""Deploy contracts/PACT.py to GenLayer StudioNet and prove the deployment.

    python scripts/deploy.py [--revision HEAD] [--out docs/deployment.json]

In order:

  1. read the contract as git stores it at that revision (LF endings), so what
     is deployed is exactly what the repository holds;
  2. create a throwaway deployer and fund it from the StudioNet faucet. No
     private key is requested, printed or stored, and the deployer holds no
     privilege: PACT has no owner;
  3. deploy, wait for ACCEPTED, then wait for FINALIZED;
  4. read the code GenLayer stores back and require it to be byte-identical;
  5. read the schema and get_protocol_info;
  6. write the record and print the frontend's environment lines.

Exits non-zero if any check fails.
"""
import argparse
import base64
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RPC = "https://studio.genlayer.com/api"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36")
CHAIN_ID = 61999
EXPLORER = "https://explorer-studio.genlayer.com"


def rpc(method, params, attempts=6):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for i in range(attempts):
        try:
            req = urllib.request.Request(RPC, data=body,
                                         headers={"Content-Type": "application/json", "User-Agent": UA})
            out = json.load(urllib.request.urlopen(req, timeout=120))
            if "error" in out:
                err = str(out["error"])
                if "-32029" in err or "Rate limit" in err:
                    wait = re.search(r"retry_after_seconds\W+(\d+)", err)
                    time.sleep(min(int(wait.group(1)) if wait else 65, 3600) + 5)
                    continue
                raise RuntimeError(f"{method}: {out['error']}")
            return out["result"]
        except RuntimeError:
            raise
        except Exception:
            if i == attempts - 1:
                raise
            time.sleep(5 + 5 * i)


def git_source(revision: str) -> bytes:
    """The contract exactly as git stores it, so a clean checkout deploys the
    same bytes."""
    return subprocess.run(["git", "show", f"{revision}:contracts/PACT.py"], cwd=ROOT,
                          capture_output=True, check=True).stdout


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--revision", default="HEAD")
    ap.add_argument("--out", default="docs/deployment.json")
    args = ap.parse_args()

    from eth_account import Account
    from genlayer_py import create_client
    from genlayer_py.chains import studionet
    from genlayer_py.types import TransactionStatus

    source = git_source(args.revision)
    digest = hashlib.sha256(source).hexdigest()
    commit = subprocess.run(["git", "rev-parse", args.revision], cwd=ROOT, capture_output=True,
                            text=True, check=True).stdout.strip()
    print(f"source    contracts/PACT.py @ {commit[:12]}  {len(source)} bytes  sha256 {digest}")

    deployer = Account.create()
    rpc("sim_fundAccount", [deployer.address, 10 ** 19])
    client = create_client(chain=studionet, account=deployer)
    for _ in range(40):
        if int(client.get_balance(deployer.address)) > 0:
            break
        time.sleep(3)
    print(f"deployer  {deployer.address} (throwaway, faucet-funded, no contract privileges)")

    tx = client.deploy_contract(code=source, args=[])
    tx_hex = tx.hex() if hasattr(tx, "hex") else str(tx)
    print(f"submitted {tx_hex}")
    receipt = client.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.ACCEPTED,
                                                 interval=5000, retries=240)
    leader = ((receipt.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
    address = (receipt.get("data") or {}).get("contract_address") or receipt.get("to_address")
    print(f"accepted  {receipt.get('result_name')}  execution {leader.get('execution_result')}  "
          f"address {address}")
    if not address or leader.get("execution_result") != "SUCCESS":
        print("the deployment did not succeed")
        return 1
    final = client.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.FINALIZED,
                                                interval=5000, retries=360)
    print(f"finalized {final.get('status_name')}")

    on_chain = base64.b64decode(rpc("gen_getContractCode", [address]))
    same = hashlib.sha256(on_chain).hexdigest() == digest
    print(f"on-chain  {len(on_chain)} bytes  sha256 {hashlib.sha256(on_chain).hexdigest()}  "
          f"{'MATCH' if same else 'DIFFERENT'}")
    if not same:
        return 1

    schema = rpc("gen_getContractSchema", [address])
    info = client.read_contract(address=address, function_name="get_protocol_info", args=[])
    record = {
        "network": "GenLayer StudioNet", "chain_id": CHAIN_ID, "rpc": RPC,
        "explorer": f"{EXPLORER}/address/{address}",
        "contract_address": address, "deploy_tx": tx_hex,
        "deploy_status": final.get("status_name"), "deploy_consensus": receipt.get("result_name"),
        "source": "contracts/PACT.py", "source_commit": commit, "source_sha256": digest,
        "source_bytes": len(source), "onchain_sha256": hashlib.sha256(on_chain).hexdigest(),
        "byte_identical": same, "protocol_version": info["protocol_version"],
        "policy_rules": info["policy_rules"],
        "genvm_runner": source.decode("utf-8").split('"Depends": "', 1)[1].split('"', 1)[0],
        "schema_methods": sorted(schema.get("methods", {}).keys()),
        "deployed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    out = ROOT / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(f"record    {out.relative_to(ROOT)}")
    print("\nfrontend environment (frontend/.env.local):")
    print("NEXT_PUBLIC_GENLAYER_NETWORK=studionet")
    print(f"NEXT_PUBLIC_GENLAYER_CHAIN={CHAIN_ID}")
    print(f"NEXT_PUBLIC_PACT_CONTRACT_ADDRESS={address}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
