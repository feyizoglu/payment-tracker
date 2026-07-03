import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { cleanCurrencyAmounts } from "@/lib/payments";

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

function normalizePeriod(v: string): string {
  const [y, m] = v.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params; // recurring_id
  const db = supabaseAdmin();
  const userId = user.id;

  if (!(await canManage(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json(); // { period, amount?, is_paid? }
  if (!body.period) {
    return NextResponse.json({ error: "period is required" }, { status: 400 });
  }

  const payload: Record<string, any> = {
    recurring_id: id,
    period: normalizePeriod(String(body.period)),
  };
  if (Array.isArray(body.amounts)) {
    // Multi-currency lines take precedence over the legacy single `amount`.
    const cleaned = cleanCurrencyAmounts(body.amounts);
    if ("error" in cleaned) {
      return NextResponse.json({ error: cleaned.error }, { status: 400 });
    }
    payload.amounts = cleaned.amounts;
    payload.amount = null;
  } else if (body.amount !== undefined) {
    payload.amount = body.amount === null || body.amount === "" ? null : Number(body.amount);
  }
  if (body.is_paid !== undefined) {
    payload.is_paid = !!body.is_paid;
    payload.paid_at = body.is_paid ? new Date().toISOString() : null;
  }
  if (body.due_date !== undefined) {
    payload.due_date = body.due_date ? String(body.due_date) : null;
  }

  const { data, error } = await db
    .from("recurring_entries")
    .upsert(payload, { onConflict: "recurring_id,period" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
