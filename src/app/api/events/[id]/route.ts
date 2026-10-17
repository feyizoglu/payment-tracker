import { NextRequest, NextResponse } from "next/server";
import { deleteEvent, loadEventDetail, updateEvent } from "@/lib/events-repo";
import { isIsoDate, jsonError, readJson, withParticipant } from "@/lib/events-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, event }) => {
    const detail = await loadEventDetail(db, id, event);
    return detail ? NextResponse.json(detail) : jsonError(404, "Not found");
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, user, event }) => {
    if (event.created_by !== user.id) return jsonError(403, "Only the creator can change the event");
    const body = await readJson(req);
    if (!body) return jsonError(400, "Invalid body");
    const patch: { name?: string; event_date?: string | null; status?: "open" | "closed" } = {};
    if ("name" in body) {
      if (typeof body.name !== "string" || !body.name.trim()) return jsonError(400, "Event name is required");
      patch.name = body.name.trim();
    }
    if ("event_date" in body) {
      if (body.event_date !== null && !isIsoDate(body.event_date)) return jsonError(400, "Invalid date");
      patch.event_date = body.event_date as string | null;
    }
    if ("status" in body) {
      if (body.status !== "open" && body.status !== "closed") return jsonError(400, "Invalid status");
      patch.status = body.status;
    }
    if (Object.keys(patch).length === 0) return jsonError(400, "Nothing to update");
    await updateEvent(db, id, patch);
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, user, event }) => {
    if (event.created_by !== user.id) return jsonError(403, "Only the creator can delete the event");
    await deleteEvent(db, id);
    return new NextResponse(null, { status: 204 });
  });
}
