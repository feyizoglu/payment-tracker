import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeMeaning, type VocabErrorCode, type VocabWord } from "@/lib/vocab";
import { lookupWord } from "@/lib/word-lookup";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const CHANGES = ["meaningTr", "answer", "unlearn", "relookup"] as const;

const fail = (status: number, code: VocabErrorCode, error: string) => NextResponse.json({ error, code }, { status });

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const sent = body && typeof body === "object" ? CHANGES.filter((k) => k in body) : [];
  if (sent.length !== 1) return fail(400, "invalid_request", "Send exactly one change");

  const { id } = await params;
  const db = supabaseAdmin();
  const { data: word } = await db.from("vocab_words").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!word) return fail(404, "not_found", "Word not found");

  const update = async (values: Record<string, unknown>) => {
    const { data, error } = await db.from("vocab_words").update(values).eq("id", id).eq("user_id", user.id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  };

  switch (sent[0]) {
    case "meaningTr": {
      const meaning = normalizeMeaning(body.meaningTr);
      if (!meaning.ok) return fail(400, "invalid_meaning", "Invalid meaning");
      return update({ meaning_tr: meaning.value });
    }
    case "answer": {
      if (body.answer !== "know" && body.answer !== "dontKnow") return fail(400, "invalid_request", "Unknown answer");
      const { data, error } = await db.rpc("vocab_word_answer", { p_id: id, p_user: user.id, p_know: body.answer === "know" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json((data as VocabWord[] | null)?.[0] ?? word);
    }
    case "unlearn":
      return update({ streak: 0, learned_at: null });
    case "relookup": {
      const found = await lookupWord((word as VocabWord).word);
      return update({ ipa: found.ipa, audio_url: found.audioUrl, senses: found.senses, lookup: found.lookup });
    }
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from("vocab_words").delete().eq("id", id).eq("user_id", user.id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return fail(404, "not_found", "Word not found");
  return NextResponse.json({ ok: true });
}
