import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { findMyParticipant, getEvent } from "@/lib/events-repo";
import { isUuid } from "@/lib/event-validators";
import type { SplitEvent } from "@/types";

export { isCurrency, isIsoDate, isUuid, parseAmountMinor } from "@/lib/event-validators";

export interface ParticipantContext {
  db: ReturnType<typeof supabaseAdmin>;
  user: SessionUser;
  me: { id: string };
  event: SplitEvent;
}

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

// Auth + membership for every /api/events/[id]/* route. Not a participant -> 404, so an
// outsider cannot tell whether an event id exists.
export async function withParticipant(
  req: Request,
  eventId: string,
  handler: (ctx: ParticipantContext) => Promise<Response>
): Promise<Response> {
  const user = await getSessionUser(req);
  if (!user) return jsonError(401, "Unauthorized");
  if (!isUuid(eventId)) return jsonError(404, "Not found");
  try {
    const db = supabaseAdmin();
    const me = await findMyParticipant(db, eventId, user.id);
    if (!me) return jsonError(404, "Not found");
    const event = await getEvent(db, eventId);
    if (!event) return jsonError(404, "Not found");
    return await handler({ db, user, me, event });
  } catch (e) {
    console.error(`events route ${eventId}:`, e);
    return jsonError(500, "Internal error");
  }
}

export function eventClosed() {
  return jsonError(409, "Event is closed");
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
