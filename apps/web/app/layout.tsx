import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://workify-protocol.vercel.app"),
  title: { default: "Workify — Verified Work Settlement", template: "%s · Workify" },
  description: "USDC escrow and decentralized AI adjudication for verifiable work.",
  applicationName: "Workify",
  manifest: "/site.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, "/favicon.ico"], apple: "/apple-touch-icon.png" },
  openGraph: { title: "Workify", description: "Verified work. Programmatic settlement.", images: ["/opengraph-image.png"] },
  twitter: { card: "summary_large_image", images: ["/twitter-image.png"] },
};

export const viewport: Viewport = { themeColor: "#050806", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><WalletProvider>{children}</WalletProvider></body></html>;
}
