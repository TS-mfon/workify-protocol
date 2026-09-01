import Link from "next/link";
import Image from "next/image";
import { WalletButton } from "./WalletButton";

export function Nav() { return <header className="nav"><Link className="brand" href="/"><Image className="brand-mark" src="/icon.svg" alt="" width={34} height={34}/>Workify</Link><nav className="nav-links"><Link href="/#protocol">Protocol</Link><Link href="/explorer">Explorer</Link><Link href="/#economics">Economics</Link><Link href="/docs">Docs</Link></nav><div className="nav-actions"><Link className="button secondary compact" href="/app">Open app</Link><WalletButton compact /></div></header>; }
