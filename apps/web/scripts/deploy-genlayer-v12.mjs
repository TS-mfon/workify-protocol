import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chains, createAccount, createClient } from "genlayer-js";

for (const path of ["/home/sudodave/workify-protocol/.env.local", "/home/sudodave/workify-protocol/.env.build"]) {
  try {
    const contents = await readFile(path, "utf8");
    for (const line of contents.split(/\r?\n/u)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
      const privateKey = line.match(/private key:\s*(0x[a-fA-F0-9]{64})/u);
      if (privateKey && !process.env.GENLAYER_OPERATOR_PRIVATE_KEY) process.env.GENLAYER_OPERATOR_PRIVATE_KEY = privateKey[1];
    }
  } catch { }
}

const key = process.env.GENLAYER_OPERATOR_PRIVATE_KEY;
if (!key) throw new Error("GENLAYER_OPERATOR_PRIVATE_KEY is required");
const network = "studionet";
const account = createAccount(key);
const endpoint = process.env.STUDIO_NET_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
const client = createClient({ chain: chains.studionet, endpoint, account });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const outputPath = "/home/sudodave/workify-protocol/deployments/genlayer-studionet/v12-direct.json";

async function checkpoint(manifest) {
  await mkdir("/home/sudodave/workify-protocol/deployments/genlayer-studionet", { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function waitForDeployment(hash) {
  console.log(`submitted ${hash}`);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    let receipt;
    try { receipt = await client.getTransaction({ hash }); }
    catch (error) { console.warn(`poll ${attempt + 1}/180 failed: ${error instanceof Error ? error.message : String(error)}`); await sleep(Math.min(5000 + attempt * 250, 15000)); continue; }
    const status = String(receipt.statusName || receipt.status_name || receipt.status || "").toUpperCase();
    if (["CANCELED", "UNDETERMINED"].includes(status)) throw new Error(`Deployment ${status}: ${hash}`);
    if (status === "FINALIZED") {
      const execution = String(receipt.txExecutionResultName || receipt.executionResultName || receipt.txExecutionResult || "").toUpperCase();
      if (/ERROR|FAILED|INVALID_CONTRACT/u.test(execution)) throw new Error(`Deployment execution failed (${execution}): ${hash}`);
      const address = receipt.txDataDecoded?.contractAddress || receipt.data?.contract_address;
      if (!address) throw new Error(`Deployment returned no contract address: ${hash}`);
      for (let schemaAttempt = 0; schemaAttempt < 12; schemaAttempt += 1) {
        try { await client.getContractSchema(address); return { hash, address }; }
        catch (error) { if (schemaAttempt === 11) throw error; await sleep(5000); }
      }
    }
    await sleep(5000);
  }
  throw new Error(`Deployment timed out: ${hash}`);
}

const code = await readFile("/home/sudodave/workify-protocol/contracts/genlayer/v12/WorkVerifierV12.py");
let manifest;
try { const existing = JSON.parse(await readFile(outputPath, "utf8")); manifest = existing.version === 12 && existing.operator?.toLowerCase() === account.address.toLowerCase() ? existing : undefined; } catch { }
manifest ||= { network, version: 12, endpoint, operator: account.address, feePolicy: { verificationWei: "0", appealWei: "0", gasless: true }, verifiers: {}, status: "DEPLOYING" };
await checkpoint(manifest);
for (const [name, type, policyVersion] of [["github", "GITHUB_SOFTWARE", "github-software-v12.0"], ["web", "WEB_APPLICATION", "web-application-v12.0"], ["research", "RESEARCH_DATA", "research-data-v12.0"], ["document", "CONTENT_DOCUMENT", "content-document-v12.0"], ["design", "DESIGN_CREATIVE", "design-creative-v12.0"]]) {
  if (manifest.verifiers[name]?.address) { await client.getContractSchema(manifest.verifiers[name].address); continue; }
  const hash = await client.deployContract({ code, args: [account.address, account.address, type, policyVersion, 0n, 0n] });
  manifest.verifiers[name] = { ...(await waitForDeployment(hash)), policyVersion };
  await checkpoint(manifest);
}
manifest.status = "DEPLOYED_AND_VALIDATED";
await checkpoint(manifest);
console.log(JSON.stringify(manifest));
