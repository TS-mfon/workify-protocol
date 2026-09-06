"use client";

import { useState } from "react";

type Network = "bradbury" | "studionet";

export function GenLayerNetworkSelector() {
  const [network, setNetwork] = useState<Network>(() => {
    if (typeof window === "undefined") return "bradbury";
    return window.localStorage.getItem("workify-genlayer-network") === "studionet" ? "studionet" : "bradbury";
  });
  const studioReady = [
    process.env.NEXT_PUBLIC_STUDIO_NET_GEN_TREASURY_ADDRESS,
    process.env.NEXT_PUBLIC_STUDIO_NET_GITHUB_VERIFIER_ADDRESS,
    process.env.NEXT_PUBLIC_STUDIO_NET_WEB_VERIFIER_ADDRESS,
    process.env.NEXT_PUBLIC_STUDIO_NET_RESEARCH_VERIFIER_ADDRESS,
    process.env.NEXT_PUBLIC_STUDIO_NET_DOCUMENT_VERIFIER_ADDRESS,
    process.env.NEXT_PUBLIC_STUDIO_NET_DESIGN_VERIFIER_ADDRESS,
  ].every(Boolean);

  function change(value: Network) {
    if (value === "studionet" && !studioReady) return;
    setNetwork(value);
    window.localStorage.setItem("workify-genlayer-network", value);
    document.cookie = `workify-genlayer-network=${value}; Path=/; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent("workify-genlayer-network-change", { detail: value }));
    window.location.reload();
  }

  return <label className="network-selector"><span>Adjudication</span><select aria-label="GenLayer adjudication network" value={network} onChange={(event) => change(event.target.value as Network)}><option value="bradbury">Bradbury</option><option value="studionet" disabled={!studioReady}>StudioNet{studioReady ? "" : " · unavailable"}</option></select></label>;
}
