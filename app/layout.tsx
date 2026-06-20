import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Rapid Tile Portal",
  description: "Multi-tenant SaaS portal for managing client knowledge bases.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Theme is read server-side from the cookie and set on <html> before paint,
  // so there's no flash. Default is dark. The toggle (Profile → Appearance)
  // flips the cookie + data-theme live.
  const theme = cookies().get("theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="en" data-theme={theme} className={inter.variable}>
      <body className="font-sans">
        {children}
        <Toaster richColors theme={theme} />
      </body>
    </html>
  );
}
