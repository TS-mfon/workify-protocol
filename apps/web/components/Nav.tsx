import Link from "next/link";
import Image from "next/image";

export function Nav() { return <header className="nav"><Link className="brand" href="/"><Image className="brand-mark" src="/icon.svg" alt="" width={32} height={32}/>Workify</Link><nav className="nav-links"><Link href="/#protocol">Protocol</Link><Link href="/#economics">Economics</Link><Link href="/docs">Docs</Link></nav><Link className="button" href="/app">Launch app</Link></header>; }
