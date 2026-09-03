import { existsSync } from "node:fs";

const required = [
  "BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY",
  "BASE_AUTOMATION_PRIVATE_KEY",
  "GENLAYER_OPERATOR_PRIVATE_KEY",
  "VERDICT_ATTESTOR_PRIVATE_KEY",
  "MONGODB_URI",
  "NEXT_PUBLIC_GENLAYER_RPC_URL",
  "NEXT_PUBLIC_WORK_ESCROW_ADDRESS",
  "NEXT_PUBLIC_GEN_TREASURY_ADDRESS",
];
const missing = required.filter((name) => !process.env[name] || process.env[name].startsWith("[SENSITIVE"));
if (missing.length > 0) {
  console.error(`Live five-job gate is blocked. Missing real configuration: ${missing.join(", ")}`);
  console.error("This runner intentionally refuses to create jobs with placeholders or fixture state.");
  process.exit(2);
}
if (!existsSync("apps/web/public/verification-fixtures/phase1/index.json")) {
  console.error("Live verification fixtures are unavailable.");
  process.exit(2);
}
console.error("Live job runner scaffolding is present, but execution must be completed only after the corrected escrow deployment and funded client/worker keys are configured.");
process.exit(2);
