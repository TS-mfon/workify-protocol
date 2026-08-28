import { describe, expect, it } from "vitest";
import { APPEAL_WINDOW_SECONDS, MAX_VERIFICATION_ATTEMPTS, PLATFORM_FEE_BPS } from "@workify/protocol-types";

describe("app protocol presentation", () => {
  it("uses the canonical protocol constants", () => {
    expect(APPEAL_WINDOW_SECONDS).toBe(300);
    expect(MAX_VERIFICATION_ATTEMPTS).toBe(3);
    expect(PLATFORM_FEE_BPS).toBe(100);
  });
});
