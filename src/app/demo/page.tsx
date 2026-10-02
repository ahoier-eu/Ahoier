import type { Metadata } from "next";
import { CommunityApp } from "@/components/community-app";
import { allStops, getFleet } from "@/lib/itineraries";
import { addDays, shipLocalDateTime } from "@/lib/journey";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ahoier Demo — Lokale Vorschau",
  description: "Interaktive Ahoier-Vorschau mit fiktiven Beispielpersonen. Inhalte bleiben in diesem Browser.",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  const today = shipLocalDateTime().date;
  const fleet = getFleet();
  const ship = fleet.find(s => s.name === "AIDAcosma")?.name ?? fleet[0].name;
  const first = allStops().find(s => s.ship === ship && s.date >= today) ?? allStops().find(s => s.ship === ship);
  const from = first?.date ?? today;
  const initialJourney = { ship, from, to: addDays(from, 7) };
  const liveEnabled = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const pilotEnabled = process.env.VERCEL !== "1" &&
    (process.env.NODE_ENV !== "production" || process.env.AHOIER_PILOT_ENABLED === "1");
  return <CommunityApp fleet={fleet} initialJourney={initialJourney} liveEnabled={liveEnabled} pilotEnabled={pilotEnabled} />;
}
