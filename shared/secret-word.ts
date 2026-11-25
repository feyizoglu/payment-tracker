// Secret Word: guess a hidden five-letter word in six tries. Pure functions, no React, no storage.

import type { Lang } from "./i18n";
import { WORD_GAME_WORDS, type WordCard, type WordCategory } from "./word-game-words";
import { SECRET_WORDS_EN } from "./secret-word-dictionary/en";
import { SECRET_WORDS_TR } from "./secret-word-dictionary/tr";
import { SECRET_ALPHABET, SECRET_LEN, secretUpper } from "./secret-word-letters";

export { SECRET_ALPHABET, SECRET_LEN, secretUpper };

export type Rng = () => number;

export const SECRET_TRIES = 6;
export const SECRET_BEST_KEY = "secret-word-best";
/** The result panel's buttons ignore presses this long after a round ends. */
export const SECRET_END_GUARD_MS = 400;

export const secretSeenKey = (lang: Lang) => `secret_word_seen_${lang}`;

/** The letter rows of the on-screen keyboard; Enter and delete sit at the ends of the last row. */
export const SECRET_KEY_ROWS: Record<Lang, readonly (readonly string[])[]> = {
  tr: [[..."ERTYUIOPĞÜ"], [..."ASDFGHJKLŞİ"], [..."ZCVBNMÖÇ"]],
  en: [[..."QWERTYUIOP"], [..."ASDFGHJKL"], [..."ZXCVBNM"]],
};

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

const DICTIONARY: Record<Lang, string> = { tr: SECRET_WORDS_TR, en: SECRET_WORDS_EN };
const wordCache: Partial<Record<Lang, Set<string>>> = {};

/** Whether a guess is a word: a root of the language's word list, or one of the answers. */
export function secretIsWord(word: string, lang: Lang): boolean {
  const words = (wordCache[lang] ??= new Set([...DICTIONARY[lang].split(" "), ...secretCardsFor(lang).map((c) => c.word)]));
  return words.has(word);
}

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

/** Why the last Enter was refused: fewer than five letters, or not a word. Cleared by the next key. */
export type SecretNotice = "short" | "unknown" | null;

/** A letter shown by "Reveal a letter": its position in the word, and how many guesses came before it. */
export interface SecretHint {
  at: number;
  index: number;
}

export interface SecretRound {
  lang: Lang;
  card: SecretCard;
  guesses: string[];
  typed: string;
  phase: SecretPhase;
  notice: SecretNotice;
  hint: SecretHint | null;
}

export const newSecretRound = (card: SecretCard, lang: Lang): SecretRound => ({
  lang,
  card,
  guesses: [],
  typed: "",
  phase: "playing",
  notice: null,
  hint: null,
});

/** The tries spent so far: every guess, plus one for a revealed letter. */
export const secretTriesUsed = (r: SecretRound) => r.guesses.length + (r.hint ? 1 : 0);

/** The leftmost position no guess has hit yet, or null when every position is known. */
function revealIndex(r: SecretRound): number | null {
  const word = [...r.card.word];
  const index = word.findIndex((l, i) => !r.guesses.some((g) => [...g][i] === l));
  return index === -1 ? null : index;
}

/** One reveal per round, and only while it leaves at least one try for a guess. */
export const secretCanReveal = (r: SecretRound) =>
  r.phase === "playing" && r.hint === null && secretTriesUsed(r) < SECRET_TRIES - 1 && revealIndex(r) !== null;

export function secretReveal(r: SecretRound): SecretRound {
  const index = revealIndex(r);
  if (!secretCanReveal(r) || index === null) return r;
  return { ...r, hint: { at: r.guesses.length, index }, notice: null };
}

/** The keyboard's marks: every guessed letter, and the revealed letter as found. */
export function secretKeyMarks(r: SecretRound): Record<string, SecretMark> {
  const marks = keyMarks(r.guesses, r.card.word);
  if (r.hint) marks[[...r.card.word][r.hint.index]] = "hit";
  return marks;
}

export function secretType(r: SecretRound, letter: string): SecretRound {
  if (r.phase !== "playing" || [...r.typed].length >= SECRET_LEN || !SECRET_ALPHABET[r.lang].includes(letter)) return r;
  return { ...r, typed: r.typed + letter, notice: null };
}

export function secretDelete(r: SecretRound): SecretRound {
  if (r.phase !== "playing" || (r.typed === "" && r.notice === null)) return r;
  return { ...r, typed: [...r.typed].slice(0, -1).join(""), notice: null };
}

export function secretSubmit(r: SecretRound): SecretRound {
  if (r.phase !== "playing") return r;
  const notice: SecretNotice = [...r.typed].length < SECRET_LEN ? "short" : secretIsWord(r.typed, r.lang) ? null : "unknown";
  // A refused guess costs no try; the letters stay so the player can change them.
  if (notice) return r.notice === notice ? r : { ...r, notice };
  const guesses = [...r.guesses, r.typed];
  const used = guesses.length + (r.hint ? 1 : 0);
  const phase: SecretPhase = r.typed === r.card.word ? "won" : used >= SECRET_TRIES ? "lost" : "playing";
  return { ...r, guesses, typed: "", phase, notice: null };
}

export type SecretSlot = { letter: string; mark: SecretMark | "typed" | "empty" };

/** The page's six lines: the marked guesses and any revealed letter, the letters being typed, then empty lines. */
export function secretLines(r: SecretRound): SecretSlot[][] {
  const lines: SecretSlot[][] = r.guesses.map((g) => {
    const marks = markGuess(g, r.card.word);
    return [...g].map((letter, i) => ({ letter, mark: marks[i] }));
  });
  if (r.hint) {
    const { at, index } = r.hint;
    const letter = [...r.card.word][index];
    lines.splice(at, 0, Array.from({ length: SECRET_LEN }, (_, i): SecretSlot => (i === index ? { letter, mark: "hit" } : { letter: "", mark: "empty" })));
  }
  if (r.phase === "playing") {
    const typed = [...r.typed];
    lines.push(Array.from({ length: SECRET_LEN }, (_, i) => (i < typed.length ? { letter: typed[i], mark: "typed" } : { letter: "", mark: "empty" })));
  }
  while (lines.length < SECRET_TRIES) lines.push(Array.from({ length: SECRET_LEN }, () => ({ letter: "", mark: "empty" })));
  return lines;
}

/** Leaving would lose something: a guess or reveal in the round under way, or a streak running. */
export const secretOpen = (r: SecretRound | null, streak: number) =>
  r !== null && (streak > 0 || (r.phase === "playing" && secretTriesUsed(r) > 0));

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
