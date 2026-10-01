import { NextRequest, NextResponse } from "next/server";
import { getFleet, getStops } from "@/lib/itineraries";
import { validateJourney } from "@/lib/journey";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const journey = { ship: params.get("ship") ?? "", from: params.get("from") ?? "", to: params.get("to") ?? "" };
  const error = validateJourney(journey, getFleet());
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ stops: getStops(journey) }, { headers: { "Cache-Control": "public, max-age=300" } });
}
