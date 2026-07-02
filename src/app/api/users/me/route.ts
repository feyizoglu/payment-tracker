import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { color } = await req.json();
  const db = supabaseAdmin();

  const { error } = await db
    .from("users")
    .update({ color })
    .eq("email", user.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
