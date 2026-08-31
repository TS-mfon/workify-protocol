import { readFile, writeFile } from "node:fs/promises";
import { chains, createAccount, createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";

const key = process.env.GENLAYER_OPERATOR_PRIVATE_KEY;
if (!key) throw new Error("GENLAYER_OPERATOR_PRIVATE_KEY is required");
const endpoint = "https://rpc-bradbury.genlayer.com";
const account = createAccount(key);
const client = createClient({ chain: chains.testnetBradbury, endpoint, account });
const version = 7;
const code = await readFile(new URL(`../contracts/genlayer/v${version}/WorkVerifierV${version}.py`, import.meta.url), "utf8");
const manifestUrl = new URL(`../deployments/genlayer-bradbury/v${version}.json`, import.meta.url);
let manifest;
try { manifest = JSON.parse(await readFile(manifestUrl, "utf8")); } catch { manifest = { network: "testnet-bradbury", version, endpoint, operator: account.address, verifiers: {} }; }
const policies = [
  ["github", "GITHUB_SOFTWARE", `github-software-v${version}.0`],
  ["web", "WEB_APPLICATION", `web-application-v${version}.0`],
  ["research", "RESEARCH_DATA", `research-data-v${version}.0`],
  ["document", "CONTENT_DOCUMENT", `content-document-v${version}.0`],
  ["design", "DESIGN_CREATIVE", `design-creative-v${version}.0`],
];
const requested = new Set((process.env.WORKIFY_V7_POLICIES ?? "github").split(","));
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

for (const [name, workType, policyVersion] of policies) {
  if (!requested.has(name) || manifest.verifiers[name]?.address) continue;
  let hash;
  for (let retry = 0; retry < 8; retry += 1) {
    try { hash = await client.deployContract({ code, args: [account.address, workType, policyVersion] }); break; }
    catch (error) { if (retry === 7) throw error; await sleep(2_000 + retry * 1_000); }
  }
  manifest.verifiers[name] = { hash, status: "SUBMITTED", policyVersion };
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + "\n");
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, interval: 5_000, retries: 180 });
  if (receipt.resultName !== "AGREE" || receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") throw new Error(`${name} v7 deployment failed`);
  manifest.verifiers[name] = { address: receipt.txDataDecoded?.contractAddress, hash, status: receipt.statusName, policyVersion };
  manifest.status = "DEPLOYED_AWAITING_FINALITY";
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + "\n");
}
