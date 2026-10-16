import { NextRequest, NextResponse } from "next/server";
import { insertSettlement, listParticipants } from "@/lib/events-repo";
import { eventClosed, isCurrency, jsonError, parseAmountMinor, readJson, withParticipant } from "@/lib/events-api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, user, event }) => {
    if (event.status === "closed") return eventClosed();
    const body = await readJson(req);
    const ids = new Set((await listParticipants(db, id)).map((p) => p.id));
    const from = body?.from_participant;
    const to = body?.to_participant;
    const amount = parseAmountMinor(body?.amount_minor);
    if (typeof from !== "string" || typeof to !== "string" || !ids.has(from) || !ids.has(to) || from === to) {
      return jsonError(400, "Invalid participants");
    }
    if (amount === null) return jsonError(400, "Invalid amount");
    if (!isCurrency(body?.currency)) return jsonError(400, "Invalid currency");
    const created = await insertSettlement(db, id, user.id, {
      from_participant: from,
      to_participant: to,
      amount_minor: amount,
      currency: body.currency as string,
    });
    return NextResponse.json(created, { status: 201 });
  });
}
