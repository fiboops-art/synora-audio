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
  title: "Synora Audio",
  description: "Infraestrutura inteligente de distribuição e monetização para música IA",
  icons: {
    icon: "/synora-logo.svg",
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
      <body className="min-h-full flex flex-col">
        <div className="min-h-dvh bg-white text-slate-950">
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="absolute inset-0 opacity-90">
              <div
                className="h-full w-full bg-[url('/bg-synora-calm.svg')] bg-cover bg-center bg-no-repeat"
                aria-hidden="true"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/35 to-white/60" />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
