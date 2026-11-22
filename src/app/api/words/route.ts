import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidWord, normalizeMeaning, normalizeWord, vocabWordKey, type VocabErrorCode } from "@/lib/vocab";
import { lookupWord } from "@/lib/word-lookup";

export const dynamic = "force-dynamic";

const fail = (status: number, code: VocabErrorCode, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, code, ...extra }, { status });

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin()
    .from("vocab_words")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const word = typeof body?.word === "string" ? normalizeWord(body.word) : "";
  if (!isValidWord(word)) return fail(400, "invalid_word", "Invalid word");
  const meaning = normalizeMeaning(body?.meaningTr);
  if (!meaning.ok) return fail(400, "invalid_meaning", "Invalid meaning");

  const db = supabaseAdmin();
  const key = vocabWordKey(word);
  const find = () => db.from("vocab_words").select("*").eq("user_id", user.id).eq("word_key", key).maybeSingle();

  const { data: existing } = await find();
  if (existing) return fail(409, "duplicate", "Already in your list", { word: existing });

  const found = await lookupWord(word);
  const { data, error } = await db
    .from("vocab_words")
    .insert({
      user_id: user.id,
      word,
      word_key: key,
      meaning_tr: meaning.value,
      ipa: found.ipa,
      audio_url: found.audioUrl,
      senses: found.senses,
      lookup: found.lookup,
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const { data: winner } = await find();
    return fail(409, "duplicate", "Already in your list", { word: winner });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
