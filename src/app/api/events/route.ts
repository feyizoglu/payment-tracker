import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { createEvent, listMyEventIds, loadEventDetail } from "@/lib/events-repo";
import { isIsoDate, jsonError, readJson } from "@/lib/events-api";
import { balances } from "@/lib/split";
import type { EventSummary } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return jsonError(401, "Unauthorized");
  try {
    const db = supabaseAdmin();
    const ids = await listMyEventIds(db, user.id);
    const details = (await Promise.all(ids.map((id) => loadEventDetail(db, id)))).filter((d) => d !== null);
    const summaries: EventSummary[] = details.map(({ participants, expenses, settlements, ...event }) => {
      const meId = participants.find((p) => p.user_id === user.id)?.id;
      const my_balance: Record<string, number> = {};
      for (const [currency, row] of Object.entries(balances(expenses, settlements))) {
        if (meId && row[meId]) my_balance[currency] = row[meId];
      }
      return { ...event, my_balance };
    });
    summaries.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return NextResponse.json(summaries);
  } catch (e) {
    console.error("GET /api/events error:", e);
    return jsonError(500, "Internal error");
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return jsonError(401, "Unauthorized");
  const body = await readJson(req);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const eventDate = body?.event_date ?? null;
  if (!name) return jsonError(400, "Event name is required");
  if (eventDate !== null && !isIsoDate(eventDate)) return jsonError(400, "Invalid date");
  try {
    const event = await createEvent(supabaseAdmin(), user.id, name, eventDate);
    return NextResponse.json(event, { status: 201 });
  } catch (e) {
    console.error("POST /api/events error:", e);
    return jsonError(500, "Internal error");
  }
}
