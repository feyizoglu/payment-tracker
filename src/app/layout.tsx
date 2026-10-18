import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { LanguageProvider } from "@/lib/i18n";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

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
    // The init script adds the "dark" class before hydration, so React must not flag it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${geist.className} bg-gray-50 text-gray-900 min-h-screen`}>
        <SessionProvider><LanguageProvider>{children}</LanguageProvider></SessionProvider>
      </body>
    </html>
  );
}
