import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ahoier — Zusammen mehr Meer.",
  description: "Deine Community an Bord: gemeinsame Treffen, neue Bekanntschaften und Austausch unter AIDA Gästen. Lokale Vorschau.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f7f8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="de"><body>{children}</body></html>;
}
