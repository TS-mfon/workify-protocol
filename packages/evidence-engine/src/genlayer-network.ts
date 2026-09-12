import { chains, createAccount, createClient } from "genlayer-js";
import type { Hex, Account } from "viem";

export type GenLayerNetwork = "bradbury" | "studionet";

export type GenLayerNetworkConfig = {
  network: GenLayerNetwork;
  version: 12;
  configured: boolean;
  endpoint: string;
  chain: never;
  treasury: `0x${string}`;
  verifiers: Record<string, `0x${string}`>;
  legacyVerifiers: Record<string, `0x${string}`>;
  explorer: string;
  gasless: boolean;
  verificationFee: bigint;
  appealFee: bigint;
};

const legacyBradburyVerifiers = {
  GITHUB_SOFTWARE: "0xe5E347406756c9FFf887E95F398c0995967CeA4D",
  WEB_APPLICATION: "0x9C3267313635606bAf70Eb9edCc115e2958026Dd",
  RESEARCH_DATA: "0x4A8eB3d7e458B1BA6faC962eAD93aD5cD2c30FCf",
  CONTENT_DOCUMENT: "0x1D5Eb59b9aC361A9547e03A3b00F39d0cD8AF25B",
  DESIGN_CREATIVE: "0x5D2A4cDEcD52641D4692E23d29157e1b9Cb222B6",
} as Record<string, `0x${string}`>;

const studioNetV10Verifiers = {
  GITHUB_SOFTWARE: "0x5475AAf17e306F5044fb39377F1AF6f86E5c2368",
  WEB_APPLICATION: "0x299ab1d0Bd32423256dee159bB9B7284a78BBCC4",
  RESEARCH_DATA: "0x7FB1d8eA4FCfcA8cc06A5D9BF9D8E8fbD2446448",
  CONTENT_DOCUMENT: "0xF5A8542c71B4EDD7d7fe0e52F59ab80ebFBE3B1a",
  DESIGN_CREATIVE: "0x3C8aF1eea102E6958E28441Bf97Ae225Ff2b29ff",
} as Record<string, `0x${string}`>;

const studioNetV12Verifiers = {
  GITHUB_SOFTWARE: "0x0370eAD9bADd7Ea57129716e85E30c8aF61d0d15",
  WEB_APPLICATION: "0x62B486f95563D18d03a3f46Cb312297d3e1dAA69",
  RESEARCH_DATA: "0x34E5C2Fa49aa22213cB044491e7DB9A7e9896D21",
  CONTENT_DOCUMENT: "0x12E3944187702cD4127B30451A0aA31d5408346E",
  DESIGN_CREATIVE: "0xb276C4F8ea32A170247Ea0B3C4C9686E41032f26",
} as Record<string, `0x${string}`>;

const emptyVerifiers = {
  GITHUB_SOFTWARE: "",
  WEB_APPLICATION: "",
  RESEARCH_DATA: "",
  CONTENT_DOCUMENT: "",
  DESIGN_CREATIVE: "",
} as unknown as Record<string, `0x${string}`>;

function v12Verifiers(prefix: "STUDIO_NET" | "BRADBURY") {
  const values = {
    GITHUB_SOFTWARE: envAddress(`${prefix}_V12_GITHUB_VERIFIER_ADDRESS`),
    WEB_APPLICATION: envAddress(`${prefix}_V12_WEB_VERIFIER_ADDRESS`),
    RESEARCH_DATA: envAddress(`${prefix}_V12_RESEARCH_VERIFIER_ADDRESS`),
    CONTENT_DOCUMENT: envAddress(`${prefix}_V12_DOCUMENT_VERIFIER_ADDRESS`),
    DESIGN_CREATIVE: envAddress(`${prefix}_V12_DESIGN_VERIFIER_ADDRESS`),
  } as Record<string, `0x${string}`>;
  return Object.values(values).every(Boolean) ? values : emptyVerifiers;
}

function verifierAddress(name: string, fallback?: string) {
  return envAddress(name, fallback);
}

function envAddress(name: string, fallback = "") {
  return (process.env[name] || fallback) as `0x${string}`;
}

export function getGenLayerNetworkConfig(network: GenLayerNetwork = "bradbury"): GenLayerNetworkConfig {
  if (network === "studionet") {
    const v12 = Object.values(v12Verifiers("STUDIO_NET")).every(Boolean) ? v12Verifiers("STUDIO_NET") : studioNetV12Verifiers;
    return {
      network,
      version: 12,
      configured: Object.values(v12).every(Boolean),
      endpoint: process.env.STUDIO_NET_GENLAYER_RPC_URL || "https://studio.genlayer.com/api",
      chain: chains.studionet as never,
      treasury: envAddress("STUDIO_NET_GEN_TREASURY_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_GEN_TREASURY_ADDRESS || "0x0000000000000000000000000000000000000000"),
      verifiers: v12,
      legacyVerifiers: emptyVerifiers,
      explorer: process.env.STUDIO_NET_EXPLORER_URL || "https://explorer-studio.genlayer.com",
      gasless: true,
      verificationFee: 0n,
      appealFee: 0n,
    };
  }
  const v12 = v12Verifiers("BRADBURY");
  return {
    network,
    version: 12,
    configured: Object.values(v12).every(Boolean),
    endpoint: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://rpc-bradbury.genlayer.com",
    chain: chains.testnetBradbury as never,
    treasury: envAddress("NEXT_PUBLIC_GEN_TREASURY_ADDRESS", "0x46E31E4161AC0F4EeC33c585F752DAd13646Ee05"),
    verifiers: v12,
    legacyVerifiers: emptyVerifiers,
    explorer: process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL || "https://explorer-bradbury.genlayer.com",
    gasless: false,
    verificationFee: 0n,
    appealFee: 0n,
  };
}

export function createServerGenLayerClient(network: GenLayerNetwork, key: Hex) {
  const config = getGenLayerNetworkConfig(network);
  return createClient({ chain: configuredChain(config), account: createAccount(key) });
}

export function createReadOnlyGenLayerClient(network: GenLayerNetwork) {
  const config = getGenLayerNetworkConfig(network);
  return createClient({ chain: configuredChain(config) });
}

export function createWalletGenLayerClient(network: GenLayerNetwork, account: Account, provider: unknown) {
  const config = getGenLayerNetworkConfig(network);
  return createClient({ chain: configuredChain(config), account, provider: provider as never });
}

function configuredChain(config: GenLayerNetworkConfig) {
  const source = config.chain as { rpcUrls: { default: { http: readonly string[] } } };
  return {
    ...source,
    rpcUrls: {
      ...source.rpcUrls,
      default: { ...source.rpcUrls.default, http: [config.endpoint] },
    },
  } as never;
}
