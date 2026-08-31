import { Nav } from "@/components/Nav";

const sections = [
  "Introduction",
  "Architecture",
  "Job Lifecycle",
  "Evidence System",
  "Verification Policies",
  "Retries",
  "Appeals",
  "Economics",
  "Settlement",
  "Relayer",
  "Security",
  "Contracts",
  "Release Gates",
  "Operations",
];

export default function Docs() {
  return <><Nav/><div className="docs"><aside>{sections.map((section) => <a href={`#${section.toLowerCase().replaceAll(" ", "-")}`} key={section}>{section}</a>)}</aside><article>
    <h1>Workify Protocol Documentation</h1>
    <p id="introduction">Workify is a testnet work-settlement protocol combining Base Sepolia USDC escrow, GenLayer Bradbury adjudication, public hashed evidence, and a narrowly scoped 1Shot settlement path. It verifies compliance with locked criteria rather than asking whether work is vaguely good.</p>
    <h2 id="architecture">Architecture</h2>
    <pre>{`Client → atomic Base USDC escrow → assigned worker
Worker → locked evidence manifest → GenLayer policy verifier
Final verdict → bounded attestation → Base outcome
Five-minute appeal window → permissionless settlement`}</pre>
    <p>Base owns funds and deterministic state. GenLayer owns subjective adjudication. Vercel hosts the dApp, evidence APIs, and bounded automation. MongoDB is an index and lease store only; it never controls custody.</p>
    <h2 id="job-lifecycle">Job Lifecycle</h2>
    <p><code>createFundedJob</code> transfers USDC before persisting a job, so an unfunded job cannot exist. The assigned worker may replace delivery evidence until it is locked. A locked delivery enters verification, retry, appeal, and settlement states governed by contract deadlines.</p>
    <h2 id="evidence-system">Evidence System</h2>
    <p>Every delivery resolves to canonical HTTPS URLs, MIME types, byte sizes, immutable revisions where available, and SHA-256 hashes. GenLayer independently re-fetches those bytes. Repository text, webpages, documents, images, comments, and worker statements are always untrusted data and never instructions.</p>
    <h2 id="verification-policies">Verification Policies</h2>
    <p>Five v7 deployments share one pinned verifier implementation with distinct immutable policies: GitHub Software, Web Application, Research/Data, Content/Document, and Design/Creative. Each criterion returns PASS, PARTIAL, FAIL, or UNVERIFIABLE. Critical failures are hard gates; deterministic payout basis points are derived after consensus.</p>
    <h2 id="retries">Retries</h2>
    <p>Each verification attempt costs exactly 0.1 GEN and a work has at most three attempts. UNDETERMINED permits worker-funded re-verification without changing locked evidence. If the third attempt remains UNDETERMINED, the deterministic fallback outcome is used, but fallback results do not count as successful consensus release-gate results.</p>
    <h2 id="appeals">Appeals</h2>
    <p>Either party may open an appeal during the 300-second Base appeal window. The appeal freezes settlement and costs exactly 1 GEN. Supplemental public evidence and a bounded statement may be added, but the original delivery cannot be replaced. Appeal verification also has at most three attempts.</p>
    <h2 id="economics">Economics</h2>
    <p>The worker funds verification so Workify does not subsidize GenLayer execution from its operator wallet. Verification and appeal fees accrue to <code>GenTreasuryV1</code>. Base settlement deducts a 1% protocol fee only from the worker-awarded USDC share; client refunds are not charged that fee.</p>
    <h2 id="settlement">Settlement</h2>
    <p>PASS pays the worker share, FAIL and UNVERIFIABLE refund the client, PARTIAL uses the adjudicated basis points, and the terminal undetermined fallback splits gross escrow 50/50. After the appeal window, settlement is permissionless so the platform cannot hold funds hostage.</p>
    <h2 id="relayer">Relayer</h2>
    <p>Workify targets the 1Shot public JSON-RPC endpoint at <code>https://relayer.1shotapi.dev/relayers</code> using ERC-7710 permission contexts and the relayer estimate, send, and status methods. No legacy API key, business ID, wallet ID, imported method ID, or webhook key configuration is used.</p>
    <h2 id="security">Security</h2>
    <p>Controls include immutable evidence hashes, strict source limits, prompt-injection trust boundaries, validator-side source retrieval, EIP-712 domain binding, replay nonces, fixed settlement recipients, SafeERC20, reentrancy guards, typed failures, bounded retries, and permissionless expiry paths.</p>
    <h2 id="contracts">Contracts</h2>
    <p>Base v1 source lives under <code>contracts/base/v1</code>. GenLayer history is preserved under <code>contracts/genlayer/v1</code> through <code>contracts/genlayer/v7</code>. New versions are additive and deployed source is never overwritten.</p>
    <h2 id="release-gates">Release Gates</h2>
    <p>Each policy suite targets five distinct finalized transactions with AGREE consensus, FINISHED_WITH_RETURN execution, and a non-empty stored verdict. ACCEPTED is recorded but never counted as FINALIZED. A user waiver may permit sequencing but cannot be represented as a passed gate.</p>
    <h2 id="operations">Operations</h2>
    <p>GitHub Actions may call a protected Vercel automation endpoint every five minutes. Schedules are best effort, so exact eligibility is enforced onchain and any user or keeper may invoke permissionless expiry or settlement when a deadline has matured.</p>
  </article></div></>;
}
