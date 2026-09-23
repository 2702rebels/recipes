import "katex/dist/katex.css";
import "./global.css";

import { Geist, Geist_Mono } from "next/font/google";

import { Provider } from "@/components/provider";
import { appName } from "@/lib/shared";

import type { Metadata } from "next";

// Exposed as CSS variables so Tailwind's font-sans and font-mono use them (see @theme in global.css).
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  // Site origin for absolute Open Graph URLs. Page metadata adds any Pages base path itself.
  metadataBase: new URL("https://recipes.2702rebels.com"),
  title: {
    template: `%s | ${appName}`,
    default: appName,
  },
  description: "Best practices, tuning guides, and training material from FRC Team 2702 (Rebels).",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
