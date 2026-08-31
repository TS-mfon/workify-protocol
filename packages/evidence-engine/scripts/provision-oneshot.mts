import { OneShotClient } from "@1shotapi/client-sdk";

const chainId = 84532;
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const apiKey = required("ONESHOT_API_KEY");
const apiSecret = required("ONESHOT_API_SECRET");
const businessId = required("ONESHOT_BUSINESS_ID");
const escrow = required("NEXT_PUBLIC_WORK_ESCROW_ADDRESS");
const callbackUrl = process.env.ONESHOT_WEBHOOK_DESTINATION_URL;
const client = new OneShotClient({ apiKey, apiSecret });

const verdictComponents = [
  ["jobId", "bytes32"], ["verifierId", "bytes32"], ["genlayerTxHash", "bytes32"], ["attempt", "uint8"],
  ["specificationHash", "bytes32"], ["evidenceHash", "bytes32"], ["policyHash", "bytes32"], ["decision", "uint8"],
  ["payoutBps", "uint16"], ["resultHash", "bytes32"], ["nonce", "uint256"], ["appeal", "bool"],
].map(([name, type]) => ({ name, type }));
const outcomeComponents = [
  ["jobId", "bytes32"], ["verifierId", "bytes32"], ["genlayerTxHash", "bytes32"], ["attempt", "uint8"],
  ["evidenceHash", "bytes32"], ["policyHash", "bytes32"], ["outcome", "uint8"], ["nonce", "uint256"], ["appeal", "bool"],
].map(([name, type]) => ({ name, type }));
const abi = [
  { type: "function", name: "importFinalVerdict", stateMutability: "nonpayable", inputs: [{ name: "verdict", type: "tuple", components: verdictComponents }, { name: "signature", type: "bytes" }], outputs: [] },
  { type: "function", name: "recordAttemptOutcome", stateMutability: "nonpayable", inputs: [{ name: "outcome", type: "tuple", components: outcomeComponents }, { name: "signature", type: "bytes" }], outputs: [] },
  ...["settle", "refundExpiredJob", "expireUnfundedAppeal"].map((name) => ({ type: "function" as const, name, stateMutability: "nonpayable" as const, inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] })),
] as const;

const wallets = await client.wallets.list(businessId, { chainId, page: 1, pageSize: 100 });
let wallet = process.env.ONESHOT_WALLET_ID ? await client.wallets.get(process.env.ONESHOT_WALLET_ID, true) : wallets.response.find((item) => item.name === "Workify Base Sepolia settlement");
wallet ??= await client.wallets.create(businessId, { chainId, name: "Workify Base Sepolia settlement", description: "Submits only approved WorkEscrowV1 lifecycle calls. Escrow remains USDC custodian." });
if (wallet.chainId !== chainId) throw new Error("The selected 1Shot wallet is not on Base Sepolia");

let methods = (await client.contractMethods.list(businessId, { chainId, contractAddress: escrow, page: 1, pageSize: 100, status: "live" })).response;
const functionNames = abi.map((item) => item.name);
const matching = methods.filter((method) => functionNames.includes(method.functionName as never));
if (matching.length === 0) {
  await client.contractMethods.importFromABI(businessId, { chainId, contractAddress: escrow, walletId: wallet.id, name: "Workify escrow settlement methods", description: "Strict WorkEscrowV1 server-wallet allowlist", abi: [...abi] });
  methods = (await client.contractMethods.list(businessId, { chainId, contractAddress: escrow, page: 1, pageSize: 100, status: "live" })).response;
} else if (matching.length !== functionNames.length) {
  throw new Error("A partial Workify method import already exists. Complete or remove it through the official 1Shot MCP/dashboard before rerunning.");
}

const byName = Object.fromEntries(methods.filter((method) => functionNames.includes(method.functionName as never)).map((method) => [method.functionName, method]));
for (const name of functionNames) {
  const method = byName[name];
  if (!method || method.chainId !== chainId || method.contractAddress.toLowerCase() !== escrow.toLowerCase() || method.walletId !== wallet.id) throw new Error(`Invalid imported method configuration for ${name}`);
}

let webhook: { id: string; publicKey: string } | undefined;
if (callbackUrl) {
  const endpoints = await client.webhooks.listEndpoints(businessId, { page: 1, pageSize: 100 });
  webhook = endpoints.response.find((endpoint) => endpoint.destinationUrl === callbackUrl);
  webhook ??= await client.webhooks.createEndpoint(businessId, { name: "Workify transaction status", description: "Signed 1Shot settlement success and failure callbacks", destinationUrl: callbackUrl });
  const methodIds = functionNames.map((name) => byName[name].id);
  const triggers = await client.webhooks.listTriggers(businessId, { page: 1, pageSize: 100 });
  if (!triggers.response.some((trigger) => trigger.endpointId === webhook!.id && methodIds.every((id) => trigger.contractMethodIds.includes(id)))) {
    await client.webhooks.createTrigger(businessId, { name: "Workify escrow lifecycle", description: "Success, failure, submission and low-gas events", endpointId: webhook.id, contractMethodIds: methodIds, eventNames: ["TransactionExecutionSubmitted", "TransactionExecutionSuccess", "TransactionExecutionFailure", "EscrowWalletLowBalanceDetected", "EscrowWalletDepositConfirmed"] });
  }
}

console.log(JSON.stringify({
  walletAddress: wallet.accountAddress,
  chainId: wallet.chainId,
  environment: {
    ONESHOT_WALLET_ID: wallet.id,
    ONESHOT_IMPORT_VERDICT_METHOD_ID: byName.importFinalVerdict.id,
    ONESHOT_RECORD_OUTCOME_METHOD_ID: byName.recordAttemptOutcome.id,
    ONESHOT_SETTLE_METHOD_ID: byName.settle.id,
    ONESHOT_REFUND_EXPIRED_METHOD_ID: byName.refundExpiredJob.id,
    ONESHOT_EXPIRE_APPEAL_METHOD_ID: byName.expireUnfundedAppeal.id,
    ...(webhook ? { ONESHOT_WEBHOOK_PUBLIC_KEY: webhook.publicKey } : {}),
  },
}, null, 2));
