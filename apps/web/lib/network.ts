export const WORKIFY_NETWORK = {
  baseRpc: "https://sepolia.base.org",
  baseUsdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
  escrow: "0xCfc6B780CDe6f8e8b377f63E921B342ee9557294" as `0x${string}`,
  escrowDeploymentBlock: 46316078n,
  baseTreasury: "0x02F383AA78C48eDf75dea0b74773AbFebF2CD8a4" as `0x${string}`,
  genTreasury: "0xe11e888CD716b7fBd36442746Ea0C3A9f1d115B3" as `0x${string}`,
  genlayerRpc: "https://rpc-bradbury.genlayer.com",
  verifiers: {
    GITHUB_SOFTWARE: "0x320eD11a756Fe66C270F7BdC752e28D74A79FB5E",
    WEB_APPLICATION: "0xD1787Ae6bf72572Bb7675a47e36c4e2A535A2F88",
    RESEARCH_DATA: "0xcf0cD2bB43814eA8eCB1F8358e54a2A6996A2e2e",
    CONTENT_DOCUMENT: "0x1cF9469872ed956405b5B922A55bCbbDB15c5873",
    DESIGN_CREATIVE: "0x5A39Af8CBC9A7172918dC62c7761f0c27d87f429",
  } as const,
} as const;

export function publicNetworkConfig() {
  return {
    baseRpc: process.env.BASE_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || WORKIFY_NETWORK.baseRpc,
    baseUsdc: (process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || WORKIFY_NETWORK.baseUsdc) as `0x${string}`,
    escrow: (process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS || WORKIFY_NETWORK.escrow) as `0x${string}`,
    fromBlock: BigInt(process.env.WORK_ESCROW_DEPLOYMENT_BLOCK || WORKIFY_NETWORK.escrowDeploymentBlock),
    genlayerRpc: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || WORKIFY_NETWORK.genlayerRpc,
    genTreasury: (process.env.NEXT_PUBLIC_GEN_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_GENLAYER_TREASURY_ADDRESS || WORKIFY_NETWORK.genTreasury) as `0x${string}`,
    verifiers: {
      GITHUB_SOFTWARE: (process.env.NEXT_PUBLIC_GITHUB_VERIFIER_ADDRESS || WORKIFY_NETWORK.verifiers.GITHUB_SOFTWARE) as `0x${string}`,
      WEB_APPLICATION: (process.env.NEXT_PUBLIC_WEB_VERIFIER_ADDRESS || WORKIFY_NETWORK.verifiers.WEB_APPLICATION) as `0x${string}`,
      RESEARCH_DATA: (process.env.NEXT_PUBLIC_RESEARCH_VERIFIER_ADDRESS || WORKIFY_NETWORK.verifiers.RESEARCH_DATA) as `0x${string}`,
      CONTENT_DOCUMENT: (process.env.NEXT_PUBLIC_DOCUMENT_VERIFIER_ADDRESS || WORKIFY_NETWORK.verifiers.CONTENT_DOCUMENT) as `0x${string}`,
      DESIGN_CREATIVE: (process.env.NEXT_PUBLIC_DESIGN_VERIFIER_ADDRESS || WORKIFY_NETWORK.verifiers.DESIGN_CREATIVE) as `0x${string}`,
    },
  };
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
