"""Verify a PACT deployment from the chain alone.

    python scripts/verify_deployment.py <address> [--revision HEAD] [--agreement A1] [--write-schema]

Prints, read from StudioNet only:
  code       the deployed code, compared byte for byte with contracts/PACT.py as
             git stores it at the revision
  schema     the methods GenLayer derived from that code
  protocol   get_protocol_info
  agreements every agreement with its lifecycle, result and custody
  agreement  with --agreement: its definition, evidence, verdicts and history

--write-schema writes the schema to frontend/lib/genlayer/pact-schema.json, the
fixture the interface's tests pin the app's calls against.

Exits non-zero unless the deployed code is byte-identical to the source.
"""
import argparse
import base64
import hashlib
import json
import pathlib
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RPC = "https://studio.genlayer.com/api"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=body,
                                 headers={"Content-Type": "application/json", "User-Agent": UA})
    out = json.load(urllib.request.urlopen(req, timeout=120))
    if "error" in out:
        raise RuntimeError(f"{method}: {out['error']}")
    return out["result"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("address")
    ap.add_argument("--revision", default="HEAD")
    ap.add_argument("--agreement", default="")
    ap.add_argument("--write-schema", action="store_true")
    args = ap.parse_args()

    from eth_account import Account
    from genlayer_py import create_client
    from genlayer_py.chains import studionet

    on_chain = base64.b64decode(rpc("gen_getContractCode", [args.address]))
    source = subprocess.run(["git", "show", f"{args.revision}:contracts/PACT.py"], cwd=ROOT,
                            capture_output=True, check=True).stdout
    a, b = hashlib.sha256(on_chain).hexdigest(), hashlib.sha256(source).hexdigest()
    print(f"on-chain  {args.address}  {len(on_chain)} bytes  sha256 {a}")
    print(f"git       {args.revision:<40}  {len(source)} bytes  sha256 {b}")
    print("MATCH - the deployment is byte-identical to the repository source" if a == b
          else "DIFFERENT - the deployment is not this source")

    schema = rpc("gen_getContractSchema", [args.address])
    print("\n-- schema methods --")
    print(json.dumps({m: [p[0] for p in d.get("params", [])]
                      for m, d in sorted(schema.get("methods", {}).items())}, indent=2))
    if args.write_schema:
        out = ROOT / "frontend" / "lib" / "genlayer" / "pact-schema.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"wrote {out.relative_to(ROOT)}")

    client = create_client(chain=studionet, account=Account.create())   # read-only, never funded
    read = lambda fn, *a: client.read_contract(address=args.address, function_name=fn, args=list(a))
    info = read("get_protocol_info")
    print("\n-- protocol --")
    print(f"{info['protocol_version']}  rules {info['policy_rules']}  agreements {info['agreement_count']}  "
          f"custody {int(info['total_custody']) / 10 ** 18:g} GEN")

    page = read("list_agreements", 0, 50)
    print(f"\n-- agreements ({page['total']}) --")
    for a_ in page["items"]:
        print(f"{a_['agreement_id']:<5} {a_['lifecycle']:<22} {a_['result_state']:<22} "
              f"held {int(a_['amount_deposited']) + int(a_['bond_deposited']):>20} atto  "
              f"{a_['title'][:40]}")

    if args.agreement:
        agreement = read("get_agreement", args.agreement)
        print(f"\n-- {args.agreement} --")
        print(json.dumps(agreement, indent=2, default=str)[:2000])
        print("\n-- evidence --")
        print(json.dumps(read("list_evidence", args.agreement, 0, 30), indent=2, default=str)[:2000])
        print("\n-- verdicts --")
        print(json.dumps(read("list_verdicts", args.agreement, 0, 10), indent=2, default=str)[:3000])
        print("\n-- history --")
        for h in read("get_history", args.agreement, 0, 30)["items"]:
            print(f"  {h['at']}  {h['from'] or '(new)':<22} -> {h['to']:<22} {h['note']}")

    return 0 if a == b else 1


if __name__ == "__main__":
    sys.exit(main())
