export type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

export const BASE_SEPOLIA_CHAIN_ID = "0x14a34";
export const BASE_SEPOLIA_CHAIN_PARAMS = {
  chainId: BASE_SEPOLIA_CHAIN_ID,
  chainName: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://sepolia.base.org"],
  blockExplorerUrls: ["https://sepolia.basescan.org"],
} as const;

export async function switchToBaseSepolia(provider: Eip1193Provider) {
  const current = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (current === BASE_SEPOLIA_CHAIN_ID) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }] });
  } catch (error) {
    if ((error as { code?: number })?.code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [BASE_SEPOLIA_CHAIN_PARAMS] });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }] });
  }
  const confirmed = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (confirmed !== BASE_SEPOLIA_CHAIN_ID) throw new Error("Wallet is not on Base Sepolia. Switch to Base Sepolia before signing this transaction.");
}

export function formatNetworkError(error: unknown, action: string) {
  const code = (error as { code?: number })?.code;
  const message = String((error as { message?: string })?.message || error || "");
  if (code === 4001 || /user rejected|denied/iu.test(message)) return "Network switch or signature rejected. No transaction was sent.";
  if (/chain|network|switch/iu.test(message)) return `Could not switch to Base Sepolia before ${action}. No transaction was sent.`;
  return message || `${action} failed before the Base Sepolia transaction was submitted.`;
}
