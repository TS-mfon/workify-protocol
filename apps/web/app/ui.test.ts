import { describe, expect, it } from "vitest";
import { APPEAL_WINDOW_SECONDS, MAX_VERIFICATION_ATTEMPTS, PLATFORM_FEE_BPS } from "@workify/protocol-types";
import { readFileSync } from "node:fs";

describe("app protocol presentation", () => {
  it("uses the canonical protocol constants", () => {
    expect(APPEAL_WINDOW_SECONDS).toBe(300);
    expect(MAX_VERIFICATION_ATTEMPTS).toBe(3);
    expect(PLATFORM_FEE_BPS).toBe(100);
  });

  it("ships the four-step funded-job workflow and emerald design system", () => {
    const form = readFileSync(new URL("../components/NewJobForm.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
    expect(form).toContain("Work details");
    expect(form).toContain("Review & fund");
    expect(form).toContain("Approve USDC & fund job");
    expect(css).toContain("--green: #2ee67b");
    expect(css).not.toContain("--purple:");
  });
});
