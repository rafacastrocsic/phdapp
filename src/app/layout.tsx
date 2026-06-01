import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PhDapp · Supervision Hub",
  description:
    "Chat, files, tasks, and calendar — one single workspace for PhD student supervision.",
  // PWA manifest — enables "Add to Home Screen" on iOS / Android.
  // On iOS, installing as a standalone PWA is also a prerequisite
  // for the future Web Push notifications work (see
  // IMPROVEMENT_PLAN.md → FUTURE).
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "PhDapp",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

// Explicit viewport so phones get the right zoom and so notched
// devices (iPhone 14, etc.) can use env(safe-area-inset-*) padding
// via the "cover" fit. themeColor matches the brand violet so the
// iOS PWA status bar tint and Chrome's URL bar match the app.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6f4cff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
