import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const token = body?.expo_push_token;
  if (typeof token !== "string" || !token.startsWith("ExponentPushToken")) {
    return NextResponse.json({ error: "expo_push_token required" }, { status: 400 });
  }
  const platform = body?.platform ?? "android";
  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json({ error: "platform must be 'ios' or 'android'" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db.from("devices").upsert(
    {
      user_id: user.id,
      expo_push_token: token,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "expo_push_token" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
