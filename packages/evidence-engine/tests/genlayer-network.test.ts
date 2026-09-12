import { describe, expect, it, afterEach } from "vitest";
import { getGenLayerNetworkConfig } from "../src";

const names = [
  "STUDIO_NET_V12_GITHUB_VERIFIER_ADDRESS",
  "STUDIO_NET_V12_WEB_VERIFIER_ADDRESS",
  "STUDIO_NET_V12_RESEARCH_VERIFIER_ADDRESS",
  "STUDIO_NET_V12_DOCUMENT_VERIFIER_ADDRESS",
  "STUDIO_NET_V12_DESIGN_VERIFIER_ADDRESS",
] as const;
const previous = new Map(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = previous.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("GenLayer network configuration", () => {
  it("selects V12 only when every direct verifier is configured", () => {
    for (const name of names) process.env[name] = "0x0000000000000000000000000000000000000001";
    const config = getGenLayerNetworkConfig("studionet");
    expect(config.version).toBe(12);
    expect(config.verificationFee).toBe(0n);
    expect(config.appealFee).toBe(0n);
    expect(config.configured).toBe(true);
  });

  it("uses the validated V12 deployment when environment overrides are incomplete", () => {
    for (const name of names) delete process.env[name];
    process.env.STUDIO_NET_V12_GITHUB_VERIFIER_ADDRESS = "0x0000000000000000000000000000000000000001";
    const config = getGenLayerNetworkConfig("studionet");
    expect(config.version).toBe(12);
    expect(Object.values(config.verifiers).every(Boolean)).toBe(true);
  });
});
