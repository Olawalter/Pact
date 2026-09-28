/**
 * The app's view of the contract, pinned to the deployed contract's own schema
 * (lib/genlayer/pact-schema.json, written by scripts/verify_deployment.py from
 * the deployment of record). A method renamed, a parameter reordered or a value
 * accepted where it should not be fails here, not in front of a party.
 */
import { describe, expect, it } from "vitest";

import schema from "@/lib/genlayer/pact-schema.json";
import { PAYABLE_METHODS, REQUIRED_METHODS, acknowledgeCall, agreementSchema, checkAnswer,
         checkSchema, createCall, evidenceCall, fundCall, lockCall, verbCall,
         verdictSchema } from "@/lib/genlayer/contract";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
type SchemaView = { methods: Record<string, { params: [string, string][]; payable?: boolean | null }> };
const view = (v: unknown) => clone(v) as SchemaView;

describe("the deployed interface", () => {
  it("has every method this app calls, with the same parameters", () => {
    expect(checkSchema(schema)).toBeNull();
    const methods = view(schema).methods;
    for (const [name, params] of Object.entries(REQUIRED_METHODS)) {
      expect(methods[name]!.params.map((p) => p[0]), name).toEqual(params);
    }
  });

  it("marks exactly one method payable, and it is the one that takes a deposit", () => {
    expect(PAYABLE_METHODS).toEqual(["fund_agreement"]);
    const methods = view(schema).methods;
    const payable = Object.entries(methods).filter(([, m]) => m.payable === true).map(([n]) => n);
    expect(payable).toEqual(["fund_agreement"]);
  });

  it("refuses a contract whose method is missing, reordered or newly payable", () => {
    const missing = view(schema);
    delete missing.methods.request_adjudication;
    expect(checkSchema(missing)).toMatch(/no request_adjudication method/);

    const reordered = view(schema);
    reordered.methods.create_agreement!.params.reverse();
    expect(checkSchema(reordered)).toMatch(/create_agreement method takes different parameters/);

    const payable = view(schema);
    payable.methods.execute_consequence!.payable = true;
    expect(checkSchema(payable)).toMatch(/execute_consequence method accepts value/);

    expect(checkSchema(null)).toMatch(/No contract schema/);
  });
});

describe("the calls this app composes", () => {
  it("sends a deposit as the transaction's value and nothing else as value", () => {
    const fund = fundCall("A1", 2n * 10n ** 16n);
    expect(fund).toEqual({ functionName: "fund_agreement", args: ["A1"], value: 20000000000000000n });
    for (const call of [createCall("t", "terms", "0x00"), lockCall("A1", "{}"),
                        evidenceCall("A1", "{}"), acknowledgeCall("A1", "E1"),
                        verbCall("request_adjudication", "A1"), verbCall("finalize_verdict", "A1"),
                        verbCall("execute_consequence", "A1"), verbCall("recover", "A1"),
                        verbCall("cancel_agreement", "A1"), verbCall("propose_constraints", "A1")]) {
      expect(call.value, call.functionName).toBe(0n);
    }
  });

  it("passes the definition and the evidence as the JSON the contract parses", () => {
    expect(lockCall("A7", '{"constraints":[]}').args).toEqual(["A7", '{"constraints":[]}']);
    expect(evidenceCall("A7", '{"kind":"WEB_SOURCE"}').args).toEqual(["A7", '{"kind":"WEB_SOURCE"}']);
  });
});

describe("answers are checked at the boundary", () => {
  const agreement = {
    agreement_id: "A1", title: "t", terms: "x", creator: "0xa", counterparty: "0xb",
    lifecycle: "ACTIVE", result_state: "NONE", fingerprint: "f", economic: true,
    amount_required: "1", amount_deposited: "1", bond_required: "0", bond_deposited: "0",
    deadline: 1, recovery_window: 3600, created_at: 1, locked_at: 1, updated_at: 1,
    evidence_count: 2, round_count: 0, last_round_at: 0, latest_verdict_id: "", settled_at: 0,
    paid_creator: "0", paid_counterparty: "0", definition: null,
  };

  it("accepts an agreement as the contract returns it", () => {
    expect(checkAnswer(agreementSchema, agreement, "get_agreement").agreement_id).toBe("A1");
  });

  it("takes an amount inside the definition as a number or as a string", () => {
    const withDefinition = {
      ...agreement,
      definition: {
        constraints: [{ id: "C1", type: "FACTUAL", requirement: "r", description: "",
                        materiality: "MATERIAL", evidence_requirements: ["WEB_SOURCE"] }],
        evidence_policy: { min_independent_origins: 1, required_kinds: ["WEB_SOURCE"],
                           corroboration_required: true },
        consequence_policy: { economic: true, amount_required: "20000000000000000",
                              bond_required: 0, fulfilled_bps: 10000, partially_fulfilled_bps: 5000,
                              breached_bps: 0, bond_forfeit_bps: 0, recovery_rule: "REFUND_CREATOR" },
        deadline: 2, recovery_window: 3600, policy_rules: "PACT-RULES-1",
      },
    };
    const parsed = checkAnswer(agreementSchema, withDefinition, "get_agreement");
    expect(parsed.definition!.consequence_policy.amount_required).toBe("20000000000000000");
    expect(parsed.definition!.consequence_policy.bond_required).toBe("0");
  });

  it("refuses a record this interface cannot render rather than rendering half of it", () => {
    expect(() => checkAnswer(agreementSchema, { ...agreement, lifecycle: "SETTLED_SOMEHOW" },
                             "get_agreement")).toThrow(/does not recognise/);
    expect(() => checkAnswer(verdictSchema, { verdict_id: "v" }, "get_verdict")).toThrow(/get_verdict/);
  });
});
