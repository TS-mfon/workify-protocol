import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalJson, classifyGenLayerReceipt } from "../src";

describe("evidence engine", () => {
  it("canonicalizes object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
    expect(canonicalHash({ a: 1 })).toHaveLength(64);
  });

  it("requires successful execution inside finalized receipts", () => {
    expect(classifyGenLayerReceipt({ statusName: "UNDETERMINED" })).toBe("UNDETERMINED");
    expect(classifyGenLayerReceipt({ statusName: "PENDING" })).toBe("PENDING");
    expect(classifyGenLayerReceipt({ statusName: "FINALIZED", consensus_data: { leader_receipt: [{ execution_result: "SUCCESS", result: { status: "return" } }] } })).toBe("FINALIZED");
    expect(() => classifyGenLayerReceipt({ statusName: "FINALIZED" })).toThrow();
  });

  it("supports current Bradbury decoded execution fields", () => {
    expect(classifyGenLayerReceipt({
      statusName: "FINALIZED",
      resultName: "AGREE",
      txExecutionResultName: "FINISHED_WITH_RETURN",
    })).toBe("FINALIZED");
  });
});
