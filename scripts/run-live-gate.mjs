import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chains, createAccount, createClient } from "genlayer-js";

const phase = process.argv[2] ?? "phase1";
const key = process.env.GENLAYER_OPERATOR_PRIVATE_KEY;
if (!key) throw new Error("GENLAYER_OPERATOR_PRIVATE_KEY is required");
const deploymentVersion = process.env.WORKIFY_VERIFIER_VERSION ?? "v3";
const deployments = JSON.parse(await readFile(new URL(`../deployments/genlayer-bradbury/${deploymentVersion}.json`, import.meta.url), "utf8"));
const verifierKey = { phase1: "github", phase2: "web", phase3: "research", phase4: "document", phase5: "design" }[phase];
if (!verifierKey) throw new Error(`Unsupported phase ${phase}`);
const verifier = deployments.verifiers[verifierKey]?.address;
if (!verifier) throw new Error(`${phase} verifier is not deployed`);
const allCases = JSON.parse(await readFile(new URL(`../apps/web/public/verification-fixtures/${phase}/index.json`, import.meta.url), "utf8"));
const requiredFinalized = Number(process.env.WORKIFY_REQUIRED_FINALIZED ?? 5);
const caseLimit = Number(process.env.WORKIFY_CASE_LIMIT ?? requiredFinalized);
const cases = allCases.slice(0, caseLimit);
const resultsDirectory = new URL("../fixtures/live-results/", import.meta.url);
await mkdir(resultsDirectory, { recursive: true });
const resultUrl = new URL(`${phase}-${deploymentVersion}.json`, resultsDirectory);
let state;
try { state = JSON.parse(await readFile(resultUrl, "utf8")); } catch { state = { phase, verifier, required: requiredFinalized, cases: [] }; }
state.required = requiredFinalized;
const client = createClient({ chain: chains.testnetBradbury, endpoint: deployments.endpoint, account: createAccount(key) });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const save = () => writeFile(resultUrl, JSON.stringify(state, null, 2) + "\n");

async function readTransaction(hash) {
  for (let retry = 0; retry < 20; retry += 1) {
    try { return await client.getTransaction({ hash }); }
    catch (error) { if (retry === 19) throw error; await sleep(2_000 + retry * 500); }
  }
}

async function waitUntil(hash, acceptedStatuses, maximumPolls) {
  for (let poll = 0; poll < maximumPolls; poll += 1) {
    const transaction = await readTransaction(hash);
    if (acceptedStatuses.includes(transaction.statusName)) return transaction;
    if (["LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(transaction.statusName)) {
      const current = Number(transaction.currentTimestamp ?? 0);
      const lastVote = Number(transaction.lastVoteTimestamp ?? transaction.createdTimestamp ?? 0);
      if (current > 0 && lastVote > 0 && current - lastVote >= 600) {
        return { ...transaction, statusName: "UNDETERMINED", networkStatusName: transaction.statusName };
      }
    }
    await sleep(10_000);
  }
  throw new Error(`Timed out waiting for ${hash}: ${acceptedStatuses.join(" or ")}`);
}

async function submit(testCase, attempt) {
  for (let retry = 0; retry < 8; retry += 1) {
    try {
      return await client.writeContract({
        address: verifier,
        functionName: "verify",
        args: [testCase.jobId, testCase.specificationUrl, testCase.specificationHash, testCase.evidenceUrl, testCase.evidenceHash, attempt, false, ""],
        value: 0n,
      });
    } catch (error) {
      if (retry === 7) throw error;
      await sleep(3_000 + retry * 2_000);
    }
  }
}

for (const testCase of cases) {
  let record = state.cases.find((item) => item.caseId === testCase.caseId);
  if (!record) {
    record = { ...testCase, attempts: [] };
    state.cases.push(record);
  }
  record.attempts ??= record.transactionHash ? [{ attempt: 1, transactionHash: record.transactionHash, status: record.status, consensus: record.consensus, execution: record.execution }] : [];
  let attemptRecord = record.attempts.at(-1);
  if (attemptRecord && ["SUBMITTED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING"].includes(attemptRecord.status)) {
    const receipt = await waitUntil(attemptRecord.transactionHash, ["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"], 360);
    Object.assign(attemptRecord, { status: receipt.statusName, networkStatus: receipt.networkStatusName ?? receipt.statusName, consensus: receipt.resultName, execution: receipt.txExecutionResultName, acceptedAt: new Date().toISOString() });
    await save();
  }
  while (!attemptRecord || attemptRecord.status === "UNDETERMINED") {
    const attempt = record.attempts.length + 1;
    if (attempt > 3) break;
    const hash = await submit(testCase, attempt);
    attemptRecord = { attempt, transactionHash: hash, status: "SUBMITTED", submittedAt: new Date().toISOString() };
    record.attempts.push(attemptRecord);
    await save();
    const receipt = await waitUntil(hash, ["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"], 360);
    Object.assign(attemptRecord, { status: receipt.statusName, networkStatus: receipt.networkStatusName ?? receipt.statusName, consensus: receipt.resultName, execution: receipt.txExecutionResultName, acceptedAt: new Date().toISOString() });
    await save();
    if (receipt.statusName !== "UNDETERMINED") break;
  }
}

for (const record of state.cases) {
  const attemptRecord = record.attempts.at(-1);
  if (!attemptRecord || attemptRecord.status === "UNDETERMINED" || attemptRecord.status === "CANCELED") continue;
  const receipt = await waitUntil(attemptRecord.transactionHash, ["FINALIZED", "UNDETERMINED", "CANCELED"], 720);
  Object.assign(attemptRecord, { status: receipt.statusName, networkStatus: receipt.networkStatusName ?? receipt.statusName, consensus: receipt.resultName, execution: receipt.txExecutionResultName });
  if (receipt.statusName === "FINALIZED" && receipt.resultName === "AGREE" && receipt.txExecutionResultName === "FINISHED_WITH_RETURN") {
    attemptRecord.verdict = await client.readContract({ address: verifier, functionName: "get_verdict", args: [record.jobId, attemptRecord.attempt, false], jsonSafeReturn: true });
    attemptRecord.finalizedAt = new Date().toISOString();
  }
  record.status = attemptRecord.status;
  record.consensus = attemptRecord.consensus;
  record.execution = attemptRecord.execution;
  record.verdict = attemptRecord.verdict;
  await save();
}
state.finalized = state.cases.filter((item) => item.status === "FINALIZED" && item.consensus === "AGREE" && item.execution === "FINISHED_WITH_RETURN" && item.verdict).length;
state.passed = state.finalized >= state.required;
await save();
if (!state.passed) process.exit(2);
