import type { VocabLookup, VocabSense } from "./vocab";

// The only code that knows where definitions come from; a later Claude source replaces this file.
// The apps call it on the user's own device: the dictionary limits requests per IP, and the
// web server shares its IPs with other sites.
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

// Shared by parseEntries and readLookupResult, so what an app sends always passes the check.
const LIMITS = { ipa: 100, audioUrl: 500, pos: 40, definition: 600, example: 600, senses: 40 };
const AUDIO_PREFIX = "https://api.dictionaryapi.dev/media/";
const fits = (s: string | null, max: number): s is string => s !== null && s.length <= max;
const isDictionaryAudio = (url: string) => url.startsWith(AUDIO_PREFIX) && url.length <= LIMITS.audioUrl;

export function parseEntries(body: unknown): LookupResult | null {
  const entries = list(body);
  if (entries.length === 0) return null;
  const phonetics = entries.flatMap((e) => list(e.phonetics));
  const ipa = [...entries.map((e) => text(e.phonetic)), ...phonetics.map((p) => text(p.text))].find((s) => fits(s, LIMITS.ipa)) ?? null;
  const audios = phonetics.map((p) => text(p.audio)).filter((a): a is string => a !== null && isDictionaryAudio(a));
  const audioUrl = audios.find((a) => a.endsWith("-us.mp3")) ?? audios[0] ?? null;
  const senses: VocabSense[] = [];
  const perPos = new Map<string, number>();
  for (const meaning of entries.flatMap((e) => list(e.meanings))) {
    const pos = text(meaning.partOfSpeech) ?? "";
    if (pos.length > LIMITS.pos) continue;
    for (const d of list(meaning.definitions)) {
      const definition = text(d.definition);
      if (!fits(definition, LIMITS.definition) || (perPos.get(pos) ?? 0) >= SENSES_PER_POS || senses.length >= LIMITS.senses) continue;
      perPos.set(pos, (perPos.get(pos) ?? 0) + 1);
      const example = text(d.example);
      senses.push(fits(example, LIMITS.example) ? { pos, definition, example } : { pos, definition });
    }
  }
  return { lookup: "found", ipa, audioUrl, senses };
}

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  if (typeof AbortSignal.timeout === "function") return { signal: AbortSignal.timeout(ms), clear: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export async function lookupWord(word: string, fetchImpl: typeof fetch = fetch): Promise<LookupResult> {
  const { signal, clear } = timeoutSignal(TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchImpl(DICTIONARY_URL + encodeURIComponent(word), { signal });
    } catch {
      return empty("failed");
    }
    if (res.status === 404) return empty("not_found");
    if (!res.ok) return empty("failed");
    const body: unknown = await res.json().catch(() => null);
    return parseEntries(body) ?? empty("failed");
  } finally {
    clear();
  }
}

const capped = (v: unknown, max: number): string | null | undefined => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s.length > max) return undefined;
  return s === "" ? null : s;
};

// Checks a lookup result an app sent with its request. Returns null when it is malformed.
export function readLookupResult(raw: unknown): LookupResult | null {
  if (!isRec(raw)) return null;
  const lookup = raw.lookup;
  if (lookup !== "found" && lookup !== "not_found" && lookup !== "failed") return null;
  if (lookup !== "found") return empty(lookup);
  const ipa = capped(raw.ipa, LIMITS.ipa);
  const audioUrl = capped(raw.audioUrl, LIMITS.audioUrl);
  if (ipa === undefined || audioUrl === undefined) return null;
  if (audioUrl !== null && !isDictionaryAudio(audioUrl)) return null;
  if (!Array.isArray(raw.senses) || raw.senses.length > LIMITS.senses) return null;
  const senses: VocabSense[] = [];
  for (const s of raw.senses) {
    if (!isRec(s)) return null;
    const pos = capped(s.pos, LIMITS.pos);
    const definition = capped(s.definition, LIMITS.definition);
    const example = capped(s.example, LIMITS.example);
    if (pos === undefined || !definition || example === undefined) return null;
    senses.push(example ? { pos: pos ?? "", definition, example } : { pos: pos ?? "", definition });
  }
  return { lookup, ipa, audioUrl, senses };
}
