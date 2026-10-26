import type { Metadata, Viewport } from "next";
import { Archivo_Narrow, Geist, Geist_Mono, Patrick_Hand } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, THEME_COLOR } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const patrickHand = Patrick_Hand({
  weight: "400",
  variable: "--font-patrick-hand",
  subsets: ["latin"],
});

// The scorecard's printed type: labels, rules and computed totals. Handwriting is kept
// for what a player writes, so the arithmetic doesn't look pencilled in.
const archivoNarrow = Archivo_Narrow({
  variable: "--font-archivo-narrow",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // Enables fullscreen-like experience on iPad
  themeColor: THEME_COLOR,
};

// The share card (app/opengraph-image.jpg, with its alt text alongside) and the icons
// (app/icon.png, app/apple-icon.png, app/favicon.ico) are picked up from their filenames,
// so they need no entries here. See scripts/social-card.ts and scripts/brand-icons.js.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: SITE_NAME,
    locale: 'en_US',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // Title, description and image are inherited from openGraph; only the card type differs.
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${patrickHand.variable} ${archivoNarrow.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
