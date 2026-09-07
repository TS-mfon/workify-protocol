"use client";

import { useEffect, useState } from "react";

type Network = "bradbury" | "studionet";

export function GenLayerNetworkSelector() {
  const [network, setNetwork] = useState<Network>(() => {
    if (typeof window === "undefined") return "bradbury";
    return window.localStorage.getItem("workify-genlayer-network") === "studionet" ? "studionet" : "bradbury";
  });
  const [studioReady, setStudioReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/genlayer/health?network=studionet", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!active) return;
        const ready = ok && body.ready === true;
        setStudioReady(ready);
        if (!ready && network === "studionet") {
          setNetwork("bradbury");
          window.localStorage.setItem("workify-genlayer-network", "bradbury");
          document.cookie = "workify-genlayer-network=bradbury; Path=/; SameSite=Lax";
        }
      })
      .catch(() => { if (active) setStudioReady(false); });
    return () => { active = false; };
  }, [network]);

  function change(value: Network) {
    if (value === "studionet" && !studioReady) return;
    setNetwork(value);
    window.localStorage.setItem("workify-genlayer-network", value);
    document.cookie = `workify-genlayer-network=${value}; Path=/; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent("workify-genlayer-network-change", { detail: value }));
  }

  return <label className="network-selector"><span>Adjudication</span><select aria-label="GenLayer adjudication network" value={network} onChange={(event) => change(event.target.value as Network)}><option value="bradbury">Bradbury</option><option value="studionet" disabled={!studioReady}>StudioNet{studioReady ? "" : " · checking"}</option></select></label>;
}
