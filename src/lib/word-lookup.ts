import type { VocabLookup, VocabSense } from "@/lib/vocab";

// The only code that knows where definitions come from; a later Claude source replaces this file.
const DICTIONARY_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const TIMEOUT_MS = 5000;
const SENSES_PER_POS = 3;

export interface LookupResult {
  lookup: VocabLookup;
  ipa: string | null;
  audioUrl: string | null;
  senses: VocabSense[];
}

const empty = (lookup: VocabLookup): LookupResult => ({ lookup, ipa: null, audioUrl: null, senses: [] });

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : []);

export function parseEntries(body: unknown): LookupResult | null {
  const entries = list(body);
  if (entries.length === 0) return null;
  const phonetics = entries.flatMap((e) => list(e.phonetics));
  const ipa = [...entries.map((e) => text(e.phonetic)), ...phonetics.map((p) => text(p.text))].find((s) => s !== null) ?? null;
  const audios = phonetics.map((p) => text(p.audio)).filter((a): a is string => a !== null && a.startsWith("https://"));
  const audioUrl = audios.find((a) => a.endsWith("-us.mp3")) ?? audios[0] ?? null;
  const senses: VocabSense[] = [];
  const perPos = new Map<string, number>();
  for (const meaning of entries.flatMap((e) => list(e.meanings))) {
    const pos = text(meaning.partOfSpeech) ?? "";
    for (const d of list(meaning.definitions)) {
      const definition = text(d.definition);
      if (!definition || (perPos.get(pos) ?? 0) >= SENSES_PER_POS) continue;
      perPos.set(pos, (perPos.get(pos) ?? 0) + 1);
      const example = text(d.example);
      senses.push(example ? { pos, definition, example } : { pos, definition });
    }
  }
  return { lookup: "found", ipa, audioUrl, senses };
}

export async function lookupWord(word: string, fetchImpl: typeof fetch = fetch): Promise<LookupResult> {
  let res: Response;
  try {
    res = await fetchImpl(DICTIONARY_URL + encodeURIComponent(word), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return empty("failed");
  }
  if (res.status === 404) return empty("not_found");
  if (!res.ok) return empty("failed");
  const body: unknown = await res.json().catch(() => null);
  return parseEntries(body) ?? empty("failed");
}
