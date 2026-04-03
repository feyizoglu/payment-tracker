import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { LanguageProvider } from "@/lib/i18n";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PayTrack – Team Payment Tracker",
  description: "Track installment payments by date with your team",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-gray-50 text-gray-900 min-h-screen`}>
        <SessionProvider><LanguageProvider>{children}</LanguageProvider></SessionProvider>
      </body>
    </html>
  );
}
