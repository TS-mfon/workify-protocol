import Link from "next/link";
import Image from "next/image";
import { BriefcaseBusiness, FilePlus2, LayoutDashboard, ScrollText, WalletCards } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) { return <div className="app-layout"><aside className="sidebar"><Link className="brand" href="/"><Image className="brand-mark" src="/icon.svg" alt="" width={32} height={32}/>Workify</Link><nav><Link href="/app"><LayoutDashboard size={16}/> Dashboard</Link><Link href="/app/jobs"><BriefcaseBusiness size={16}/> Jobs</Link><Link href="/app/jobs/new"><FilePlus2 size={16}/> Create</Link><Link href="/app/activity"><ScrollText size={16}/> Activity</Link><Link href="/app/treasury"><WalletCards size={16}/> Treasury</Link><Link href="/docs">Docs</Link></nav></aside><main className="main">{children}</main></div>; }
