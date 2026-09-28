import type { Metadata } from "next";
import { IBM_Plex_Mono, Libre_Franklin, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";

import { AppFrame } from "@/components/shell/app-frame";
import { PactProvider } from "@/lib/genlayer/hooks";
import { WalletProvider } from "@/lib/wallet/wallet";
import "./globals.css";

const franklin = Libre_Franklin({ subsets: ["latin"], variable: "--font-franklin",
                                  display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif",
                                     display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains",
                             display: "swap" });

export const metadata: Metadata = {
  title: "PACT: agreements that can be adjudicated on-chain",
  description:
    "PACT turns natural-language commitments into semantic constraints, evaluates real-world evidence "
    + "through GenLayer, and settles the resulting state deterministically.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${franklin.variable} ${sourceSerif.variable} ${mono.variable}`}>
      <body>
        <WalletProvider>
          <PactProvider>
            <AppFrame>{children}</AppFrame>
          </PactProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
