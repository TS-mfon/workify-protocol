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
const account = createAccount(key);
const client = createClient({ chain: chains.studionet, account });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function withRpcRetry(operation, label) {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === 8) break;
      await sleep(Math.min(2_000 * attempt, 10_000));
      console.warn(`StudioNet RPC retry ${attempt}/7 while ${label}`);
    }
  }
  throw new Error(`StudioNet RPC unavailable while ${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function waitForDeployment(hash) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const receipt = await withRpcRetry(() => client.getTransaction({ hash }), `polling ${hash}`);
    const status = String(receipt.statusName || receipt.status_name || receipt.status || "");
    if (["CANCELED", "UNDETERMINED"].includes(status)) throw new Error(`StudioNet deployment ${status}: ${hash}`);
    if (status === "FINALIZED") {
      const executionResult = String(receipt.txExecutionResultName || receipt.executionResultName || receipt.txExecutionResult || receipt.result || "");
      const address = receipt.txDataDecoded?.contractAddress || receipt.data?.contract_address;
      if (/exit_code|error|failed|invalid_contract/iu.test(executionResult)) throw new Error(`StudioNet deployment execution failed (${executionResult}): ${hash}`);
      if (!address) throw new Error(`StudioNet deployment returned no contract address: ${hash}`);
      await withRpcRetry(() => client.getContractSchema(address), `validating ${address}`);
      return { hash, address };
    }
    await sleep(5_000);
  }
  throw new Error(`StudioNet deployment timed out: ${hash}`);
}

async function deploy(code, args) {
  const hash = await withRpcRetry(() => client.deployContract({ code, args }), "submitting deployment");
  return waitForDeployment(hash);
}

const treasuryAddress = process.env.STUDIO_NET_GEN_TREASURY_ADDRESS || "0x16B1F21b48c70c1f8Be5CB6287b1507d47303E27";
await withRpcRetry(() => client.getContractSchema(treasuryAddress), `validating treasury ${treasuryAddress}`);
const treasury = { address: treasuryAddress, hash: process.env.STUDIO_NET_GEN_TREASURY_TX_HASH || "0xb49a8d757d8f5924f7d6c903691d981f46b9b21068061db051d37369feda0a82" };
const verifierCode = await readFile("/home/sudodave/workify-protocol/contracts/genlayer/v8/WorkVerifierV8.py");
const manifest = { network: "studionet", version: 9, endpoint: "https://studio.genlayer.com/api", operator: account.address, treasury, verifiers: {} };
for (const [name, type, policyVersion] of [["github", "GITHUB_SOFTWARE", "github-software-v8.0"], ["web", "WEB_APPLICATION", "web-application-v8.0"], ["research", "RESEARCH_DATA", "research-data-v8.0"], ["document", "CONTENT_DOCUMENT", "content-document-v8.0"], ["design", "DESIGN_CREATIVE", "design-creative-v8.0"]]) {
  manifest.verifiers[name] = { ...(await deploy(verifierCode, [account.address, treasury.address, type, policyVersion])), policyVersion };
}
manifest.status = "DEPLOYED_AND_VALIDATED";
await mkdir("/home/sudodave/workify-protocol/deployments/genlayer-studionet", { recursive: true });
await writeFile("/home/sudodave/workify-protocol/deployments/genlayer-studionet/v9.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest));
