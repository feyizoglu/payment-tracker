import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  if (!userId) {
    return NextResponse.json({ error: "User not found in database" }, { status: 500 });
  }

  const { data, error } = await db
    .from("team_members")
    .select("team:teams(*, members:team_members(user_id, role, joined_at))")
    .eq("user_id", userId);

  if (error) {
    console.error("GET /api/teams error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const teams = data?.map((d: any) => d.team).filter(Boolean) ?? [];
  return NextResponse.json(teams);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  if (!userId) {
    return NextResponse.json({ error: "User not found in database" }, { status: 500 });
  }

  const { name } = await req.json();

  const { data: team, error: teamError } = await db
    .from("teams")
    .insert({ name, created_by: userId })
    .select()
    .single();

  if (teamError) {
    console.error("POST /api/teams error:", teamError);
    return NextResponse.json({ error: teamError.message }, { status: 500 });
  }

  await db.from("team_members").insert({
    team_id: team.id,
    user_id: userId,
    role: "owner",
  });

  return NextResponse.json(team, { status: 201 });
}
