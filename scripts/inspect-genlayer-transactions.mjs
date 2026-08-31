import { readFile } from "node:fs/promises";
import { chains, createAccount, createClient } from "genlayer-js";

const key = process.env.GENLAYER_OPERATOR_PRIVATE_KEY;
if (!key) throw new Error("GENLAYER_OPERATOR_PRIVATE_KEY is required");

const deployment = JSON.parse(
  await readFile(new URL("../deployments/genlayer-bradbury/v3.json", import.meta.url), "utf8"),
);
const client = createClient({
  chain: chains.testnetBradbury,
  endpoint: deployment.endpoint,
  account: createAccount(key),
});
const concise = process.env.WORKIFY_INSPECT_CONCISE === "1";

for (const hash of process.argv.slice(2)) {
  const transaction = await client.getTransaction({ hash });
  const consensus = transaction.consensus_data ?? transaction.consensusData ?? {};
  const leaderReceipts = consensus.leader_receipt ?? consensus.leaderReceipt ?? [];
  const validatorVotes = consensus.validator_votes ?? consensus.validatorVotes ?? [];
  const summarizeReceipt = (receipt) => ({
    vote: receipt.vote,
    executionResult: receipt.execution_result ?? receipt.executionResult,
    resultStatus: receipt.result?.status,
    error: receipt.genvm_result?.error_description ?? receipt.genvmResult?.errorDescription,
    calldata: receipt.result?.calldata,
  });

  if (concise) {
    console.log(JSON.stringify({
      hash,
      status: transaction.statusName,
      consensus: transaction.resultName,
      execution: transaction.txExecutionResultName,
      rounds: transaction.numOfRounds,
      currentTimestamp: transaction.currentTimestamp,
      createdTimestamp: transaction.createdTimestamp,
      lastVoteTimestamp: transaction.lastVoteTimestamp,
      lastRound: transaction.lastRound ? {
        round: transaction.lastRound.round,
        rotationsLeft: transaction.lastRound.rotationsLeft,
        votesCommitted: transaction.lastRound.votesCommitted,
        votesRevealed: transaction.lastRound.votesRevealed,
        votes: transaction.lastRound.validatorVotesName,
        resultHashes: transaction.lastRound.validatorResultHash,
      } : undefined,
      eqOutputBytes: typeof transaction.eqBlocksOutputs === "string" ? Math.max(0, (transaction.eqBlocksOutputs.length - 2) / 2) : 0,
    }, null, 2));
    continue;
  }

  console.log(JSON.stringify({
    hash,
    keys: Object.keys(transaction),
    nestedKeys: Object.fromEntries(Object.entries(transaction).filter(([, value]) => value && typeof value === "object").map(([name, value]) => [name, Object.keys(value)])),
    lastRound: transaction.lastRound,
    result: transaction.result,
    messages: transaction.messages,
    txDataDecoded: transaction.txDataDecoded,
    txExecutionHash: transaction.txExecutionHash,
    eqBlocksOutputs: transaction.eqBlocksOutputs,
    status: transaction.statusName,
    consensus: transaction.resultName,
    execution: transaction.txExecutionResultName,
    leaderReceipts: leaderReceipts.map(summarizeReceipt),
    validatorVotes: validatorVotes.map(summarizeReceipt),
  }, null, 2));
}
