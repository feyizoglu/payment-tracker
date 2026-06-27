import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { cleanCurrencyAmounts } from "@/lib/payments";

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params; // payment_id
  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  if (!(await canManagePayment(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json(); // { installment_index, due_date, amount?, amounts? }
  if (body.installment_index == null) {
    return NextResponse.json({ error: "installment_index is required" }, { status: 400 });
  }

  const due_date = body.due_date ? String(body.due_date) : null;

  // Multi-currency lines take precedence over the legacy single `amount`.
  const cleaned = cleanCurrencyAmounts(body.amounts);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }
  const amounts = cleaned.amounts;

  const amount =
    amounts != null || body.amount === null || body.amount === "" || body.amount === undefined
      ? null
      : Number(body.amount);

  // Nothing set => reset to default (delete the override row)
  if (due_date == null && amount == null && amounts == null) {
    const { error } = await db
      .from("payment_overrides")
      .delete()
      .eq("payment_id", id)
      .eq("installment_index", body.installment_index);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reset: true });
  }

  const { data, error } = await db
    .from("payment_overrides")
    .upsert(
      { payment_id: id, installment_index: body.installment_index, due_date, amount, amounts },
      { onConflict: "payment_id,installment_index" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
