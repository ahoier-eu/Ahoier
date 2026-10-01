import { CommunityApp } from "@/components/community-app";
import { allStops, getFleet } from "@/lib/itineraries";
import { addDays, shipLocalDateTime } from "@/lib/journey";

export const dynamic = "force-dynamic";

export default function Home() {
  const today = shipLocalDateTime().date;
  const fleet = getFleet();
  const ship = fleet.find(s => s.name === "AIDAcosma")?.name ?? fleet[0].name;
  const first = allStops().find(s => s.ship === ship && s.date >= today) ?? allStops().find(s => s.ship === ship);
  const from = first?.date ?? today;
  const initialJourney = { ship, from, to: addDays(from, 7) };
  return <CommunityApp fleet={fleet} initialJourney={initialJourney} />;
}
