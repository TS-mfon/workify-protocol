"use client";

import { useEffect } from "react";
import { Check, LoaderCircle, Wallet } from "lucide-react";
import { useWallet } from "./WalletProvider";

export function WalletButton({ onAccount, compact = false }: { onAccount?: (account: `0x${string}`) => void; compact?: boolean }) {
  const { account, connect, connecting, error } = useWallet();
  useEffect(() => { if (account) onAccount?.(account); }, [account, onAccount]);
  return <div className="wallet-control"><button className={account ? "wallet-button connected" : "wallet-button"} type="button" onClick={connect} disabled={connecting}>{connecting ? <LoaderCircle className="spin" size={17} /> : account ? <Check size={17} /> : <Wallet size={17} />}<span>{account ? `${account.slice(0, 6)}…${account.slice(-4)}` : compact ? "Connect" : "Connect wallet"}</span></button>{error && !compact && <span className="wallet-error">{error}</span>}</div>;
}
