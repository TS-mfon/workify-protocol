import { getGenLayerNetworkConfig } from "@workify/evidence-engine";
import { createClient } from "genlayer-js";
import { NextResponse } from "next/server";

const requiredVerifierMethods = ["get_policy", "get_payment", "get_verdict", "verify"];

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("network");
  const network = requested === "studionet" ? "studionet" : "bradbury";
  const config = getGenLayerNetworkConfig(network);
  try {
    if (Object.values(config.verifiers).some((address) => !address)) throw new Error("Direct verifier deployment addresses are incomplete");
    const client = createClient({ chain: config.chain });
    for (const address of Object.values(config.verifiers)) {
      const schema = await client.getContractSchema(address);
      const methods = Object.keys(schema.methods || {});
      if (!requiredVerifierMethods.every((method) => methods.includes(method))) throw new Error(`Verifier ${address} is incompatible`);
    }
    return NextResponse.json({
      network,
      ready: true,
      treasury: null,
      verifierAddresses: config.verifiers,
      feePolicy: { verificationWei: config.verificationFee.toString(), appealWei: config.appealFee.toString(), gasless: config.gasless },
      checkedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch (error) {
    return NextResponse.json({
      network,
      ready: false,
      failureCode: "GENLAYER_DEPLOYMENT_UNAVAILABLE",
      error: network === "studionet" ? "StudioNet is temporarily unavailable. Select Bradbury or retry shortly." : "Bradbury is temporarily unavailable. Retry shortly.",
      detail: error instanceof Error ? error.message : "Health validation failed",
      checkedAt: new Date().toISOString(),
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
