"use client";

import { useEffect, useState } from "react";

type Network = "studionet";

export function GenLayerNetworkSelector() {
  const [network, setNetwork] = useState<Network>(() => {
    return "studionet";
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
        window.localStorage.setItem("workify-genlayer-network", "studionet");
        document.cookie = "workify-genlayer-network=studionet; Path=/; SameSite=Lax";
      })
      .catch(() => { if (active) setStudioReady(false); });
    return () => { active = false; };
  }, [network]);

  function change(value: Network) {
    if (!studioReady) return;
    setNetwork(value);
    window.localStorage.setItem("workify-genlayer-network", value);
    document.cookie = `workify-genlayer-network=${value}; Path=/; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent("workify-genlayer-network-change", { detail: value }));
  }

  return <label className="network-selector"><span>Adjudication</span><select aria-label="GenLayer adjudication network" value={network} onChange={(event) => change(event.target.value as Network)} disabled={!studioReady}><option value="studionet">StudioNet V11{studioReady ? " · zero fee" : " · checking"}</option></select></label>;
}
