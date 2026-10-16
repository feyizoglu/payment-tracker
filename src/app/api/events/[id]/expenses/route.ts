import { NextRequest, NextResponse } from "next/server";
import { insertExpense, listParticipants } from "@/lib/events-repo";
import { eventClosed, jsonError, readJson, withParticipant } from "@/lib/events-api";
import { parseExpenseInput } from "@/lib/expense-input";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, user, event }) => {
    if (event.status === "closed") return eventClosed();
    const participants = await listParticipants(db, id);
    const parsed = parseExpenseInput(await readJson(req), participants.map((p) => p.id));
    if (!parsed.ok) return jsonError(400, parsed.error);
    const created = await insertExpense(db, id, user.id, parsed.row, parsed.shares);
    return NextResponse.json(created, { status: 201 });
  });
}
