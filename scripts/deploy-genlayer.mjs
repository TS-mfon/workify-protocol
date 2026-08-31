import { readFile, writeFile } from "node:fs/promises";
import { chains, createAccount, createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";

const key = process.env.GENLAYER_OPERATOR_PRIVATE_KEY;
const endpoint = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL;
if (!key || !endpoint) throw new Error("GENLAYER_OPERATOR_PRIVATE_KEY and NEXT_PUBLIC_GENLAYER_RPC_URL are required");
const account = createAccount(key);
const client = createClient({ chain: chains.testnetBradbury, endpoint, account });
const runner = "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6";
const manifestUrl = new URL("../deployments/genlayer-bradbury/v1.json", import.meta.url);

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestUrl, "utf8"));
  } catch {
    return {};
  }
}

async function saveManifest(manifest) {
  await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function source(name) {
  const code = await readFile(new URL(`../contracts/genlayer/v1/${name}.py`, import.meta.url), "utf8");
  if (!code.startsWith(`# { "Depends": "${runner}" }`)) throw new Error(`${name} runner mismatch`);
  return code;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function submitDeployment(name, args) {
  for (let retry = 0; retry < 8; retry += 1) {
    try {
      return await client.deployContract({ code: await source(name), args });
    } catch (error) {
      const retryAfter = Number(error?.cause?.data?.retryAfterMs ?? 0);
      const retryable = error?.code === -32005 || String(error?.message).includes("rate limit");
      if (!retryable || retry === 7) throw error;
      await sleep(Math.max(retryAfter, 500) + retry * 500);
    }
  }
  throw new Error(`${name} deployment retry limit reached`);
}

async function deploy(name, args) {
  const hash = await submitDeployment(name, args);
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, interval: 3_000, retries: 180 });
  const leader = receipt.consensus_data?.leader_receipt?.[0];
  const executionSucceeded =
    receipt.txExecutionResultName === "FINISHED_WITH_RETURN" ||
    (leader?.execution_result === "SUCCESS" && leader.result?.status === "return");
  if (!executionSucceeded) throw new Error(`${name} deployment execution failed: ${hash}`);
  const address = receipt.txDataDecoded?.contractAddress ?? receipt.tx_data_decoded?.contractAddress ?? receipt.data?.contractAddress;
  if (!address) throw new Error(`${name} deployment address missing`);
  return { address, hash, status: "ACCEPTED" };
}

const owner = process.env.TREASURY_OWNER ?? "0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E";
const existingManifest = await readManifest();
const manifest = {
  ...existingManifest,
  network: "testnet-bradbury",
  status: "DEPLOYING",
  endpoint,
  runner,
  operator: account.address,
  treasuryOwner: owner,
  verifiers: existingManifest.verifiers ?? {},
};
await saveManifest(manifest);

if (!manifest.treasury?.address) {
  manifest.treasury = await deploy("GenTreasuryV1", [owner]);
  await saveManifest(manifest);
}
const policies = [
  ["github", "GITHUB_SOFTWARE", "github-software-v1.0"],
  ["web", "WEB_APPLICATION", "web-application-v1.0"],
  ["research", "RESEARCH_DATA", "research-data-v1.0"],
  ["document", "CONTENT_DOCUMENT", "content-document-v1.0"],
  ["design", "DESIGN_CREATIVE", "design-creative-v1.0"],
];
for (const [keyName, workType, policy] of policies) {
  if (manifest.verifiers[keyName]?.address) continue;
  manifest.verifiers[keyName] = await deploy("WorkVerifierV1", [account.address, workType, policy]);
  await saveManifest(manifest);
}
manifest.status = "DEPLOYED_AWAITING_FINALITY";
manifest.submittedAt = new Date().toISOString();
await saveManifest(manifest);
