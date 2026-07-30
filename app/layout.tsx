import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Bebas_Neue, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// Revamp typography — Plus Jakarta Sans (UI), Bebas Neue (brand display:
// logo, hero greeting, big stat numbers), JetBrains Mono (overlines, badges).
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700", "800"] });
const display = Bebas_Neue({ subsets: ["latin"], variable: "--font-display", weight: "400" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "RapidTal Portal",
  description: "Multi-tenant SaaS portal for managing client knowledge bases.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Theme is read server-side from the cookie and set on <html> before paint,
  // so there's no flash. Default is dark. The toggle (Profile → Appearance)
  // flips the cookie + data-theme live.
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="en" data-theme={theme} className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="font-sans">
        {children}
        <Toaster richColors theme={theme} />
      </body>
    </html>
  );
}
