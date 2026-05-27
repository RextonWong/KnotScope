import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KnotScope — Lumber Inspection AI",
  description:
    "Factory-grade lumber inspection tool. Upload front and back photos of a board to detect knots, pair through-knots, and compute a structural grade.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-neutral-950 antialiased">
        {children}
        <Toaster theme="dark" richColors />
      </body>
    </html>
  );
}
