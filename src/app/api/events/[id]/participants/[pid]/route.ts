import { NextRequest, NextResponse } from "next/server";
import { deleteParticipant, listParticipants, participantIsReferenced } from "@/lib/events-repo";
import { eventClosed, jsonError, withParticipant } from "@/lib/events-api";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  return withParticipant(req, id, async ({ db, event }) => {
    if (event.status === "closed") return eventClosed();
    const participants = await listParticipants(db, id);
    const target = participants.find((p) => p.id === pid);
    if (!target) return jsonError(404, "Not found");
    if (target.user_id === event.created_by) return jsonError(409, "The creator cannot be removed");
    if (await participantIsReferenced(db, pid)) return jsonError(409, "Participant has expenses or payments");
    await deleteParticipant(db, pid);
    return new NextResponse(null, { status: 204 });
  });
}
