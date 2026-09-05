import { describe, expect, it } from "vitest";
import { APPEAL_WINDOW_SECONDS, MAX_VERIFICATION_ATTEMPTS, PLATFORM_FEE_BPS } from "@workify/protocol-types";
import { readFileSync } from "node:fs";

describe("app protocol presentation", () => {
  it("uses the canonical protocol constants", () => {
    expect(APPEAL_WINDOW_SECONDS).toBe(300);
    expect(MAX_VERIFICATION_ATTEMPTS).toBe(3);
    expect(PLATFORM_FEE_BPS).toBe(100);
  });

  it("ships the funded-job workflow, persistent wallet, and curved emerald design system", () => {
    const form = readFileSync(new URL("../components/NewJobForm.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
    const nav = readFileSync(new URL("../components/Nav.tsx", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
    const walletNetwork = readFileSync(new URL("../lib/wallet-network.ts", import.meta.url), "utf8");
    expect(form).toContain("Work details");
    expect(form).toContain("Review & fund");
    expect(form).toContain("Approve USDC & fund job");
    expect(css).toContain("--green: #35f184");
    expect(css).toContain("--radius-control: 999px");
    expect(css).toContain("border-radius: 42px 42px 14px 42px");
    expect(nav).toContain("<WalletButton compact />");
    expect(shell).toContain("<WalletButton compact />");
    expect(walletNetwork).toContain("wallet_switchEthereumChain");
    expect(css).not.toContain("--purple:");
  });

  it("uses the Vercel signer instead of a third-party relayer runtime", () => {
    const docs = readFileSync(new URL("./docs/page.tsx", import.meta.url), "utf8");
    expect(docs).toContain("Vercel Base Automation Signer");
    expect(docs).toContain("/api/health/base-signer");
    expect(docs).not.toContain("server wallet");
  });
});
