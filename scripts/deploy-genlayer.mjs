import { readFile, writeFile } from "node:fs/promises";
import { createAccount, createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";

const key = process.env.GENLAYER_OPERATOR_PRIVATE_KEY;
const endpoint = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL;
if (!key || !endpoint) throw new Error("GENLAYER_OPERATOR_PRIVATE_KEY and NEXT_PUBLIC_GENLAYER_RPC_URL are required");
const account = createAccount(key);
const client = createClient({ endpoint, account });
const runner = "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6";

async function source(name) {
  const code = await readFile(new URL(`../contracts/genlayer/v1/${name}.py`, import.meta.url), "utf8");
  if (!code.startsWith(`# { "Depends": "${runner}" }`)) throw new Error(`${name} runner mismatch`);
  return code;
}
async function deploy(name, args) {
  const hash = await client.deployContract({ code: await source(name), args });
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 3_000, retries: 120 });
  const leader = receipt.consensus_data?.leader_receipt?.[0];
  if (leader?.execution_result !== "SUCCESS" || leader.result?.status !== "return") throw new Error(`${name} deployment execution failed: ${hash}`);
  const address = receipt.txDataDecoded?.contractAddress ?? receipt.tx_data_decoded?.contractAddress ?? receipt.data?.contractAddress;
  if (!address) throw new Error(`${name} deployment address missing`);
  return { address, hash };
}

const owner = process.env.TREASURY_OWNER ?? "0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E";
const treasury = await deploy("GenTreasuryV1", [owner]);
const policies = [
  ["github", "GITHUB_SOFTWARE", "github-software-v1.0"],
  ["web", "WEB_APPLICATION", "web-application-v1.0"],
  ["research", "RESEARCH_DATA", "research-data-v1.0"],
  ["document", "CONTENT_DOCUMENT", "content-document-v1.0"],
  ["design", "DESIGN_CREATIVE", "design-creative-v1.0"],
];
const verifiers = {};
for (const [keyName, workType, policy] of policies) verifiers[keyName] = await deploy("WorkVerifierV1", [account.address, workType, policy]);
await writeFile(new URL("../deployments/genlayer-bradbury/v1.json", import.meta.url), `${JSON.stringify({ network: "testnet-bradbury", endpoint, runner, operator: account.address, treasury, verifiers, deployedAt: new Date().toISOString() }, null, 2)}\n`);
