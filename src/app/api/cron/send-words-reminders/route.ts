import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWordsReminders } from "@/lib/words-reminder";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const words = await sendWordsReminders(supabaseAdmin());
    const errors = [...words.errors, ...words.push.errors, ...words.webPush.errors];
    if (errors.length > 0) console.error("words reminders:", errors.join("; "));
    return NextResponse.json(words, { status: words.errors.length > 0 ? 500 : 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "words reminders failed";
    console.error("words reminders:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
