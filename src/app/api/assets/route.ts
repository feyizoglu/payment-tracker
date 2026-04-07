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

  // Get all teams this user is a member of
  const { data: memberRows } = await db
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);

  const myTeamIds = (memberRows ?? []).map((r: any) => r.team_id);

  let query = db
    .from("assets")
    .select("*, user:users!assets_user_id_fkey(name, email, avatar_url, color)")
    .order("created_at", { ascending: false });

  if (myTeamIds.length > 0) {
    query = query.or(
      `user_id.eq.${userId},team_id.in.(${myTeamIds.join(",")})`
    );
  } else {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  if (!userId) {
    return NextResponse.json(
      { error: "User not found in database. Please sign out and sign in again." },
      { status: 500 }
    );
  }

  const body = await req.json();

  // Admin can add on behalf of another team member
  let targetUserId = userId;
  if (body.target_user_id && body.target_user_id !== userId) {
    if (!body.team_id) {
      return NextResponse.json({ error: "team_id required when specifying target_user_id" }, { status: 400 });
    }
    const { data: membership } = await db
      .from("team_members")
      .select("role")
      .eq("team_id", body.team_id)
      .eq("user_id", userId)
      .single();
    if (membership?.role !== "owner") {
      return NextResponse.json({ error: "Only team owners can add assets for other members" }, { status: 403 });
    }
    targetUserId = body.target_user_id;
  }

  const { data, error } = await db
    .from("assets")
    .insert({
      user_id: targetUserId,
      team_id: body.team_id || null,
      bank_name: body.bank_name,
      currency: body.currency,
      amount: body.amount,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
