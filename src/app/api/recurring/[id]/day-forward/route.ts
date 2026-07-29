import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { cleanCurrencyAmounts, upsertDayChange } from "@/lib/payments";
import type { DayChange } from "@/types";

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

// Change the recurring series' day-of-month for `period` and every later month
// (a forward day-change), without rewriting past months. Records the change in
// recurring_payments.day_changes and clears this month's per-month due_date
// override so the new effective day shows. Body: { period, day, amounts? }.
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

  const body = await req.json(); // { period, day, amounts? }
  if (!body.period) {
    return NextResponse.json({ error: "period is required" }, { status: 400 });
  }
  const day = Number(body.day);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return NextResponse.json({ error: "day must be an integer between 1 and 31" }, { status: 400 });
  }
  const period = normalizePeriod(String(body.period));

  // Append/replace the forward day-change on the series.
  const { data: row, error: readErr } = await db
    .from("recurring_payments")
    .select("day_changes")
    .eq("id", id)
    .single();
  if (readErr || !row) {
    return NextResponse.json({ error: readErr?.message ?? "Not found" }, { status: 404 });
  }
  const next = upsertDayChange((row.day_changes as DayChange[] | null) ?? null, period, day);
  const { error: updErr } = await db
    .from("recurring_payments")
    .update({ day_changes: next })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // This month must follow the new effective day, so drop any per-month date
  // override it had; persist edited amounts if provided. Only write an entry when
  // there is something to change, to avoid creating empty rows.
  const cleaned = cleanCurrencyAmounts(body.amounts);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }
  const { data: entry } = await db
    .from("recurring_entries")
    .select("id, due_date")
    .eq("recurring_id", id)
    .eq("period", period)
    .maybeSingle();

  const needsClear = !!entry?.due_date;
  const hasAmounts = cleaned.amounts != null;
  if (needsClear || hasAmounts) {
    const entryPayload: Record<string, unknown> = { recurring_id: id, period };
    if (needsClear) entryPayload.due_date = null;
    if (hasAmounts) {
      entryPayload.amounts = cleaned.amounts;
      entryPayload.amount = null;
    }
    const { error: entryErr } = await db
      .from("recurring_entries")
      .upsert(entryPayload, { onConflict: "recurring_id,period" });
    if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 500 });
  }

  return NextResponse.json({ day_changes: next });
}
