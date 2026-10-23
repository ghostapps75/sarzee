import type { Metadata, Viewport } from "next";
import { Archivo_Narrow, Geist, Geist_Mono, Patrick_Hand } from "next/font/google";
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
};

export const metadata: Metadata = {
  metadataBase: new URL('https://sarzee.netlify.app'),
  title: "Sarzee - Multiplayer Dice Game",
  description: "Play Sarzee, the ultimate multiplayer dice game with realistic physics. Roll 5-of-a-kind to win big!",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: "Sarzee - Multiplayer Dice Game",
    description: "Play Sarzee with friends! Realistic 3D dice rolling and handwritten scoring.",
    images: ['/assets/thumbnail.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Sarzee",
    description: "Multiplayer dice game with physics.",
    images: ['/assets/thumbnail.png'],
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
