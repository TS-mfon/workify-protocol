"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Activity, BriefcaseBusiness, CircleHelp, FilePlus2, LayoutDashboard, Radar, WalletCards } from "lucide-react";
import { WalletButton } from "./WalletButton";

const links = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/app/jobs/new", label: "Create job", icon: FilePlus2 },
  { href: "/app/activity", label: "Activity", icon: Activity },
  { href: "/app/treasury", label: "Treasury", icon: WalletCards },
  { href: "/explorer", label: "Explorer", icon: Radar },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="app-layout"><aside className="sidebar"><div><Link className="brand brand-large" href="/"><Image className="brand-mark" src="/icon.svg" alt="" width={38} height={38}/><span>Workify<small>SETTLEMENT PROTOCOL</small></span></Link><p className="nav-label">Workspace</p><nav aria-label="Console navigation">{links.map(({ href, label, icon: Icon }) => { const active = href === "/app" ? pathname === href : pathname.startsWith(href); return <Link className={active ? "nav-item active" : "nav-item"} href={href} key={href}><span className="nav-icon"><Icon size={17}/></span><span>{label}</span></Link>; })}</nav></div><div className="sidebar-bottom"><div className="network-card"><span className="network-dot"/><div><b>Testnet connected</b><span>Base Sepolia · Bradbury</span></div></div><Link className="nav-item" href="/docs"><span className="nav-icon"><CircleHelp size={17}/></span><span>Documentation</span></Link></div></aside><div className="app-stage"><header className="app-topbar"><div><span className="topbar-label">Work settlement console</span><b>Base Sepolia</b></div><WalletButton /></header><main className="main">{children}</main></div></div>;
}
