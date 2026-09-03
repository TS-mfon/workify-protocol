"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Activity, BriefcaseBusiness, CircleHelp, FilePlus2, LayoutDashboard, Radar } from "lucide-react";
import { WalletButton } from "./WalletButton";

const links = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/jobs", label: "Work contracts", icon: BriefcaseBusiness },
  { href: "/app/jobs/new", label: "Create job", icon: FilePlus2 },
  { href: "/app/activity", label: "Activity", icon: Activity },
  { href: "/explorer", label: "Explorer", icon: Radar },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="app-layout"><aside className="sidebar"><div className="sidebar-main"><Link className="brand brand-large" href="/"><Image className="brand-mark" src="/icon.svg" alt="" width={34} height={34}/><span>Workify<small>SETTLEMENT PROTOCOL</small></span></Link><nav aria-label="Console navigation">{links.map(({ href, label, icon: Icon }) => { const active = href === "/app" ? pathname === href : pathname.startsWith(href); return <Link className={active ? "nav-item active" : "nav-item"} href={href} key={href}><Icon size={16}/><span>{label}</span></Link>; })}</nav></div><div className="sidebar-bottom"><div className="network-card"><span/><div><b>Base Sepolia</b><small>GenLayer Bradbury</small></div></div><Link className="nav-item" href="/docs"><CircleHelp size={16}/><span>Documentation</span></Link></div></aside><div className="app-stage"><header className="app-topbar"><div><span>Workify testnet</span><strong>Evidence-backed settlement</strong></div><WalletButton /></header><main className="main">{children}</main></div></div>;
}
