import Link from "next/link";
import { ArrowRight, Check, CircleDollarSign, FileCheck2, Fingerprint, Gavel, GitPullRequest, Scale, ShieldCheck } from "lucide-react";
import { HeroMotion } from "@/components/HeroMotion";
import { Nav } from "@/components/Nav";
import { getResolvedCases } from "@/lib/explorer";

export const dynamic = "force-dynamic";
const stages = ["Specification", "Escrow", "Evidence", "Validators", "Verdict", "Settlement"];

export default async function Home() {
  let resolved = 0;
  let adjudicated = 0n;
  try {
    const cases = await getResolvedCases();
    resolved = cases.length;
    adjudicated = cases.reduce((total, item) => total + BigInt(item.base.reward), 0n);
  } catch {}
  return <><Nav /><main>
    <section className="landing-hero shell">
      <div className="landing-copy">
        <span className="network-line"><span/> Base Sepolia escrow. GenLayer adjudication.</span>
        <h1>Work gets paid when evidence proves it.</h1>
        <p>Lock USDC, submit public evidence, let independent GenLayer validators adjudicate the contract, and settle without trusting either party.</p>
        <div className="landing-actions"><Link className="button" href="/app/jobs/new">Create funded job <ArrowRight size={16}/></Link><Link className="text-link" href="/explorer">Inspect resolved cases <ArrowRight size={14}/></Link></div>
        <div className="landing-assurances"><span><Check size={13}/> Funds locked before creation</span><span><Check size={13}/> Five-minute appeal window</span><span><Check size={13}/> Fixed settlement recipients</span></div>
      </div>
      <HeroMotion />
    </section>

    <section className="settlement-line shell" aria-label="Workify settlement lifecycle">{stages.map((stage, index) => <div key={stage}><span>{index + 1}</span><strong>{stage}</strong></div>)}</section>

    <section className="protocol-intro shell" id="protocol">
      <div className="protocol-statement"><span>THE CONTRACT</span><h2>Not a marketplace approval. A verifiable settlement path.</h2></div>
      <div className="protocol-copy"><p>The client locks exact acceptance criteria and funds the full reward. The worker locks a hashed public evidence manifest. GenLayer evaluates each criterion, independent validators reach consensus, and Base settles the result.</p><Link className="text-link" href="/docs">Read the protocol specification <ArrowRight size={14}/></Link></div>
    </section>

    <section className="mechanism-list shell">
      <article><span><CircleDollarSign size={19}/></span><div><h3>Atomic escrow</h3><p>The Base contract transfers USDC before persisting a job. An unfunded job cannot exist.</p></div><code>BASE</code></article>
      <article><span><Fingerprint size={19}/></span><div><h3>Evidence-bound adjudication</h3><p>Specifications and manifests are canonicalized and hashed. Validators fetch the same public sources.</p></div><code>GENLAYER</code></article>
      <article><span><Gavel size={19}/></span><div><h3>Appealable verdicts</h3><p>Either party has five minutes to challenge a result by funding exactly 1 GEN.</p></div><code>5 MIN</code></article>
      <article><span><ShieldCheck size={19}/></span><div><h3>Recipient-safe settlement</h3><p>Automation can trigger settlement, but it cannot redirect worker, client, or treasury funds.</p></div><code>FIXED</code></article>
    </section>

    <section className="proof-ledger shell" id="economics">
      <div className="proof-copy"><span>PUBLIC PROOF</span><h2>The explorer shows the work, not a marketing summary.</h2><p>Open any resolved case to inspect the locked specification, evidence IDs, criterion decisions, public rationale, GenLayer finality, and Base settlement amounts.</p><Link className="button secondary" href="/explorer">Open verdict explorer <ArrowRight size={15}/></Link></div>
      <div className="proof-record">
        <div><FileCheck2 size={17}/><span>Resolved V8 cases</span><strong>{resolved}</strong></div>
        <div><Scale size={17}/><span>USDC adjudicated</span><strong>{Number(adjudicated) / 1e6}</strong></div>
        <div><GitPullRequest size={17}/><span>Policy classes</span><strong>5</strong></div>
        <p>Live values are read from the configured WorkEscrow V3 deployment. No fixture counts are displayed.</p>
      </div>
    </section>

    <section className="landing-cta shell"><div><span>SETTLE WORK</span><h2>Write the criteria. Lock the funds. Let evidence decide.</h2></div><Link className="button" href="/app/jobs/new">Create a work contract <ArrowRight size={16}/></Link></section>
  </main></>;
}
