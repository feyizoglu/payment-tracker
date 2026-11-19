// Secret Word: guess a hidden five-letter word in six tries. Pure functions, no React, no storage.

import type { Lang } from "./i18n";
import { WORD_GAME_WORDS, type WordCard, type WordCategory } from "./word-game-words";

export type Rng = () => number;

export const SECRET_LEN = 5;
export const SECRET_TRIES = 6;
export const SECRET_BEST_KEY = "secret-word-best";
/** The result panel's buttons ignore presses this long after a round ends. */
export const SECRET_END_GUARD_MS = 400;

export const secretSeenKey = (lang: Lang) => `secret_word_seen_${lang}`;

export const SECRET_ALPHABET: Record<Lang, readonly string[]> = {
  tr: [..."ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ"],
  en: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
};

/** The letter rows of the on-screen keyboard; Enter and delete sit at the ends of the last row. */
export const SECRET_KEY_ROWS: Record<Lang, readonly (readonly string[])[]> = {
  tr: [[..."ERTYUIOPĞÜ"], [..."ASDFGHJKLŞİ"], [..."ZCVBNMÖÇ"]],
  en: [[..."QWERTYUIOP"], [..."ASDFGHJKL"], [..."ZXCVBNM"]],
};

/** Upper case without the runtime's locale, which Hermes may not honour: Turkish i is İ, ı is I. */
export function secretUpper(text: string, lang: Lang): string {
  const mapped = lang === "tr" ? text.replace(/i/g, "İ").replace(/ı/g, "I") : text;
  return mapped.toUpperCase();
}

/** The alphabet letter a typed key stands for, or null. */
export function secretLetter(key: string, lang: Lang): string | null {
  if ([...key].length !== 1) return null;
  const letter = secretUpper(key, lang);
  return SECRET_ALPHABET[lang].includes(letter) ? letter : null;
}

export interface SecretCard {
  /** The Describe It card id, stable because those lists are append-only. */
  id: string;
  word: string;
  category: WordCategory;
}

type Source = Readonly<Record<WordCategory, readonly WordCard[]>>;

/** Every answer of a language: five-letter single words from the Describe It lists, idioms aside. */
export function secretCards(lang: Lang, source: Source = WORD_GAME_WORDS[lang]): SecretCard[] {
  const alphabet = SECRET_ALPHABET[lang];
  const out: SecretCard[] = [];
  const words = new Set<string>();
  for (const [category, cards] of Object.entries(source) as [WordCategory, readonly WordCard[]][]) {
    if (category === "idioms") continue;
    for (const card of cards) {
      const word = secretUpper(card.word, lang);
      const letters = [...word];
      if (letters.length !== SECRET_LEN || !letters.every((l) => alphabet.includes(l)) || words.has(word)) continue;
      words.add(word);
      out.push({ id: card.id, word, category });
    }
  }
  return out;
}

const cardCache: Partial<Record<Lang, SecretCard[]>> = {};
/** `secretCards(lang)`, built once per language. */
export const secretCardsFor = (lang: Lang): SecretCard[] => (cardCache[lang] ??= secretCards(lang));

/**
 * The next answer: an unseen one when there is any, else the seen list of these cards starts over
 * (never with the word just played). Returns the seen list with the dealt card added.
 */
export function pickSecret(
  cards: readonly SecretCard[],
  seen: readonly string[],
  rng: Rng
): { card: SecretCard; seen: string[] } {
  const seenIds = new Set(seen);
  let pool = cards.filter((c) => !seenIds.has(c.id));
  let kept = [...seen];
  if (pool.length === 0) {
    const last = seen[seen.length - 1];
    const ids = new Set(cards.map((c) => c.id));
    kept = seen.filter((id) => !ids.has(id));
    pool = cards.length > 1 ? cards.filter((c) => c.id !== last) : [...cards];
  }
  const card = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return { card, seen: [...kept, card.id] };
}

export type SecretMark = "hit" | "near" | "miss";

/** Marks for one guess, in two passes so a repeated letter is marked only as often as the answer has it. */
export function markGuess(guess: string, answer: string): SecretMark[] {
  const g = [...guess];
  const a = [...answer];
  const marks: SecretMark[] = g.map((l, i) => (l === a[i] ? "hit" : "miss"));
  const left = new Map<string, number>();
  a.forEach((l, i) => {
    if (marks[i] !== "hit") left.set(l, (left.get(l) ?? 0) + 1);
  });
  g.forEach((l, i) => {
    if (marks[i] === "hit") return;
    const n = left.get(l) ?? 0;
    if (n > 0) {
      marks[i] = "near";
      left.set(l, n - 1);
    }
  });
  return marks;
}

const RANK: Record<SecretMark, number> = { miss: 0, near: 1, hit: 2 };

/** The best mark each guessed letter has had; a key's mark only ever improves. */
export function keyMarks(guesses: readonly string[], answer: string): Record<string, SecretMark> {
  const out: Record<string, SecretMark> = {};
  for (const guess of guesses) {
    const marks = markGuess(guess, answer);
    [...guess].forEach((l, i) => {
      if (!out[l] || RANK[marks[i]] > RANK[out[l]]) out[l] = marks[i];
    });
  }
  return out;
}

export type SecretPhase = "playing" | "won" | "lost";

export interface SecretRound {
  lang: Lang;
  card: SecretCard;
  guesses: string[];
  typed: string;
  phase: SecretPhase;
  /** Enter was pressed with fewer than five letters; cleared by the next key. */
  short: boolean;
}

export const newSecretRound = (card: SecretCard, lang: Lang): SecretRound => ({
  lang,
  card,
  guesses: [],
  typed: "",
  phase: "playing",
  short: false,
});

export function secretType(r: SecretRound, letter: string): SecretRound {
  if (r.phase !== "playing" || [...r.typed].length >= SECRET_LEN || !SECRET_ALPHABET[r.lang].includes(letter)) return r;
  return { ...r, typed: r.typed + letter, short: false };
}

export function secretDelete(r: SecretRound): SecretRound {
  if (r.phase !== "playing" || (r.typed === "" && !r.short)) return r;
  return { ...r, typed: [...r.typed].slice(0, -1).join(""), short: false };
}

export function secretSubmit(r: SecretRound): SecretRound {
  if (r.phase !== "playing") return r;
  if ([...r.typed].length < SECRET_LEN) return r.short ? r : { ...r, short: true };
  const guesses = [...r.guesses, r.typed];
  const phase: SecretPhase = r.typed === r.card.word ? "won" : guesses.length >= SECRET_TRIES ? "lost" : "playing";
  return { ...r, guesses, typed: "", phase, short: false };
}

export type SecretSlot = { letter: string; mark: SecretMark | "typed" | "empty" };

/** The page's six lines: the marked guesses, the letters being typed, then empty lines. */
export function secretLines(r: SecretRound): SecretSlot[][] {
  const lines: SecretSlot[][] = r.guesses.map((g) => {
    const marks = markGuess(g, r.card.word);
    return [...g].map((letter, i) => ({ letter, mark: marks[i] }));
  });
  if (r.phase === "playing") {
    const typed = [...r.typed];
    lines.push(Array.from({ length: SECRET_LEN }, (_, i) => (i < typed.length ? { letter: typed[i], mark: "typed" } : { letter: "", mark: "empty" })));
  }
  while (lines.length < SECRET_TRIES) lines.push(Array.from({ length: SECRET_LEN }, () => ({ letter: "", mark: "empty" })));
  return lines;
}

/** The round is under way enough that leaving would lose something: a guess made or a streak running. */
export const secretOpen = (r: SecretRound | null, streak: number) =>
  r !== null && r.phase === "playing" && (r.guesses.length > 0 || streak > 0);

export const SECRET_COLORS = {
  light: {
    paper: "#fdfcf7",
    line: "#d6e0ee",
    margin: "#f3b4b4",
    ink: "#1f2937",
    hit: "#4f46e5",
    onHit: "#ffffff",
    near: "#d97706",
    miss: "#6b7280",
    key: "#e9ebf3",
  },
  dark: {
    paper: "#1c1a2b",
    line: "#34304b",
    margin: "#5c2a3a",
    ink: "#e5e7eb",
    hit: "#818cf8",
    onHit: "#111827",
    near: "#fbbf24",
    miss: "#6b7280",
    key: "#2b2840",
  },
} as const;
