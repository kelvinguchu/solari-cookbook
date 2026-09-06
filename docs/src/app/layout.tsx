import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistMono } from "geist/font/mono";
import { RootProvider } from "fumadocs-ui/provider/next";

import "./global.css";

const DESCRIPTION =
  "FlakeLab finds, reproduces, explains, and proves fixes for flaky Playwright tests " +
  "with deterministic fault experiments, bounded AI reasoning, and disposable Solari sandboxes.";

export const metadata: Metadata = {
  applicationName: "FlakeLab",
  description: DESCRIPTION,
  metadataBase: new URL("https://flakelab.vercel.app"),
  openGraph: {
    description: DESCRIPTION,
    siteName: "FlakeLab",
    title: "FlakeLab - find the trigger, prove the fix",
    type: "website",
  },
  title: {
    default: "FlakeLab - find the trigger, prove the fix",
    template: "%s · FlakeLab",
  },
  twitter: {
    card: "summary_large_image",
    description: DESCRIPTION,
    title: "FlakeLab - find the trigger, prove the fix",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#ffffff", media: "(prefers-color-scheme: light)" },
    { color: "#060c12", media: "(prefers-color-scheme: dark)" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={GeistMono.variable} lang='en' suppressHydrationWarning>
      <body className='flex min-h-screen flex-col antialiased'>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
