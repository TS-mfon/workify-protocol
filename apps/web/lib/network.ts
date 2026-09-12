import { createPublicClient, fallback, http } from "viem";
import { baseSepolia } from "viem/chains";

export const WORKIFY_NETWORK = {
  baseRpc: "https://sepolia.base.org",
  baseUsdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
  escrow: "0x4b7Fc39D747461115B351c64368987354f5f0457" as `0x${string}`,
  escrowDeploymentBlock: 46704733n,
  baseTreasury: "0xf5772D2A3B9493d94107a0328AF48D17144Ae843" as `0x${string}`,
  genTreasury: "0x46E31E4161AC0F4EeC33c585F752DAd13646Ee05" as `0x${string}`,
  genlayerRpc: "https://rpc-bradbury.genlayer.com",
  verifiers: {
    GITHUB_SOFTWARE: "0x0370eAD9bADd7Ea57129716e85E30c8aF61d0d15",
    WEB_APPLICATION: "0x62B486f95563D18d03a3f46Cb312297d3e1dAA69",
    RESEARCH_DATA: "0x34E5C2Fa49aa22213cB044491e7DB9A7e9896D21",
    CONTENT_DOCUMENT: "0x12E3944187702cD4127B30451A0aA31d5408346E",
    DESIGN_CREATIVE: "0xb276C4F8ea32A170247Ea0B3C4C9686E41032f26",
  } as const,
} as const;

export function publicNetworkConfig() {
  const useEnvironmentAddresses = process.env.WORKIFY_USE_ENV_NETWORK === "true";
  return {
    baseRpc: process.env.BASE_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || WORKIFY_NETWORK.baseRpc,
    baseRpcFallbacks: (process.env.BASE_SEPOLIA_RPC_FALLBACK_URLS || "https://base-sepolia-rpc.publicnode.com,https://base-sepolia.blockpi.network/v1/rpc/public").split(",").map((url) => url.trim()).filter(Boolean),
    baseUsdc: ((useEnvironmentAddresses ? process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS : undefined) || WORKIFY_NETWORK.baseUsdc) as `0x${string}`,
    escrow: ((useEnvironmentAddresses ? process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS : undefined) || WORKIFY_NETWORK.escrow) as `0x${string}`,
    fromBlock: WORKIFY_NETWORK.escrowDeploymentBlock,
    genlayerRpc: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || WORKIFY_NETWORK.genlayerRpc,
    genTreasury: ((useEnvironmentAddresses ? (process.env.NEXT_PUBLIC_GEN_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_GENLAYER_TREASURY_ADDRESS) : undefined) || WORKIFY_NETWORK.genTreasury) as `0x${string}`,
    verifiers: {
      GITHUB_SOFTWARE: ((useEnvironmentAddresses ? process.env.NEXT_PUBLIC_GITHUB_VERIFIER_ADDRESS : undefined) || WORKIFY_NETWORK.verifiers.GITHUB_SOFTWARE) as `0x${string}`,
      WEB_APPLICATION: ((useEnvironmentAddresses ? process.env.NEXT_PUBLIC_WEB_VERIFIER_ADDRESS : undefined) || WORKIFY_NETWORK.verifiers.WEB_APPLICATION) as `0x${string}`,
      RESEARCH_DATA: ((useEnvironmentAddresses ? process.env.NEXT_PUBLIC_RESEARCH_VERIFIER_ADDRESS : undefined) || WORKIFY_NETWORK.verifiers.RESEARCH_DATA) as `0x${string}`,
      CONTENT_DOCUMENT: ((useEnvironmentAddresses ? process.env.NEXT_PUBLIC_DOCUMENT_VERIFIER_ADDRESS : undefined) || WORKIFY_NETWORK.verifiers.CONTENT_DOCUMENT) as `0x${string}`,
      DESIGN_CREATIVE: ((useEnvironmentAddresses ? process.env.NEXT_PUBLIC_DESIGN_VERIFIER_ADDRESS : undefined) || WORKIFY_NETWORK.verifiers.DESIGN_CREATIVE) as `0x${string}`,
    },
  };
}

export function createBasePublicClient(rpc: string) {
  const urls = [rpc, ...publicNetworkConfig().baseRpcFallbacks].filter((url, index, all) => url && all.indexOf(url) === index);
  return createPublicClient({ chain: baseSepolia, transport: fallback(urls.map((url) => http(url)), { rank: false }) });
}

export async function getLogsInChunks<T>(
  fromBlock: bigint,
  getLogs: (fromBlock: bigint, toBlock: bigint) => Promise<readonly T[]>,
  getLatestBlock: () => Promise<bigint>,
) {
  const latest = await getLatestBlock();
  if (latest < fromBlock) return [];
  const chunkSize = 9_000n;
  const logs: T[] = [];
  for (let start = fromBlock; start <= latest; start += chunkSize) {
    const end = start + chunkSize - 1n > latest ? latest : start + chunkSize - 1n;
    logs.push(...await getLogs(start, end));
  }
  return logs;
}
