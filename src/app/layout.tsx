import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZephyrStream — Multi-Channel YouTube Live Streaming",
  description:
    "Self-hosted web platform for managing multi-channel YouTube live streams with VPS monitoring, multi-API channel management, and stream-key-based broadcasting.",
  keywords: [
    "YouTube",
    "live streaming",
    "FFmpeg",
    "VPS",
    "multi-channel",
    "ZephyrStream",
    "stream key",
    "Google Cloud",
  ],
  authors: [{ name: "ZephyrStream" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "ZephyrStream",
    description: "Multi-Channel YouTube Live Streaming Platform",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <QueryProvider>
          {children}
          <Toaster />
          <SonnerToaster
            position="bottom-right"
            theme="dark"
            toastOptions={{
              style: {
                background: "oklch(0.14 0.006 240)",
                border: "1px solid oklch(0.22 0.008 240)",
                color: "oklch(0.97 0.003 240)",
              },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
