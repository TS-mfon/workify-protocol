import { createPublicClient, fallback, http } from "viem";
import { baseSepolia } from "viem/chains";

export const WORKIFY_NETWORK = {
  baseRpc: "https://sepolia.base.org",
  baseUsdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
  escrow: "0xCfc6B780CDe6f8e8b377f63E921B342ee9557294" as `0x${string}`,
  escrowDeploymentBlock: 46316078n,
  baseTreasury: "0x02F383AA78C48eDf75dea0b74773AbFebF2CD8a4" as `0x${string}`,
  genTreasury: "0x46E31E4161AC0F4EeC33c585F752DAd13646Ee05" as `0x${string}`,
  genlayerRpc: "https://rpc-bradbury.genlayer.com",
  verifiers: {
    GITHUB_SOFTWARE: "0xe5E347406756c9FFf887E95F398c0995967CeA4D",
    WEB_APPLICATION: "0x9C3267313635606bAf70Eb9edCc115e2958026Dd",
    RESEARCH_DATA: "0x4A8eB3d7e458B1BA6faC962eAD93aD5cD2c30FCf",
    CONTENT_DOCUMENT: "0x1D5Eb59b9aC361A9547e03A3b00F39d0cD8AF25B",
    DESIGN_CREATIVE: "0x5D2A4cDEcD52641D4692E23d29157e1b9Cb222B6",
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
