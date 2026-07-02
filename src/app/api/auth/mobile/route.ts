import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyGoogleIdToken, signAppToken } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const idToken = body?.id_token;
  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "id_token required" }, { status: 400 });
  }

  const profile = await verifyGoogleIdToken(idToken);
  if (!profile) {
    return NextResponse.json({ error: "Invalid Google ID token" }, { status: 401 });
  }

  // Mirror the NextAuth signIn callback's upsert in src/auth.ts
  const db = supabaseAdmin();
  const { data: userRow, error } = await db
    .from("users")
    .upsert(
      {
        email: profile.email,
        name: profile.name,
        avatar_url: profile.picture,
      },
      { onConflict: "email" }
    )
    .select("id, email, name, avatar_url")
    .single();

  if (error || !userRow) {
    return NextResponse.json(
      { error: error?.message ?? "User upsert failed" },
      { status: 500 }
    );
  }

  let token: string;
  try {
    token = await signAppToken({ userId: userRow.id, email: userRow.email });
  } catch (e) {
    // signAppToken throws only on server misconfiguration (missing/short AUTH_SECRET).
    console.error("POST /api/auth/mobile signAppToken error:", e);
    return NextResponse.json({ error: "Failed to issue token" }, { status: 500 });
  }
  return NextResponse.json({ token, user: userRow });
}
