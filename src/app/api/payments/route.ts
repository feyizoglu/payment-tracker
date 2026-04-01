import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("team_id");

  const userId = (session.user as any).id;

  let query = db
    .from("payments")
    .select("*, user:users(id, name, email, avatar_url)")
    .order("start_date", { ascending: true });

  if (teamId) {
    query = query.eq("team_id", teamId);
  } else {
    query = query.eq("user_id", userId).is("team_id", null);
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
  const body = await req.json();

  const { data, error } = await db
    .from("payments")
    .insert({
      user_id: userId,
      team_id: body.team_id || null,
      name: body.name,
      amount: body.amount,
      start_date: body.start_date,
      day_of_month: body.day_of_month,
      total_installments: body.total_installments,
      paid_installments: 0,
    })
    .select("*, user:users(id, name, email, avatar_url)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
