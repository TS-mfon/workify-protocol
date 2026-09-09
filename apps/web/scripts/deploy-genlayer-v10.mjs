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
const network = process.env.GENLAYER_DEPLOY_NETWORK === "studionet" ? "studionet" : "bradbury";
const chain = network === "studionet" ? chains.studionet : chains.testnetBradbury;
const account = createAccount(key);
const client = createClient({ chain, account });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const fees = network === "studionet" ? [0n, 0n] : [100000000000000000n, 1000000000000000000n];

async function waitForDeployment(hash) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const receipt = await client.getTransaction({ hash });
    const status = String(receipt.statusName || receipt.status_name || receipt.status || "");
    if (["CANCELED", "UNDETERMINED"].includes(status)) throw new Error(`Deployment ${status}: ${hash}`);
    if (status === "FINALIZED") {
      const result = String(receipt.txExecutionResultName || receipt.executionResultName || receipt.txExecutionResult || receipt.result || "");
      if (/error|failed|invalid_contract/iu.test(result)) throw new Error(`Deployment execution failed (${result}): ${hash}`);
      const address = receipt.txDataDecoded?.contractAddress || receipt.data?.contract_address;
      if (!address) throw new Error(`Deployment returned no contract address: ${hash}`);
      await client.getContractSchema(address);
      return { hash, address };
    }
    await sleep(5000);
  }
  throw new Error(`Deployment timed out: ${hash}`);
}

async function deploy(code, args) {
  return waitForDeployment(await client.deployContract({ code, args }));
}

const verifierCode = await readFile("/home/sudodave/workify-protocol/contracts/genlayer/v10/WorkVerifierV10.py");
const manifest = { network, version: 10, endpoint: network === "studionet" ? "https://studio.genlayer.com/api" : "https://rpc-bradbury.genlayer.com", operator: account.address, feePolicy: { verificationWei: String(fees[0]), appealWei: String(fees[1]), gasless: network === "studionet" }, verifiers: {} };
for (const [name, type, policyVersion] of [["github", "GITHUB_SOFTWARE", "github-software-v10.0"], ["web", "WEB_APPLICATION", "web-application-v10.0"], ["research", "RESEARCH_DATA", "research-data-v10.0"], ["document", "CONTENT_DOCUMENT", "content-document-v10.0"], ["design", "DESIGN_CREATIVE", "design-creative-v10.0"]]) {
  manifest.verifiers[name] = { ...(await deploy(verifierCode, [account.address, account.address, type, policyVersion, fees[0], fees[1]])), policyVersion };
}
manifest.status = "DEPLOYED_AND_VALIDATED";
await mkdir(`/home/sudodave/workify-protocol/deployments/genlayer-${network}`, { recursive: true });
await writeFile(`/home/sudodave/workify-protocol/deployments/genlayer-${network}/v10-direct.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest));
