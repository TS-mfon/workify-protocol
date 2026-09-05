import { chains, createAccount, createClient } from "genlayer-js";
import type { Hex, Account } from "viem";

export type GenLayerNetwork = "bradbury" | "studionet";

export type GenLayerNetworkConfig = {
  network: GenLayerNetwork;
  endpoint: string;
  chain: never;
  treasury: `0x${string}`;
  verifiers: Record<string, `0x${string}`>;
  explorer: string;
  gasless: boolean;
};

const bradburyVerifiers = {
  GITHUB_SOFTWARE: "0xe5E347406756c9FFf887E95F398c0995967CeA4D",
  WEB_APPLICATION: "0x9C3267313635606bAf70Eb9edCc115e2958026Dd",
  RESEARCH_DATA: "0x4A8eB3d7e458B1BA6faC962eAD93aD5cD2c30FCf",
  CONTENT_DOCUMENT: "0x1D5Eb59b9aC361A9547e03A3b00F39d0cD8AF25B",
  DESIGN_CREATIVE: "0x5D2A4cDEcD52641D4692E23d29157e1b9Cb222B6",
} as Record<string, `0x${string}`>;

function envAddress(name: string, fallback = "") {
  return (process.env[name] || fallback) as `0x${string}`;
}

export function getGenLayerNetworkConfig(network: GenLayerNetwork = "bradbury"): GenLayerNetworkConfig {
  if (network === "studionet") {
    return {
      network,
      endpoint: process.env.STUDIO_NET_GENLAYER_RPC_URL || "https://studio.genlayer.com/api",
      chain: chains.studionet as never,
      treasury: envAddress("STUDIO_NET_GEN_TREASURY_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_GEN_TREASURY_ADDRESS || "0xFd682C098E88b1900BD5a6a68cAac43A6b1f5C13"),
      verifiers: {
        GITHUB_SOFTWARE: envAddress("STUDIO_NET_GITHUB_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_GITHUB_VERIFIER_ADDRESS || "0x5D73D33915823e2B7F7d4A283Ca7430d2323A061"),
        WEB_APPLICATION: envAddress("STUDIO_NET_WEB_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_WEB_VERIFIER_ADDRESS || "0xA758D03379f0A8e304724D4D5ad784129F6A7132"),
        RESEARCH_DATA: envAddress("STUDIO_NET_RESEARCH_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_RESEARCH_VERIFIER_ADDRESS || "0xAeC16f3b790308F46f3550BCf2cEd776a687A456"),
        CONTENT_DOCUMENT: envAddress("STUDIO_NET_DOCUMENT_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_DOCUMENT_VERIFIER_ADDRESS || "0xEbC774d80AdFa10b690fD0F43328550492b5E1bf"),
        DESIGN_CREATIVE: envAddress("STUDIO_NET_DESIGN_VERIFIER_ADDRESS", process.env.NEXT_PUBLIC_STUDIO_NET_DESIGN_VERIFIER_ADDRESS || "0x23efb926b2DB12a8A9a9A46d660d2db9eC50e498"),
      },
      explorer: process.env.STUDIO_NET_EXPLORER_URL || "https://explorer-studio.genlayer.com",
      gasless: true,
    };
  }
  return {
    network,
    endpoint: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://rpc-bradbury.genlayer.com",
    chain: chains.testnetBradbury as never,
    treasury: envAddress("NEXT_PUBLIC_GEN_TREASURY_ADDRESS", "0x46E31E4161AC0F4EeC33c585F752DAd13646Ee05"),
    verifiers: bradburyVerifiers,
    explorer: process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL || "https://explorer-bradbury.genlayer.com",
    gasless: false,
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
