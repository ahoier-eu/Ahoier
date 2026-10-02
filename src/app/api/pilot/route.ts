import { NextRequest, NextResponse } from "next/server";
import {
  applyPilotAction, joinPilot, openPilotDb, PilotError, pilotSessionAgeSeconds,
  readPilotState, type PilotAction,
} from "@/lib/pilot-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "ahoier_pilot";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const ACTIONS = new Set(["join", "create", "rsvp", "leave", "cancel", "attendance", "report", "logout"]);

function sameOriginMutation(request: NextRequest): boolean {
  const supplied = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!supplied || !host || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const origin = new URL(supplied);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    return origin.origin === supplied && origin.host.toLowerCase() === host.toLowerCase() &&
      (origin.protocol === "https:" || (loopback && origin.protocol === "http:"));
  } catch { return false; }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function errorResponse(error: unknown) {
  if (error instanceof PilotError) return json({ error: error.message }, error.status);
  console.error("Pilot API error", error);
  return json({ error: "Der Pilot ist momentan nicht verfügbar." }, 500);
}

async function limitedJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new PilotError("JSON erwartet.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new PilotError("Leere Anfrage.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new PilotError("Anfrage zu groß.", 413);
    }
    chunks.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid JSON object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new PilotError("Ungültiges JSON.", 400);
  }
}

export async function GET(request: NextRequest) {
  // Never open the local SQLite database in serverless deployments.
  if (process.env.VERCEL === "1" ||
      (process.env.NODE_ENV === "production" && process.env.AHOIER_PILOT_ENABLED !== "1"))
    return json({ error: "Nicht gefunden." }, 404);
  let db;
  try {
    db = openPilotDb();
    return json(readPilotState(db, request.cookies.get(COOKIE)?.value));
  } catch (error) {
    return errorResponse(error);
  } finally {
    db?.close();
  }
}

export async function POST(request: NextRequest) {
  if (process.env.VERCEL === "1" ||
      (process.env.NODE_ENV === "production" && process.env.AHOIER_PILOT_ENABLED !== "1"))
    return json({ error: "Nicht gefunden." }, 404);
  // Origin is mandatory for cookie-authenticated mutations. No cross-origin CORS access is granted.
  if (!sameOriginMutation(request))
    return json({ error: "Anfrage von anderer Herkunft abgelehnt." }, 403);
  let db;
  try {
    const body = await limitedJson(request);
    if (typeof body.action !== "string" || !ACTIONS.has(body.action))
      throw new PilotError("Unbekannte Aktion.", 400);
    db = openPilotDb();
    if (body.action === "join") {
      const { token, state } = joinPilot(db, body.code, body.name);
      const response = json(state);
      response.cookies.set(COOKIE, token, {
        httpOnly: true, sameSite: "strict",
        secure: !["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.headers.get("origin")!).hostname),
        path: "/", maxAge: pilotSessionAgeSeconds,
      });
      return response;
    }
    const state = applyPilotAction(db, request.cookies.get(COOKIE)?.value,
      body as Exclude<PilotAction, { action: "join" }>);
    const response = json(state);
    if (body.action === "logout") response.cookies.delete(COOKIE);
    return response;
  } catch (error) {
    return errorResponse(error);
  } finally {
    db?.close();
  }
}
