import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, CircleDollarSign, FileCheck2, GitPullRequest, Gavel, LockKeyhole, Radar, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { HeroMotion } from "@/components/HeroMotion";
import { Nav } from "@/components/Nav";

const features = [
  { icon: LockKeyhole, title: "Fund before creation", text: "A job exists only after its full Base Sepolia USDC reward is atomically locked." },
  { icon: Radar, title: "Verify against evidence", text: "Public artifacts are canonicalized, hashed, and independently evaluated on GenLayer." },
  { icon: Gavel, title: "Appeal without custody", text: "A five-minute challenge window protects both parties before deterministic settlement." },
];

const flow = [
  { icon: FileCheck2, title: "Specify", text: "Lock atomic acceptance criteria." },
  { icon: WalletCards, title: "Fund", text: "Escrow USDC before the job exists." },
  { icon: GitPullRequest, title: "Deliver", text: "Submit a reproducible evidence manifest." },
  { icon: Bot, title: "Adjudicate", text: "Validators independently reach consensus." },
  { icon: CircleDollarSign, title: "Settle", text: "Release, refund, split, or appeal." },
];

export default function Home() {
  return <>
    <HeroMotion />
    <Nav />
    <main>
      <section className="hero">
        <div className="grid-bg" />
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="shell hero-layout">
          <div className="hero-copy">
            <span className="eyebrow"><span className="pulse" /> Base Sepolia · GenLayer Bradbury</span>
            <h1>Settlement for work that can <span className="gradient">prove itself.</span></h1>
            <p>Workify locks USDC, pins public evidence, asks independent GenLayer validators to adjudicate exact acceptance criteria, then settles without trusting either party.</p>
            <div className="actions"><Link className="button" href="/app/jobs/new">Create a funded job <ArrowRight size={16} /></Link><Link className="button secondary" href="/explorer">Explore verdicts</Link></div>
            <div className="trust-row"><span><CheckCircle2 size={15}/> Fund-first escrow</span><span><CheckCircle2 size={15}/> Three-attempt cap</span><span><CheckCircle2 size={15}/> Five-minute appeals</span></div>
          </div>
          <div className="hero-console glass">
            <div className="console-head"><div><span className="console-dot"/><span className="console-dot"/><span className="console-dot"/></div><span>WORK CONTRACT · LIVE PREVIEW</span></div>
            <div className="console-job"><span className="page-icon"><GitPullRequest size={21}/></span><div><small>GITHUB SOFTWARE</small><strong>Fix session expiry handling</strong><p>4 atomic criteria · 250 USDC escrow</p></div><span className="status review"><Radar size={13}/> Under review</span></div>
            <div className="console-criteria"><div><span>C-001</span><p>Expired sessions are rejected</p><b>PASS</b></div><div><span>C-002</span><p>Timeout remains 15 minutes</p><b>PASS</b></div><div><span>C-003</span><p>Regression tests cover expiry</p><b className="pending">VERIFYING</b></div></div>
            <div className="console-footer"><span><ShieldCheck size={16}/> Evidence root locked</span><strong>Attempt 1 / 3</strong></div>
          </div>
        </div>
      </section>
      <section className="proof-strip shell"><div><strong>5</strong><span>verification policies</span></div><div><strong>3</strong><span>maximum attempts</span></div><div><strong>5m</strong><span>appeal window</span></div><div><strong>1%</strong><span>worker-award fee</span></div></section>
      <section className="section shell" id="protocol">
        <div className="section-intro"><span className="eyebrow"><GitPullRequest size={14} /> Protocol flow</span><h2>One curved path from <span className="gradient">brief to settlement.</span></h2><p>No vague approvals and no worker self-attestation. Each transition is backed by escrow state, pinned evidence, or finalized consensus.</p></div>
        <div className="protocol-curve">{flow.map(({ icon: Icon, title, text }, index) => <div className="protocol-step" key={title}><span className="protocol-index">0{index + 1}</span><span className="protocol-icon"><Icon size={20}/></span><strong>{title}</strong><p>{text}</p></div>)}</div>
        <div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article className="glass feature-card" key={title}><span className="feature-icon"><Icon size={22}/></span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      </section>
      <section className="section shell" id="economics"><div className="glass economics-banner"><div><span className="eyebrow"><Sparkles size={14} /> Deterministic economics</span><h2>Hard gates beat arbitrary scores.</h2><p>Critical failures cannot be hidden by minor passes. PASS pays the worker, FAIL and UNVERIFIABLE refund the client, PARTIAL uses adjudicated basis points, and terminal UNDETERMINED follows the encoded fallback.</p></div><Link className="button" href="/docs#economics">Read settlement logic <ArrowRight size={16}/></Link></div></section>
    </main>
  </>;
}
