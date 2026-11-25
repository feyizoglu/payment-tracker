import { searchFold, type VocabWord } from "./vocab";

export const RACE_MS = 60_000;
export const RACE_PENALTY_MS = 3_000;
export const RACE_FEEDBACK_MS = 600;
export const RACE_TICK_MS = 250;
export const RACE_MIN_WORDS = 4;
export const RACE_CHOICES = 4;
export const RACE_COMBO_SHOWN = 3;
export const RACE_BEST_KEY = "words-race-best";
export const RACE_LIST_KEY = "words-race-list";

export interface RaceChoice {
  id: string;
  word: string;
}

export interface RaceQuestion {
  id: string;
  clue: string;
  choices: RaceChoice[];
}

export interface RacePick {
  id: string;
  correct: boolean;
}

export interface RaceState {
  words: VocabWord[];
  askable: string[];
  clues: Record<string, string>;
  keys: Record<string, string>;
  deck: string[];
  question: RaceQuestion;
  endsAt: number;
  score: number;
  combo: number;
  bestCombo: number;
  missed: string[];
  picked: RacePick | null;
}

function maskWord(text: string, word: string): string {
  const phrase = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return text.replace(new RegExp(`(^|[^A-Za-z])(?:${phrase})(?:s|es|ed|d|ing)?(?![A-Za-z])`, "gi"), "$1___");
}

export function raceClue(word: VocabWord): string | null {
  const meaning = word.meaning_tr?.trim();
  if (meaning) return meaning;
  const definition = word.senses[0]?.definition.trim();
  return definition ? maskWord(definition, word.word) : null;
}

export const raceWords = (words: readonly VocabWord[]): VocabWord[] => words.filter((w) => raceClue(w) !== null);

export const canRace = (words: readonly VocabWord[]): boolean => raceWords(words).length >= RACE_MIN_WORDS;

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function draw(deck: readonly string[], askable: readonly string[], last: string | null, rng: () => number) {
  const next = deck.length > 0 ? [...deck] : shuffle(askable, rng);
  if (deck.length === 0 && next[0] === last && next.length > 1) {
    const j = 1 + Math.floor(rng() * (next.length - 1));
    [next[0], next[j]] = [next[j], next[0]];
  }
  return { id: next[0], deck: next.slice(1) };
}

function askQuestion(id: string, s: Pick<RaceState, "words" | "clues" | "keys">, rng: () => number): RaceQuestion {
  const answer = s.words.find((w) => w.id === id)!;
  const others = s.words.filter((w) => w.id !== id && s.keys[w.id] !== s.keys[id]);
  const picks = shuffle(others, rng).slice(0, RACE_CHOICES - 1);
  return { id, clue: s.clues[id], choices: shuffle([answer, ...picks], rng).map((w) => ({ id: w.id, word: w.word })) };
}

/** A new round, or null when fewer than four words can be asked. */
export function startRace(words: readonly VocabWord[], now: number, rng: () => number = Math.random): RaceState | null {
  const askable: string[] = [];
  const clues: Record<string, string> = {};
  const keys: Record<string, string> = {};
  for (const w of words) {
    const clue = raceClue(w);
    if (clue === null) continue;
    askable.push(w.id);
    clues[w.id] = clue;
    // Folded once here, not per question: non-ASCII case changes are slow on Hermes Android.
    keys[w.id] = searchFold(clue).replace(/\s+/g, " ").trim();
  }
  if (askable.length < RACE_MIN_WORDS) return null;
  const base = { words: [...words], clues, keys };
  const first = draw([], askable, null, rng);
  return {
    ...base,
    askable,
    deck: first.deck,
    question: askQuestion(first.id, base, rng),
    endsAt: now + RACE_MS,
    score: 0,
    combo: 0,
    bestCombo: 0,
    missed: [],
    picked: null,
  };
}

export const raceTimeLeft = (s: RaceState, now: number): number => Math.max(0, s.endsAt - now);

export const raceOver = (s: RaceState, now: number): boolean => now >= s.endsAt;

/** A tap on a choice; ignored while the last pick is still shown and once the clock has run out. */
export function pickRace(s: RaceState, id: string, now: number): RaceState {
  if (s.picked || raceOver(s, now) || !s.question.choices.some((c) => c.id === id)) return s;
  if (id === s.question.id) {
    const combo = s.combo + 1;
    return { ...s, score: s.score + 1, combo, bestCombo: Math.max(s.bestCombo, combo), picked: { id, correct: true } };
  }
  return {
    ...s,
    endsAt: s.endsAt - RACE_PENALTY_MS,
    combo: 0,
    missed: s.missed.includes(s.question.id) ? s.missed : [...s.missed, s.question.id],
    picked: { id, correct: false },
  };
}

export function nextRaceQuestion(s: RaceState, rng: () => number = Math.random): RaceState {
  if (!s.picked) return s;
  const next = draw(s.deck, s.askable, s.question.id, rng);
  return { ...s, deck: next.deck, question: askQuestion(next.id, s, rng), picked: null };
}

function isSavedWord(value: unknown): value is VocabWord {
  if (!value || typeof value !== "object") return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.id === "string" &&
    typeof w.user_id === "string" &&
    typeof w.word === "string" &&
    (w.meaning_tr === null || typeof w.meaning_tr === "string") &&
    Array.isArray(w.senses) &&
    w.senses.every((s) => !!s && typeof (s as { definition?: unknown }).definition === "string")
  );
}

/** The offline copy of the word list; null when missing, broken or another user's. */
export function parseRaceList(raw: string | null, userId: string | null): VocabWord[] | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || !value.every(isSavedWord)) return null;
  if (userId !== null && value.some((w) => w.user_id !== userId)) return null;
  return value;
}
