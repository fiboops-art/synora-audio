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
  title: "Synora Creators",
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
    title: "Synora Creators",
    description: "Infraestrutura para creators de música IA",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Synora Creators",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Synora Creators",
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
          <div className="flex flex-col items-center gap-2 text-center text-xs text-slate-300/80">
            <div>Synora — by Fiboops</div>

            <a
              href="mailto:hello@synora.app.br"
              className="transition-colors hover:text-slate-50"
            >
              hello@synora.app.br
            </a>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <a
                href="https://wa.me/5548999172077"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-slate-50"
              >
                🇧🇷 Brasil · +55 48 99917-2077
              </a>

              <a
                href="https://wa.me/5492302501535"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-slate-50"
              >
                🇦🇷 Argentina · +54 9 2302 50-1535
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
