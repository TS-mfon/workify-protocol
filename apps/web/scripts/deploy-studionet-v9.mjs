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

async function deploy(code, args) {
  const hash = await client.deployContract({ code, args });
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const receipt = await client.getTransaction({ hash });
    const status = String(receipt.statusName || receipt.status_name || receipt.status || "");
    const execution = String(receipt.txExecutionResultName || receipt.executionResultName || receipt.txExecutionResult || "");
    if (["CANCELED", "UNDETERMINED"].includes(status)) throw new Error(`StudioNet deployment ${status}: ${hash}`);
    if (["ACCEPTED", "FINALIZED"].includes(status) && (execution === "FINISHED_WITH_RETURN" || execution === "1")) {
      const address = receipt.txDataDecoded?.contractAddress;
      if (!address) throw new Error(`StudioNet deployment returned no contract address: ${hash}`);
      return { hash, address };
    }
    await sleep(5_000);
  }
  throw new Error(`StudioNet deployment timed out: ${hash}`);
}

const treasuryCode = await readFile("/home/sudodave/workify-protocol/contracts/genlayer/v1/GenTreasuryV1.py");
const verifierCode = await readFile("/home/sudodave/workify-protocol/contracts/genlayer/v8/WorkVerifierV8.py");
const treasury = await deploy(treasuryCode, [account.address]);
const manifest = { network: "studionet", version: 9, operator: account.address, treasury, verifiers: {} };
for (const [name, type, policyVersion] of [["github", "GITHUB_SOFTWARE", "github-software-v8.0"], ["web", "WEB_APPLICATION", "web-application-v8.0"], ["research", "RESEARCH_DATA", "research-data-v8.0"], ["document", "CONTENT_DOCUMENT", "content-document-v8.0"], ["design", "DESIGN_CREATIVE", "design-creative-v8.0"]]) {
  manifest.verifiers[name] = { ...(await deploy(verifierCode, [account.address, treasury.address, type, policyVersion])), policyVersion };
}
manifest.status = "DEPLOYED";
await mkdir("/home/sudodave/workify-protocol/deployments/genlayer-studionet", { recursive: true });
await writeFile("/home/sudodave/workify-protocol/deployments/genlayer-studionet/v9.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest));
