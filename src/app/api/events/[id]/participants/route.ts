import { NextRequest, NextResponse } from "next/server";
import { addParticipant, findUserByEmail, shareATeam } from "@/lib/events-repo";
import { eventClosed, isUuid, jsonError, readJson, withParticipant } from "@/lib/events-api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, user, event }) => {
    if (event.status === "closed") return eventClosed();
    const body = await readJson(req);
    let who: { user_id: string } | { display_name: string };
    if (typeof body?.display_name === "string" && body.display_name.trim()) {
      who = { display_name: body.display_name.trim() };
    } else if (typeof body?.user_id === "string" && body.user_id) {
      if (!isUuid(body.user_id)) return jsonError(400, "Invalid user id");
      if (!(await shareATeam(db, user.id, body.user_id))) return jsonError(403, "Not a team mate");
      who = { user_id: body.user_id };
    } else if (typeof body?.email === "string" && body.email.trim()) {
      const found = await findUserByEmail(db, body.email.trim());
      if (!found) return jsonError(404, "User not found");
      who = { user_id: found.id };
    } else {
      return jsonError(400, "A name, team mate or email is required");
    }
    const participant = await addParticipant(db, id, who);
    return participant ? NextResponse.json(participant, { status: 201 }) : jsonError(409, "Already in the event");
  });
}
