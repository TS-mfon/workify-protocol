"use client";
import { useEffect, useState } from "react";

declare global { interface Window { ethereum?: { request(args:{method:string;params?:unknown[]}):Promise<unknown> } } }

export function WalletButton({ onAccount }: { onAccount?: (account: `0x${string}`) => void }) {
  const [account,setAccount]=useState<`0x${string}`>(); const [error,setError]=useState("");
  useEffect(()=>{if(account)onAccount?.(account)},[account,onAccount]);
  async function connect(){try{setError("");if(!window.ethereum)throw new Error("Install an EVM wallet to continue");await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x14a34"}]}).catch(async()=>window.ethereum!.request({method:"wallet_addEthereumChain",params:[{chainId:"0x14a34",chainName:"Base Sepolia",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:["https://sepolia.base.org"],blockExplorerUrls:["https://sepolia.basescan.org"]}]}));const accounts=await window.ethereum.request({method:"eth_requestAccounts"}) as `0x${string}`[];setAccount(accounts[0])}catch(cause){setError(cause instanceof Error?cause.message:"Wallet connection failed")}}
  return <div><button className="button" type="button" onClick={connect}>{account?`${account.slice(0,6)}…${account.slice(-4)}`:"Connect wallet"}</button>{error&&<p style={{color:"var(--red)",fontSize:12}}>{error}</p>}</div>;
}
