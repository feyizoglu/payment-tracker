import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Returns true if userId owns the asset OR is the team owner of the asset's team
async function canManageAsset(db: ReturnType<typeof supabaseAdmin>, assetId: string, userId: string) {
  const { data: asset } = await db
    .from("assets")
    .select("user_id, team_id")
    .eq("id", assetId)
    .single();

  if (!asset) return false;
  if (asset.user_id === userId) return true;

  if (asset.team_id) {
    const { data: membership } = await db
      .from("team_members")
      .select("role")
      .eq("team_id", asset.team_id)
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
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  if (!(await canManageAsset(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { bank_name, amount } = body;

  const { data, error } = await db
    .from("assets")
    .update({ bank_name, amount })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  if (!(await canManageAsset(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await db.from("assets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
