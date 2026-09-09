import { chains, createAccount, createClient } from "genlayer-js";
import type { Hex, Account } from "viem";

export type GenLayerNetwork = "bradbury" | "studionet";

export type GenLayerNetworkConfig = {
  network: GenLayerNetwork;
  version: 10 | 11;
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

const emptyVerifiers = {
  GITHUB_SOFTWARE: "",
  WEB_APPLICATION: "",
  RESEARCH_DATA: "",
  CONTENT_DOCUMENT: "",
  DESIGN_CREATIVE: "",
} as unknown as Record<string, `0x${string}`>;

function v11Verifiers(prefix: "STUDIO_NET" | "BRADBURY") {
  const values = {
    GITHUB_SOFTWARE: envAddress(`${prefix}_V11_GITHUB_VERIFIER_ADDRESS`),
    WEB_APPLICATION: envAddress(`${prefix}_V11_WEB_VERIFIER_ADDRESS`),
    RESEARCH_DATA: envAddress(`${prefix}_V11_RESEARCH_VERIFIER_ADDRESS`),
    CONTENT_DOCUMENT: envAddress(`${prefix}_V11_DOCUMENT_VERIFIER_ADDRESS`),
    DESIGN_CREATIVE: envAddress(`${prefix}_V11_DESIGN_VERIFIER_ADDRESS`),
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
    const v11 = v11Verifiers("STUDIO_NET");
    const useV11 = Object.values(v11).every(Boolean);
    return {
      network,
      version: useV11 ? 11 : 10,
      configured: useV11 || Object.values(studioNetV10Verifiers).every(Boolean),
      endpoint: process.env.STUDIO_NET_GENLAYER_RPC_URL || "https://studio.genlayer.com/api",
      chain: chains.studionet as never,
      treasury: envAddress("STUDIO_NET_GEN_TREASURY_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_GEN_TREASURY_ADDRESS || "0x0000000000000000000000000000000000000000"),
      verifiers: useV11 ? v11 : {
        GITHUB_SOFTWARE: verifierAddress("STUDIO_NET_V10_GITHUB_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_V10_GITHUB_VERIFIER_ADDRESS || studioNetV10Verifiers.GITHUB_SOFTWARE),
        WEB_APPLICATION: verifierAddress("STUDIO_NET_V10_WEB_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_V10_WEB_VERIFIER_ADDRESS || studioNetV10Verifiers.WEB_APPLICATION),
        RESEARCH_DATA: verifierAddress("STUDIO_NET_V10_RESEARCH_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_V10_RESEARCH_VERIFIER_ADDRESS || studioNetV10Verifiers.RESEARCH_DATA),
        CONTENT_DOCUMENT: verifierAddress("STUDIO_NET_V10_DOCUMENT_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_V10_DOCUMENT_VERIFIER_ADDRESS || studioNetV10Verifiers.CONTENT_DOCUMENT),
        DESIGN_CREATIVE: verifierAddress("STUDIO_NET_V10_DESIGN_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_V10_DESIGN_VERIFIER_ADDRESS || studioNetV10Verifiers.DESIGN_CREATIVE),
      },
      legacyVerifiers: studioNetV10Verifiers,
      explorer: process.env.STUDIO_NET_EXPLORER_URL || "https://explorer-studio.genlayer.com",
      gasless: true,
      verificationFee: 0n,
      appealFee: 0n,
    };
  }
  const v11 = v11Verifiers("BRADBURY");
  const useV11 = Object.values(v11).every(Boolean);
  return {
    network,
    version: useV11 ? 11 : 10,
    configured: useV11 || Object.values(legacyBradburyVerifiers).every(Boolean),
    endpoint: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://rpc-bradbury.genlayer.com",
    chain: chains.testnetBradbury as never,
    treasury: envAddress("NEXT_PUBLIC_GEN_TREASURY_ADDRESS", "0x46E31E4161AC0F4EeC33c585F752DAd13646Ee05"),
    verifiers: useV11 ? v11 : {
      GITHUB_SOFTWARE: verifierAddress("BRADBURY_V10_GITHUB_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_BRADBURY_V10_GITHUB_VERIFIER_ADDRESS || legacyBradburyVerifiers.GITHUB_SOFTWARE),
      WEB_APPLICATION: verifierAddress("BRADBURY_V10_WEB_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_BRADBURY_V10_WEB_VERIFIER_ADDRESS || legacyBradburyVerifiers.WEB_APPLICATION),
      RESEARCH_DATA: verifierAddress("BRADBURY_V10_RESEARCH_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_BRADBURY_V10_RESEARCH_VERIFIER_ADDRESS || legacyBradburyVerifiers.RESEARCH_DATA),
      CONTENT_DOCUMENT: verifierAddress("BRADBURY_V10_DOCUMENT_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_BRADBURY_V10_DOCUMENT_VERIFIER_ADDRESS || legacyBradburyVerifiers.CONTENT_DOCUMENT),
      DESIGN_CREATIVE: verifierAddress("BRADBURY_V10_DESIGN_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_BRADBURY_V10_DESIGN_VERIFIER_ADDRESS || legacyBradburyVerifiers.DESIGN_CREATIVE),
    },
    legacyVerifiers: legacyBradburyVerifiers,
    explorer: process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL || "https://explorer-bradbury.genlayer.com",
    gasless: false,
    verificationFee: useV11 ? 0n : 100_000_000_000_000_000n,
    appealFee: useV11 ? 0n : 1_000_000_000_000_000_000n,
  };
}

export function createServerGenLayerClient(network: GenLayerNetwork, key: Hex) {
  const config = getGenLayerNetworkConfig(network);
  return network === "studionet"
    ? createClient({ chain: config.chain, account: createAccount(key) })
    : createClient({ chain: config.chain, endpoint: config.endpoint, account: createAccount(key) });
}

export function createWalletGenLayerClient(network: GenLayerNetwork, account: Account, provider: unknown) {
  const config = getGenLayerNetworkConfig(network);
  return createClient({ chain: config.chain, account, provider: provider as never });
}
