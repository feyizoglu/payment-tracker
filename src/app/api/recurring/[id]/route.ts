import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function canManage(db: ReturnType<typeof supabaseAdmin>, id: string, userId: string) {
  const { data: row } = await db
    .from("recurring_payments")
    .select("user_id, team_id")
    .eq("id", id)
    .single();
  if (!row) return false;
  if (row.user_id === userId) return true;
  if (row.team_id) {
    const { data: m } = await db
      .from("team_members")
      .select("role")
      .eq("team_id", row.team_id)
      .eq("user_id", userId)
      .single();
    return m?.role === "owner";
  }
  return false;
}

function normalizeMonth(v: string): string {
  const [y, m] = v.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = supabaseAdmin();
  const userId = user.id;

  if (!(await canManage(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const patch: Record<string, any> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.day_of_month !== undefined) patch.day_of_month = body.day_of_month;
  if (body.end_month !== undefined) {
    patch.end_month = body.end_month ? normalizeMonth(String(body.end_month)) : null;
  }

  const { data, error } = await db
    .from("recurring_payments")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = supabaseAdmin();
  const userId = user.id;

  if (!(await canManage(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await db.from("recurring_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
