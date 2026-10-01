import { PilotApp } from "@/components/pilot-app";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ahoier Pilot — Treffen an Bord", robots: { index: false, follow: false } };

export default function PilotPage() {
  return <PilotApp />;
}
