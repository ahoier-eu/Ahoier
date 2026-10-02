import { PilotApp } from "@/components/pilot-app";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Ahoier Pilot — Treffen an Bord", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function PilotPage() {
  // Production needs an explicit opt-in on a server with persistent SQLite storage.
  if (process.env.VERCEL === "1" ||
      (process.env.NODE_ENV === "production" && process.env.AHOIER_PILOT_ENABLED !== "1")) notFound();
  return <PilotApp />;
}
