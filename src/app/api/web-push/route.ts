import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// The cron POSTs to every stored endpoint, so only the browsers' push services are
// accepted; anything else would let a user aim the server at an arbitrary URL.
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

function isPushServiceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.port === "" && PUSH_SERVICE_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.length > 0;

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!isPushServiceUrl(endpoint)) {
    return NextResponse.json({ error: "Unsupported push endpoint" }, { status: 400 });
  }
  if (!nonEmpty(p256dh) || !nonEmpty(auth)) {
    return NextResponse.json({ error: "keys.p256dh and keys.auth required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from("web_push_subscriptions")
    .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!nonEmpty(endpoint)) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from("web_push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
