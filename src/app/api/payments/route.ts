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
  const filter = searchParams.get("filter"); // "all" | "personal" | teamId

  const userId = (session.user as any).id;

  // Get all teams this user is a member of
  const { data: memberRows } = await db
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);

  const myTeamIds = (memberRows ?? []).map((r: any) => r.team_id);

  let query = db
    .from("payments")
    .select("*, added_by_user:users!payments_user_id_fkey(name, email, avatar_url)")
    .order("start_date", { ascending: true });

  if (teamId) {
    // Show all payments for a specific team
    query = query.eq("team_id", teamId);
  } else if (filter === "personal") {
    // Only personal (no team)
    query = query.eq("user_id", userId).is("team_id", null);
  } else if (filter && filter !== "all") {
    // Filter by a specific team id passed as filter
    query = query.eq("team_id", filter);
  } else {
    // "all": personal + all team payments for teams user belongs to
    if (myTeamIds.length > 0) {
      query = query.or(
        `user_id.eq.${userId},team_id.in.(${myTeamIds.join(",")})`
      );
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

  console.log("POST /api/payments - userId:", userId, "email:", session.user.email);

  if (!userId) {
    return NextResponse.json({ error: "User not found in database. Please sign out and sign in again." }, { status: 500 });
  }

  const body = await req.json();
  console.log("POST /api/payments - body:", body);

  const { data, error } = await db
    .from("payments")
    .insert({
      user_id: userId,
      team_id: body.team_id || null,
      name: body.name,
      amount: body.amount,
      start_date: body.start_date,
      day_of_month: new Date(body.start_date).getDate(),
      total_installments: body.total_installments,
      paid_installments: 0,
    })
    .select("*")
    .single();

  if (error) {
    console.error("POST /api/payments Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
