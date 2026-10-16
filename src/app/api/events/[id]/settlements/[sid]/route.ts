import { NextRequest, NextResponse } from "next/server";
import { deleteSettlement, settlementEventId } from "@/lib/events-repo";
import { eventClosed, isUuid, jsonError, withParticipant } from "@/lib/events-api";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  return withParticipant(req, id, async ({ db, event }) => {
    if (!isUuid(sid)) return jsonError(404, "Not found");
    if (event.status === "closed") return eventClosed();
    if ((await settlementEventId(db, sid)) !== id) return jsonError(404, "Not found");
    await deleteSettlement(db, sid);
    return new NextResponse(null, { status: 204 });
  });
}
