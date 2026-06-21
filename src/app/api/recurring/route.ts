import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("team_id");
  const filter = searchParams.get("filter");
  const userId = (session.user as any).id;

  const { data: memberRows } = await db
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  const myTeamIds = (memberRows ?? []).map((r: any) => r.team_id);

  let query = db
    .from("recurring_payments")
    .select("*, entries:recurring_entries(*), added_by_user:users!recurring_payments_user_id_fkey(name, email, avatar_url)")
    .order("created_at", { ascending: true });

  if (teamId) {
    query = query.eq("team_id", teamId);
  } else if (filter === "personal") {
    query = query.eq("user_id", userId).is("team_id", null);
  } else if (filter && filter !== "all") {
    query = query.eq("team_id", filter);
  } else {
    if (myTeamIds.length > 0) {
      query = query.or(`user_id.eq.${userId},team_id.in.(${myTeamIds.join(",")})`);
    } else {
      query = query.eq("user_id", userId);
    }
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
    return NextResponse.json({ error: "User not found in database. Please sign out and sign in again." }, { status: 500 });
  }

  const body = await req.json();

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
      return NextResponse.json({ error: "Only team owners can add for other members" }, { status: 403 });
    }
    targetUserId = body.target_user_id;
  }

  const [sy, sm, sd] = String(body.start_date).split("-").map(Number);
  const day_of_month = sd;
  const start_month = `${sy}-${String(sm).padStart(2, "0")}-01`;

  let end_month: string | null = null;
  if (body.end_month) {
    const [ey, em] = String(body.end_month).split("-").map(Number);
    end_month = `${ey}-${String(em).padStart(2, "0")}-01`;
  }

  const { data, error } = await db
    .from("recurring_payments")
    .insert({
      user_id: targetUserId,
      team_id: body.team_id || null,
      name: body.name,
      currency: body.currency || "TRY",
      day_of_month,
      start_month,
      end_month,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
