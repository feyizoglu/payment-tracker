import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// The caller's own profile. Mobile needs it after a cold start: the JWT is
// restored from secure storage but carries only id + email, so screens that
// key on the profile (owner-only member pickers, the settings colour) would
// stay empty until the next sign-in.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("users")
    .select("id, email, name, avatar_url, color")
    .eq("id", user.id)
    // maybeSingle, not single: a missing row must reach the 404 below as
    // `data: null`, not arrive disguised as a PGRST116 query error (500).
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // A valid session whose row is gone is a 404, not a 401: the token itself is
  // fine, so answering 401 would send the client into a re-sign-in loop.
  if (!data) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json(data);
}

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
