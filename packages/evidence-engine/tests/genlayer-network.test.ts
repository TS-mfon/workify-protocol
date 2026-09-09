import { describe, expect, it, afterEach } from "vitest";
import { getGenLayerNetworkConfig } from "../src";

const names = [
  "STUDIO_NET_V11_GITHUB_VERIFIER_ADDRESS",
  "STUDIO_NET_V11_WEB_VERIFIER_ADDRESS",
  "STUDIO_NET_V11_RESEARCH_VERIFIER_ADDRESS",
  "STUDIO_NET_V11_DOCUMENT_VERIFIER_ADDRESS",
  "STUDIO_NET_V11_DESIGN_VERIFIER_ADDRESS",
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
  it("selects V11 only when every direct verifier is configured", () => {
    for (const name of names) process.env[name] = "0x0000000000000000000000000000000000000001";
    const config = getGenLayerNetworkConfig("studionet");
    expect(config.version).toBe(11);
    expect(config.verificationFee).toBe(0n);
    expect(config.appealFee).toBe(0n);
    expect(config.configured).toBe(true);
  });

  it("does not advertise an incomplete V11 deployment", () => {
    for (const name of names) delete process.env[name];
    process.env.STUDIO_NET_V11_GITHUB_VERIFIER_ADDRESS = "0x0000000000000000000000000000000000000001";
    const config = getGenLayerNetworkConfig("studionet");
    expect(config.version).toBe(10);
    expect(Object.values(config.verifiers).every(Boolean)).toBe(true);
  });
});
