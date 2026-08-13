import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { id: teamId } = await params;
  const { email } = await req.json();

  // Only an owner of THIS team may add members. Without this check any signed-in user
  // who knows (or guesses) a team id could add themselves to it and read every payment
  // and asset shared with that team.
  const { data: membership } = await db
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Find user by email
  const { data: invitedUser, error: userError } = await db
    .from("users")
    .select("id")
    .eq("email", email.trim())
    .single();

  if (userError || !invitedUser) {
    return NextResponse.json(
      { error: "User not found. They must sign in first." },
      { status: 404 }
    );
  }

  const { error } = await db.from("team_members").upsert({
    team_id: teamId,
    user_id: invitedUser.id,
    role: "member",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
