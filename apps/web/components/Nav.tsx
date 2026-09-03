import Link from "next/link";
import Image from "next/image";
import { WalletButton } from "./WalletButton";

export function Nav() {
  return <header className="nav"><Link className="brand" href="/"><Image className="brand-mark" src="/icon.svg" alt="" width={30} height={30}/><span>Workify<small>VERIFIED SETTLEMENT</small></span></Link><nav className="nav-links" aria-label="Primary navigation"><Link href="/#protocol">Protocol</Link><Link href="/explorer">Explorer</Link><Link href="/docs">Docs</Link></nav><div className="nav-actions"><Link className="nav-app-link" href="/app">Open app</Link><WalletButton compact /></div></header>;
}
