import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, keccak256, parseAbi, parseUnits, stringToHex } from "viem";
import { baseSepolia } from "viem/chains";
import { chains, createAccount, createClient } from "genlayer-js";

const root = new URL("../../..", import.meta.url);
const envFile = await readFile(new URL(".env.local", root), "utf8");
for (const line of envFile.split(/\r?\n/u)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const walletFile = JSON.parse(await readFile(new URL(".workify-secrets/base-automation-wallet.json", root), "utf8"))[0];
process.env.BASE_AUTOMATION_PRIVATE_KEY ||= walletFile.private_key;
process.env.WORKIFY_EIP712_VERSION ||= "2";

const escrow = process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS || "0xCfc6B780CDe6f8e8b377f63E921B342ee9557294";
const usdc = process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const genTreasury = process.env.NEXT_PUBLIC_GENLAYER_TREASURY_ADDRESS || "0x46E31E4161AC0F4EeC33c585F752DAd13646Ee05";
const verifier = process.env.NEXT_PUBLIC_WEB_VERIFIER_ADDRESS || "0x9C3267313635606bAf70Eb9edCc115e2958026Dd";
const policyVersion = "web-application-v8.0";
const baseRpc = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const genRpc = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://rpc-bradbury.genlayer.com";
const clientAccount = privateKeyToAccount(process.env.GENLAYER_OPERATOR_PRIVATE_KEY);
const workerAccount = privateKeyToAccount(process.env.BASE_AUTOMATION_PRIVATE_KEY);
const base = createPublicClient({ chain: baseSepolia, transport: http(baseRpc) });
const clientWallet = createWalletClient({ account: clientAccount, chain: baseSepolia, transport: http(baseRpc) });
const workerWallet = createWalletClient({ account: workerAccount, chain: baseSepolia, transport: http(baseRpc) });
const gen = createClient({ chain: chains.testnetBradbury, endpoint: genRpc, account: createAccount(process.env.GENLAYER_OPERATOR_PRIVATE_KEY) });
const erc20 = parseAbi(["function approve(address spender,uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const escrowAbi = parseAbi([
  "function createFundedJob(bytes32,address,uint128,uint64,bytes32,bytes32)",
  "function submitOrReplaceDelivery(bytes32,bytes32)",
  "function lockDelivery(bytes32)",
  "function requestVerification(bytes32,bool)",
  "function importFinalVerdict((bytes32 jobId,bytes32 verifierId,bytes32 genlayerTxHash,uint8 attempt,bytes32 specificationHash,bytes32 evidenceHash,bytes32 policyHash,uint8 decision,uint16 payoutBps,bytes32 resultHash,uint256 nonce,bool appeal),bytes)",
  "function recordAttemptOutcome((bytes32 jobId,bytes32 verifierId,bytes32 genlayerTxHash,uint8 attempt,bytes32 evidenceHash,bytes32 policyHash,uint8 outcome,uint256 nonce,bool appeal),bytes)",
  "function expireRetryWindow(bytes32)",
  "function refundExpiredJob(bytes32)",
  "function settle(bytes32)",
  "function getJob(bytes32) view returns ((address client,address worker,uint128 reward,uint64 createdAt,uint64 deliveryDeadline,uint64 retryDeadline,uint64 verdictAt,uint64 appealDeadline,uint64 appealFundingDeadline,uint32 deliveryVersion,uint8 attempts,uint8 appealAttempts,uint16 payoutBps,uint8 status,uint8 decision,bytes32 specificationHash,bytes32 evidenceHash,bytes32 policyHash,bytes32 resultHash,bytes32 verifierId,bytes32 genlayerTxHash,bytes32 appealPaymentTxHash,address appellant,uint8 verdictAttempt,bool verdictAppeal,bool appealFunded))",
]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const receipt = async (hash) => base.waitForTransactionReceipt({ hash });
const readJob = async (jobId) => {
  try {
    return await base.readContract({ address: escrow, abi: escrowAbi, functionName: "getJob", args: [jobId] });
  } catch (error) {
    if (String(error?.message || error).includes("execution reverted")) return null;
    throw error;
  }
};
const readJobUntil = async (jobId, attempts = 12) => {
  for (let index = 0; index < attempts; index += 1) {
    const job = await readJob(jobId);
    if (job) return job;
    await sleep(2_000);
  }
  return null;
};
const waitForStatus = async (jobId, expectedStatus, attempts = 12) => {
  for (let index = 0; index < attempts; index += 1) {
    const job = await readJob(jobId);
    if (job && Number(job.status ?? job[13]) === expectedStatus) return job;
    await sleep(2_000);
  }
  return readJob(jobId);
};
const waitForDelivery = async (jobId, evidenceHash, attempts = 12) => {
  for (let index = 0; index < attempts; index += 1) {
    const job = await readJob(jobId);
    if (job && Number(job.status ?? job[13]) === 1 && String(job.evidenceHash ?? job[16]).toLowerCase() === `0x${evidenceHash}`.toLowerCase()) return job;
    await sleep(2_000);
  }
  return readJob(jobId);
};
const sortValue = (value) => Array.isArray(value) ? value.map(sortValue) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortValue(child)])) : value;
const canonical = (value) => JSON.stringify(sortValue(value));
const canonicalHash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const textHash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const sha256 = async (text) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).toString("hex");
const rawBase = "https://raw.githubusercontent.com/TS-mfon/workify-protocol/main/apps/web/public/verification-fixtures/showcase";

async function preparePlan() {
  const directory = new URL("../public/verification-fixtures/showcase/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const plan = [];
  for (let index = 1; index <= 5; index += 1) {
    const jobId = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
    const id = String(index).padStart(2, "0");
    const sourcePath = `case-${id}-source.txt`;
    const specification = { version: "1.0.0", title: `Live web verification case ${index}`, description: "A real Workify showcase job with a public, reproducible web delivery.", workType: "WEB_APPLICATION", deliverables: ["Public deployment evidence"], criteria: [{ id: "C-001", requirement: "The requested public delivery is clearly documented", severity: "CRITICAL", verificationMethod: "source-grounded", evidenceRequired: ["PUBLIC_SOURCE"], passCondition: "The source directly describes the delivered public work", failureCondition: "The source contradicts or omits the delivery" }, { id: "C-002", requirement: "The delivery includes reproducible validation information", severity: "HIGH", verificationMethod: "source-grounded", evidenceRequired: ["PUBLIC_SOURCE"], passCondition: "A reviewer can reproduce the stated validation from the public source", failureCondition: "Validation is unsupported or not reproducible" }], authorizedSources: [`${rawBase}/${sourcePath}`], exclusions: [], policyVersion };
    const source = `Workify real showcase case ${index}.\nThe public delivery is a functional web application demonstration.\nValidation: the route loads, the primary interaction is described, and the result is reproducible from this source.\n`;
    const artifact = { id: `SOURCE-${id}`, type: "DOCUMENT", url: `${rawBase}/${sourcePath}`, canonicalUrl: `${rawBase}/${sourcePath}`, sha256: await sha256(source), mimeType: "text/plain", sizeBytes: Buffer.byteLength(source), metadata: { liveShowcase: true, case: index } };
    const evidence = { version: "1.0.0", jobId, deliveryVersion: 1, submittedAt: new Date().toISOString(), artifacts: [artifact] };
    const specificationText = canonical(specification);
    const evidenceText = canonical(evidence);
    await writeFile(new URL(sourcePath, directory), source);
    await writeFile(new URL(`case-${id}-specification.json`, directory), specificationText);
    await writeFile(new URL(`case-${id}-evidence.json`, directory), evidenceText);
    plan.push({ index, jobId, specification, evidence, specificationHash: textHash(specificationText), evidenceHash: textHash(evidenceText) });
  }
  await writeFile(new URL("../../../fixtures/live-results/showcase-plan.json", import.meta.url), JSON.stringify(plan, null, 2) + "\n");
  console.log(`Prepared ${plan.length} real showcase manifests. Publish these files before executing.`);
}

async function waitGen(hash, terminal = ["FINALIZED"]) {
  let consecutiveReceiptErrors = 0;
  for (let i = 0; i < 180; i += 1) {
    try {
      const item = await gen.getTransaction({ hash });
      consecutiveReceiptErrors = 0;
      if (terminal.includes(String(item.statusName))) return item;
      if (["ACCEPTED", "READY_TO_FINALIZE", "PROPOSING", "COMMITTING", "REVEALING"].includes(String(item.statusName))) {
        await sleep(10_000);
        continue;
      }
      if (["VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"].includes(String(item.statusName))) {
        return { ...item, statusName: "UNDETERMINED", networkStatusName: item.statusName };
      }
      if (String(item.statusName) === "UNDETERMINED") return item;
      if (String(item.statusName) === "CANCELED") throw new Error(`GenLayer ${hash} ended ${item.statusName}`);
    } catch (error) {
      if (String(error?.message).includes("ended ")) throw error;
      consecutiveReceiptErrors += 1;
      if (consecutiveReceiptErrors >= 3 && String(error?.message || error).includes("execution reverted")) {
        return { statusName: "UNDETERMINED", networkStatusName: "RECEIPT_UNAVAILABLE" };
      }
      console.error(`GenLayer poll retry ${i + 1}/180: ${String(error?.shortMessage || error?.message).slice(0, 180)}`);
    }
    await sleep(10_000);
  }
  throw new Error(`Timed out waiting for GenLayer transaction ${hash}`);
}

async function main() {
  if (process.argv.includes("--prepare")) return preparePlan();
  if (!process.env.GENLAYER_OPERATOR_PRIVATE_KEY || !process.env.VERDICT_ATTESTOR_PRIVATE_KEY || !process.env.MONGODB_URI) throw new Error("Missing real GenLayer attestor/operator or MongoDB configuration");
  const require = createRequire(new URL("../../../packages/evidence-engine/package.json", import.meta.url));
  const { MongoClient } = require("mongodb");
  let mongo;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      mongo = await new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000, connectTimeoutMS: 15_000, family: 4 }).connect();
      break;
    } catch (error) {
      if (attempt === 8) throw error;
      console.error(`MongoDB connection retry ${attempt}/8: ${String(error?.message || error).slice(0, 180)}`);
      await sleep(3_000);
    }
  }
  const database = mongo.db(process.env.MONGODB_DATABASE || "workify");
  const reward = parseUnits("0.25", 6);
  const approval = reward * 5n;
  const usdcBalance = await base.readContract({ address: usdc, abi: erc20, functionName: "balanceOf", args: [clientAccount.address] });
  if (usdcBalance < approval) throw new Error(`Client USDC balance ${usdcBalance} is below required ${approval}`);
  const approvalHash = await clientWallet.writeContract({ address: usdc, abi: erc20, functionName: "approve", args: [escrow, approval] });
  await receipt(approvalHash);
  const plan = JSON.parse(await readFile(new URL("../../../fixtures/live-results/showcase-plan.json", import.meta.url), "utf8"));
  const stateUrl = new URL("../../../fixtures/live-results/showcase-run.json", import.meta.url);
  let state = {};
  try { state = JSON.parse(await readFile(stateUrl, "utf8")); } catch {}
  const records = state.records || [];
  for (const item of plan) {
    const { index, jobId, specification, evidence } = item;
    const id = String(index).padStart(2, "0");
    const evidenceHash = item.evidenceHash || canonicalHash(evidence);
    const specHash = item.specificationHash || canonicalHash(specification);
    const jobStatus = (value) => Number(value?.status ?? value?.[13] ?? 0);
    const jobAttempts = (value) => Number(value?.attempts ?? value?.[10] ?? 0);
    const jobRetryDeadline = (value) => Number(value?.retryDeadline ?? value?.[5] ?? 0);
    await database.collection("specifications").updateOne({ _id: specHash }, { $set: { document: specification, canonical: canonical(specification), createdAt: new Date() } }, { upsert: true });
    await database.collection("evidence_manifests").updateOne({ _id: evidenceHash }, { $set: { document: evidence, createdAt: new Date() } }, { upsert: true });
    const policyHash = keccak256(stringToHex(policyVersion));
    const existing = await readJobUntil(jobId);
    let createHash = state[jobId]?.createHash || null;
    let deliveryHash = state[jobId]?.deliveryHash || null;
    let lockHash = state[jobId]?.lockHash || null;
    let requestHash = state[jobId]?.requestHash || null;
    if (!existing || jobStatus(existing) === 0) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      createHash = await clientWallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "createFundedJob", args: [jobId, workerAccount.address, reward, deadline, `0x${specHash}`, policyHash] });
      await receipt(createHash);
    }
    let job = await readJobUntil(jobId);
    if ([9, 10].includes(jobStatus(job)) && state[jobId]?.status) {
      console.log(`Case ${index}: already ${state[jobId].status}; skipping terminal job`);
      continue;
    }
    if (jobStatus(job) === 1) {
      deliveryHash = await workerWallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "submitOrReplaceDelivery", args: [jobId, `0x${evidenceHash}`] });
      await receipt(deliveryHash);
      await waitForDelivery(jobId, evidenceHash);
      lockHash = await workerWallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "lockDelivery", args: [jobId] });
      await receipt(lockHash);
      job = await waitForStatus(jobId, 2);
    }
    if (jobStatus(job) === 2) {
      requestHash = await workerWallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "requestVerification", args: [jobId, false] });
      await receipt(requestHash);
      job = await waitForStatus(jobId, 3);
    }
    if (jobStatus(job) === 4) {
      const retryDeadline = jobRetryDeadline(job);
      if (Math.floor(Date.now() / 1000) > retryDeadline) {
        const refundHash = await workerWallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "expireRetryWindow", args: [jobId] });
        await receipt(refundHash);
        const record = { index, jobId, createHash, deliveryHash, lockHash, requestHash, paymentHash: state[jobId]?.paymentHash || null, verifyHash: state[jobId]?.verifyHash || null, importHash: null, settleHash: null, refundHash, decision: "UNDETERMINED", score: 0, status: "REFUNDED" };
        records.push(record);
        state[jobId] = { ...record };
        await writeFile(stateUrl, JSON.stringify({ records, ...state }, null, 2) + "\n");
        await writeFile(new URL(`../../../fixtures/live-results/showcase-${index}.json`, import.meta.url), JSON.stringify(record, null, 2) + "\n");
        console.log(JSON.stringify(record));
        continue;
      }
      requestHash = await workerWallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "requestVerification", args: [jobId, false] });
      await receipt(requestHash);
      job = await waitForStatus(jobId, 3);
    }
    const attempt = jobAttempts(job);
    if (jobStatus(job) !== 3 || attempt < 1) throw new Error(`Case ${index} is not verifying (status ${jobStatus(job)}, attempts ${attempt})`);
    const paymentKey = `${jobId}:verification:${attempt}`;
    const payment = await gen.readContract({ address: genTreasury, functionName: "get_payment", args: [paymentKey], jsonSafeReturn: true });
    let paymentHash = state[jobId]?.attempt === attempt ? state[jobId]?.paymentHash || null : null;
    if (!payment || BigInt(String(payment.amount || 0)) !== 100000000000000000n) {
      paymentHash = await gen.writeContract({ address: genTreasury, functionName: "fund_verification", args: [jobId, attempt], value: 100000000000000000n });
      await waitGen(paymentHash);
    }
    let verifyHash = state[jobId]?.attempt === attempt ? state[jobId]?.verifyHash || null : null;
    if (!verifyHash) {
      verifyHash = await gen.writeContract({ address: verifier, functionName: "verify", args: [jobId, `${rawBase}/case-${id}-specification.json`, specHash, `${rawBase}/case-${id}-evidence.json`, evidenceHash, attempt, false, "", clientAccount.address], value: 0n });
      state[jobId] = { createHash, deliveryHash, lockHash, requestHash, paymentHash, verifyHash, attempt };
      await writeFile(stateUrl, JSON.stringify({ records, ...state }, null, 2) + "\n");
    }
    const verifyReceipt = await waitGen(verifyHash);
    if (verifyReceipt.resultName !== "AGREE" || verifyReceipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
      const outcomeNonce = BigInt(`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex")}`);
      const outcome = { jobId, chainId: 84532n, escrow, verifierId: keccak256(stringToHex(verifier.toLowerCase())), genlayerTxHash: verifyHash, attempt, evidenceHash: `0x${evidenceHash}`, policyHash, outcome: 1, nonce: outcomeNonce, appeal: false };
      const outcomeSignature = await privateKeyToAccount(process.env.VERDICT_ATTESTOR_PRIVATE_KEY).signTypedData({
        domain: { name: "Workify", version: process.env.WORKIFY_EIP712_VERSION, chainId: 84532, verifyingContract: escrow },
        primaryType: "AttemptOutcome",
        types: { AttemptOutcome: [{ name: "jobId", type: "bytes32" }, { name: "chainId", type: "uint256" }, { name: "escrow", type: "address" }, { name: "verifierId", type: "bytes32" }, { name: "genlayerTxHash", type: "bytes32" }, { name: "attempt", type: "uint8" }, { name: "evidenceHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "outcome", type: "uint8" }, { name: "nonce", type: "uint256" }, { name: "appeal", type: "bool" }] },
        message: outcome,
      });
      const outcomeHash = await workerWallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "recordAttemptOutcome", args: [outcome, outcomeSignature] });
      await receipt(outcomeHash);
      state[jobId] = { createHash, deliveryHash, lockHash, requestHash, paymentHash, verifyHash, outcomeHash, attempt };
      await writeFile(stateUrl, JSON.stringify({ records, ...state }, null, 2) + "\n");
      console.log(`Case ${index}: recorded UNDETERMINED outcome (${verifyReceipt.resultName}); continuing with independent cases`);
      continue;
    }
    const raw = await gen.readContract({ address: verifier, functionName: "get_verdict", args: [jobId, attempt, false], jsonSafeReturn: true });
    const verdict = JSON.parse(String(raw));
    const nonce = BigInt(`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex")}`);
    const attestation = { jobId, chainId: 84532n, escrow, verifierId: keccak256(stringToHex(verifier.toLowerCase())), genlayerTxHash: verifyHash, attempt, specificationHash: `0x${verdict.specification_hash}`, evidenceHash: `0x${verdict.evidence_root}`, policyHash: keccak256(stringToHex(verdict.policy_version)), decision: { PASS: 1, FAIL: 2, PARTIAL: 3, UNVERIFIABLE: 4 }[verdict.decision], payoutBps: Number(verdict.payout_bps), resultHash: `0x${verdict.result_hash}`, nonce, appeal: false };
    const signature = await privateKeyToAccount(process.env.VERDICT_ATTESTOR_PRIVATE_KEY).signTypedData({
      domain: { name: "Workify", version: process.env.WORKIFY_EIP712_VERSION, chainId: 84532, verifyingContract: escrow },
      primaryType: "Verdict",
      types: { Verdict: [{ name: "jobId", type: "bytes32" }, { name: "chainId", type: "uint256" }, { name: "escrow", type: "address" }, { name: "verifierId", type: "bytes32" }, { name: "genlayerTxHash", type: "bytes32" }, { name: "attempt", type: "uint8" }, { name: "specificationHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "decision", type: "uint8" }, { name: "payoutBps", type: "uint16" }, { name: "resultHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "appeal", type: "bool" }] },
      message: attestation,
    });
    let importHash = state[jobId]?.importHash || null;
    if (!importHash) { importHash = await workerWallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "importFinalVerdict", args: [attestation, signature] }); await receipt(importHash); }
    let settledJob = await readJob(jobId);
    const appealDeadline = Number(settledJob[7]);
    const waitMs = Math.max(0, appealDeadline * 1000 - Date.now() + 2_000);
    if (waitMs > 0) { console.log(`Case ${index}: waiting ${Math.ceil(waitMs / 1000)} seconds for appeal window`); await sleep(waitMs); }
    let settleHash = state[jobId]?.settleHash || null;
    settledJob = await readJob(jobId);
    if (Number(settledJob[13]) !== 9) { settleHash = await workerWallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "settle", args: [jobId] }); await receipt(settleHash); }
    const record = { index, jobId, createHash, deliveryHash, lockHash, requestHash, paymentHash, verifyHash, importHash, settleHash, decision: verdict.decision, score: verdict.score, status: "SETTLED" };
    records.push(record);
    state[jobId] = { ...record };
    await writeFile(stateUrl, JSON.stringify({ records, ...state }, null, 2) + "\n");
    await writeFile(new URL(`../../../fixtures/live-results/showcase-${index}.json`, import.meta.url), JSON.stringify(records.at(-1), null, 2) + "\n");
    console.log(JSON.stringify(records.at(-1)));
  }
  await writeFile(new URL("../../../fixtures/live-results/showcase-summary.json", import.meta.url), JSON.stringify({ network: "base-sepolia", escrow, verifier, records }, null, 2) + "\n");
  await mongo.close();
}

await main();
