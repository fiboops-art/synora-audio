import type { Metadata } from "next";
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
  metadataBase: new URL("https://synora-audio.vercel.app"),
  title: "Synora Audio",
  description: "Infraestrutura inteligente de distribuição e monetização para música IA",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Synora Audio",
    description: "Infraestrutura para creators de música IA",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Synora Audio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Synora Audio",
    description: "Infraestrutura para creators de música IA",
    images: ["/og.png"],
  },
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
      <body className="min-h-full flex flex-col text-slate-50">
        <div className="flex-1">{children}</div>
        <footer className="mx-auto w-full max-w-6xl px-4 py-8">
          <div className="text-center text-xs text-slate-300/80">
            Synora — by Fiboops
          </div>
        </footer>
      </body>
    </html>
  );
}
