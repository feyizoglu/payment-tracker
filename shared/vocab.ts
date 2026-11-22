import type { Translations } from "./i18n";

export type VocabLookup = "found" | "not_found" | "failed";

export interface VocabSense {
  pos: string;
  definition: string;
  example?: string;
}

export interface VocabWord {
  id: string;
  user_id: string;
  word: string;
  word_key: string;
  meaning_tr: string | null;
  ipa: string | null;
  audio_url: string | null;
  senses: VocabSense[];
  lookup: VocabLookup;
  streak: number;
  learned_at: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export const VOCAB_WORD_MAX = 40;
export const VOCAB_MEANING_MAX = 200;
export const VOCAB_LEARNED_STREAK = 3;
export const VOCAB_ROUND_SIZE = 10;

const WORD_PATTERN = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;

export function normalizeWord(raw: string): string {
  return raw.replace(/[‘’]/g, "'").trim().replace(/\s+/g, " ");
}

export function isValidWord(word: string): boolean {
  return word.length <= VOCAB_WORD_MAX && WORD_PATTERN.test(word);
}

export function vocabWordKey(word: string): string {
  return word.toLowerCase();
}

export function normalizeMeaning(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const value = raw.trim();
  if (value.length > VOCAB_MEANING_MAX) return { ok: false };
  return { ok: true, value: value === "" ? null : value };
}

export function vocabProgress(words: readonly VocabWord[]): { total: number; learned: number } {
  return { total: words.length, learned: words.filter((w) => w.learned_at !== null).length };
}

export type VocabFilter = "all" | "learning" | "learned";

export function filterWords(words: readonly VocabWord[], filter: VocabFilter, query: string): VocabWord[] {
  const raw = query.trim();
  // English words match by their key; a Turkish keyboard's İ and ı count as i there.
  const wordQuery = raw.replace(/[İı]/g, "i").toLowerCase();
  const meaningQuery = raw.toLocaleLowerCase("tr");
  return words.filter((w) => {
    if (filter === "learning" && w.learned_at !== null) return false;
    if (filter === "learned" && w.learned_at === null) return false;
    if (!raw) return true;
    return w.word_key.includes(wordQuery) || (w.meaning_tr ?? "").toLocaleLowerCase("tr").includes(meaningQuery);
  });
}

/** The words a review round asks: unlearned, lowest streak, never reviewed, longest unreviewed, oldest. */
export function reviewRound(words: readonly VocabWord[], size = VOCAB_ROUND_SIZE): VocabWord[] {
  return words
    .filter((w) => w.learned_at === null)
    .sort(
      (a, b) =>
        a.streak - b.streak ||
        (a.reviewed_at ?? "").localeCompare(b.reviewed_at ?? "") ||
        a.created_at.localeCompare(b.created_at)
    )
    .slice(0, size);
}

export function senseGroups(senses: readonly VocabSense[]): { pos: string; senses: VocabSense[] }[] {
  const groups: { pos: string; senses: VocabSense[] }[] = [];
  for (const s of senses) {
    const group = groups.find((g) => g.pos === s.pos);
    if (group) group.senses.push(s);
    else groups.push({ pos: s.pos, senses: [s] });
  }
  return groups;
}

export type VocabErrorCode = "invalid_word" | "invalid_meaning" | "duplicate" | "not_found" | "invalid_request";

export function vocabErrorText(code: unknown, fallback: string, t: Translations): string {
  switch (code) {
    case "invalid_word":
      return t.wordsInvalidWord;
    case "invalid_meaning":
      return t.wordsInvalidMeaning;
    case "duplicate":
      return t.wordsDuplicate;
    case "not_found":
      return t.wordsNotFound;
    default:
      return fallback || t.updateFailed;
  }
}
