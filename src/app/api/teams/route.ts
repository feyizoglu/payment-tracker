import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  const { data, error } = await db
    .from("team_members")
    .select("team:teams(*, members:team_members(*, user:users(id, name, email, avatar_url)))")
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
  const { name } = await req.json();

  const { data: team, error: teamError } = await db
    .from("teams")
    .insert({ name, created_by: userId })
    .select()
    .single();

  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });

  await db.from("team_members").insert({
    team_id: team.id,
    user_id: userId,
    role: "owner",
  });

  return NextResponse.json(team, { status: 201 });
}
