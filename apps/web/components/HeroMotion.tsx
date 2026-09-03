"use client";

import { motion } from "motion/react";
import { Check, FileText, LockKeyhole, Scale, ShieldCheck } from "lucide-react";

const records = [
  { icon: FileText, label: "Specification", value: "5 criteria locked" },
  { icon: LockKeyhole, label: "Escrow", value: "1.00 USDC funded" },
  { icon: ShieldCheck, label: "Evidence", value: "Manifest hash pinned" },
];

export function HeroMotion() {
  return <motion.div className="hero-instrument" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .15, ease: [.16, 1, .3, 1] }}>
    <header><span>WORK CONTRACT</span><code>0x7a4f…c219</code></header>
    <div className="instrument-title"><div><small>GITHUB SOFTWARE</small><strong>Session expiry handling</strong></div><span>VERIFYING</span></div>
    <div className="instrument-records">{records.map(({ icon: Icon, label, value }, index) => <motion.div key={label} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .45, delay: .35 + index * .1 }}><Icon size={15}/><span>{label}</span><strong>{value}</strong><Check size={13}/></motion.div>)}</div>
    <div className="consensus-band"><div><Scale size={16}/><span>Validator consensus</span></div><div className="validator-nodes">{[0,1,2,3,4].map((node) => <motion.span key={node} animate={{ backgroundColor: ["#243028", "#45df79", "#243028"] }} transition={{ duration: 2.6, delay: node * .22, repeat: Infinity }}/>)}</div><strong>4 / 5 agree</strong></div>
    <footer><span>Attempt 1 of 3</span><span>Appeal opens after finality</span></footer>
  </motion.div>;
}
