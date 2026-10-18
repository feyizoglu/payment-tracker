import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const EDITABLE_FIELDS = ["name", "amount", "currency", "total_installments", "paid_installments"] as const;

// Returns true if userId owns the payment OR is the team owner of the payment's team
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body?.[field] !== undefined) patch[field] = body[field];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const userId = user.id;

  // The payment's own creator is the common caller: one round trip updates and authorizes.
  const own = await db
    .from("payments")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (own.error) return NextResponse.json({ error: own.error.message }, { status: 500 });
  if (own.data) return NextResponse.json(own.data);

  if (!(await canManagePayment(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await db
    .from("payments")
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

  if (!(await canManagePayment(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await db.from("payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
