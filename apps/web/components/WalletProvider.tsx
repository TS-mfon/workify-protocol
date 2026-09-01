"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
declare global { interface Window { ethereum?: Provider } }

type WalletContextValue = {
  account: `0x${string}` | undefined;
  connecting: boolean;
  error: string;
  connect(): Promise<void>;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<`0x${string}`>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const connect = useCallback(async () => {
    try {
      setConnecting(true);
      setError("");
      if (!window.ethereum) throw new Error("Install an EVM wallet to continue");
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] }).catch(async () => window.ethereum!.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x14a34", chainName: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://sepolia.base.org"], blockExplorerUrls: ["https://sepolia.basescan.org"] }] }));
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as `0x${string}`[];
      setAccount(accounts[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then((accounts) => setAccount((accounts as `0x${string}`[])[0])).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ account, connecting, error, connect }), [account, connect, connecting, error]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
