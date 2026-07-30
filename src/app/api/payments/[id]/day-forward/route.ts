import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { cleanCurrencyAmounts, forwardInstallmentDueDates } from "@/lib/payments";
import type { Payment } from "@/types";

export const dynamic = "force-dynamic";

async function canManagePayment(db: ReturnType<typeof supabaseAdmin>, paymentId: string, userId: string) {
  const { data: payment } = await db
    .from("payments")
    .select("user_id, team_id")
    .eq("id", paymentId)
    .single();
  if (!payment) return false;
  if (payment.user_id === userId) return true;
  if (payment.team_id) {
    const { data: membership } = await db
      .from("team_members")
      .select("role")
      .eq("team_id", payment.team_id)
      .eq("user_id", userId)
      .single();
    return membership?.role === "owner";
  }
  return false;
}

// Set the day-of-month for installment `from_installment_index` and every later
// installment (a forward day-change), leaving earlier installments (index <
// from_installment_index) untouched. Writes a due_date override per remaining index,
// preserving any existing amount overrides on those indices; edited amounts apply
// only to the starting index. Body: { from_installment_index, day, amounts? }.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params; // payment_id
  const db = supabaseAdmin();
  const userId = user.id;

  if (!(await canManagePayment(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json(); // { from_installment_index, day, amounts? }
  const fromIndex = Number(body.from_installment_index);
  if (!Number.isInteger(fromIndex) || fromIndex < 0) {
    return NextResponse.json({ error: "from_installment_index must be an integer >= 0" }, { status: 400 });
  }
  const day = Number(body.day);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return NextResponse.json({ error: "day must be an integer between 1 and 31" }, { status: 400 });
  }

  // Validate amounts BEFORE any write so a bad payload cannot leave the schedule
  // partially rewritten (the due_date upsert below would otherwise already be committed).
  const cleaned = cleanCurrencyAmounts(body.amounts);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }

  const { data: payment, error: readErr } = await db
    .from("payments")
    .select("start_date, total_installments")
    .eq("id", id)
    .single();
  if (readErr || !payment) {
    return NextResponse.json({ error: readErr?.message ?? "Not found" }, { status: 404 });
  }

  const rows = forwardInstallmentDueDates(payment as Payment, fromIndex, day);
  if (rows.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // Merge-upsert the due_date for each remaining index. The payload omits
  // amount/amounts, so on conflict only due_date is updated (existing amount
  // overrides are preserved).
  const { error: dueErr } = await db
    .from("payment_overrides")
    .upsert(
      rows.map((r) => ({ payment_id: id, installment_index: r.index, due_date: r.due_date })),
      { onConflict: "payment_id,installment_index" }
    );
  if (dueErr) return NextResponse.json({ error: dueErr.message }, { status: 500 });

  // Edited amounts apply only to the starting index.
  if (cleaned.amounts != null) {
    const { error: amtErr } = await db
      .from("payment_overrides")
      .upsert(
        { payment_id: id, installment_index: fromIndex, amounts: cleaned.amounts, amount: null },
        { onConflict: "payment_id,installment_index" }
      );
    if (amtErr) return NextResponse.json({ error: amtErr.message }, { status: 500 });
  }

  return NextResponse.json({ updated: rows.length });
}
