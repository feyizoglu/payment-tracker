import { NextRequest, NextResponse } from "next/server";
import { deleteExpense, expenseEventId, listParticipants, replaceExpense } from "@/lib/events-repo";
import { eventClosed, isUuid, jsonError, readJson, withParticipant } from "@/lib/events-api";
import { parseExpenseInput } from "@/lib/expense-input";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; eid: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id, eid } = await params;
  return withParticipant(req, id, async ({ db, event }) => {
    if (!isUuid(eid)) return jsonError(404, "Not found");
    if (event.status === "closed") return eventClosed();
    if ((await expenseEventId(db, eid)) !== id) return jsonError(404, "Not found");
    const participants = await listParticipants(db, id);
    const parsed = parseExpenseInput(await readJson(req), participants.map((p) => p.id));
    if (!parsed.ok) return jsonError(400, parsed.error);
    await replaceExpense(db, eid, parsed.row, parsed.shares);
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id, eid } = await params;
  return withParticipant(req, id, async ({ db, event }) => {
    if (!isUuid(eid)) return jsonError(404, "Not found");
    if (event.status === "closed") return eventClosed();
    if ((await expenseEventId(db, eid)) !== id) return jsonError(404, "Not found");
    await deleteExpense(db, eid);
    return new NextResponse(null, { status: 204 });
  });
}
