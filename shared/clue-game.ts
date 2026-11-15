import { localeFor, type Lang } from "./i18n";
import { GAME_THEME, PLAYER_COLORS } from "./imposter";
import { WORD_CATEGORIES, type WordCard, type WordCategory } from "./word-game-words/types";
import { shuffle, type WordSource } from "./word-game";

export { GAME_THEME, playerColor } from "./imposter";
export { fillTemplate, parseSavedSeen as parseSavedClueSeen, type WordSource } from "./word-game";
export type { WordCard } from "./word-game-words/types";

export type Rng = () => number;
export type ClueLevel = "easy" | "hard" | "mixed";

export interface ClueSetup {
  players: string[];
  deckSize: number;
  level: ClueLevel;
}

export const CLUE_MIN_PLAYERS = 3;
export const CLUE_MAX_PLAYERS = 10;
export const CLUE_DECK_SIZES = [8, 13, 20] as const;
export const CLUE_LEVELS = ["easy", "hard", "mixed"] as const satisfies readonly ClueLevel[];
export const CLUE_SETUP_STORAGE_KEY = "clue_setup";
export const CLUE_TAP_GUARD_MS = 400;
export const CLUE_MAX_LENGTH = 24;
/** The Describe It categories dealt from: a clue for an idiom is rarely one word. */
export const CLUE_CATEGORIES: readonly WordCategory[] = WORD_CATEGORIES.filter((c) => c !== "idioms");

export function clueSeenKey(lang: Lang): string {
  return `clue_seen_${lang}`;
}

export function defaultClueSetup(): ClueSetup {
  return { players: [], deckSize: 13, level: "mixed" };
}

export type ClueSetupError = "tooFewPlayers" | "tooManyPlayers" | "blankName" | "duplicateName" | "rules";

export const CLUE_SETUP_ERROR_KEYS = {
  tooFewPlayers: "imposterErrTooFew",
  tooManyPlayers: "clueErrTooMany",
  blankName: "imposterErrBlank",
  duplicateName: "imposterErrDuplicate",
  rules: "clueErrRules",
} as const satisfies Record<ClueSetupError, string>;

export const CLUE_SETUP_STEPS = ["players", "rules"] as const;
export type ClueSetupStep = (typeof CLUE_SETUP_STEPS)[number];

const ERROR_STEP = {
  tooFewPlayers: "players",
  tooManyPlayers: "players",
  blankName: "players",
  duplicateName: "players",
  rules: "rules",
} as const satisfies Record<ClueSetupError, ClueSetupStep>;

function isIn<T>(choices: readonly T[], value: unknown): value is T {
  return choices.includes(value as T);
}

/** `locale` is the app language's, e.g. "tr-TR": names are compared lowercased with its rules. */
export function validateClueSetup(setup: ClueSetup, locale: string): ClueSetupError[] {
  const errors: ClueSetupError[] = [];
  if (setup.players.length < CLUE_MIN_PLAYERS) errors.push("tooFewPlayers");
  if (setup.players.length > CLUE_MAX_PLAYERS) errors.push("tooManyPlayers");
  const names = setup.players.map((p) => p.trim());
  if (names.some((n) => n === "")) errors.push("blankName");
  const keys = names.filter((n) => n !== "").map((n) => n.toLocaleLowerCase(locale));
  if (new Set(keys).size !== keys.length) errors.push("duplicateName");
  if (!isIn<number>(CLUE_DECK_SIZES, setup.deckSize) || !isIn(CLUE_LEVELS, setup.level)) errors.push("rules");
  return errors;
}

/** The `validateClueSetup` errors the given wizard step can fix. */
export function clueStepErrors(setup: ClueSetup, step: ClueSetupStep, locale: string): ClueSetupError[] {
  return validateClueSetup(setup, locale).filter((e) => ERROR_STEP[e] === step);
}

// Saved settings come from device storage, which may hold an older shape or garbage:
// keep each field only if it is valid on its own.
export function parseSavedClueSetup(raw: string | null): ClueSetup {
  const fallback = defaultClueSetup();
  if (!raw) return fallback;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return fallback;
  const d = data as Record<string, unknown>;
  return {
    players: Array.isArray(d.players)
      ? d.players.filter((p): p is string => typeof p === "string").slice(0, CLUE_MAX_PLAYERS)
      : [],
    deckSize: isIn<number>(CLUE_DECK_SIZES, d.deckSize) ? d.deckSize : fallback.deckSize,
    level: isIn(CLUE_LEVELS, d.level) ? d.level : fallback.level,
  };
}

/** Every word of the level, idioms left out. */
export function cluePool(words: WordSource, level: ClueLevel): WordCard[] {
  return CLUE_CATEGORIES.flatMap((c) => words[c]).filter((w) => level === "mixed" || w.level === level);
}

// The words this device has not shown yet come first. When fewer than the deck size are
// unseen, the pool's part of the seen list is forgotten, so the next games start fresh.
export function buildClueDeck(
  words: WordSource,
  level: ClueLevel,
  deckSize: number,
  seen: readonly string[],
  rng: Rng
): { deck: WordCard[]; seen: string[] } {
  const pool = cluePool(words, level);
  const seenIds = new Set(seen);
  const unseen = pool.filter((w) => !seenIds.has(w.id));
  const again = pool.filter((w) => seenIds.has(w.id));
  const deck = [...shuffle(unseen, rng), ...shuffle(again, rng)].slice(0, deckSize);
  if (unseen.length >= deckSize) return { deck, seen: [...seen] };
  const poolIds = new Set(pool.map((w) => w.id));
  return { deck, seen: seen.filter((id) => !poolIds.has(id)) };
}

const isDigit = (c: string) => c >= "0" && c <= "9";
// Letters are told by having a case, not by a Unicode property escape: the phone's
// JavaScript engine may lack those, and String.prototype.normalize too.
const isLetter = (c: string) => c.toLowerCase() !== c.toUpperCase();

export type ClueError = "empty" | "space" | "long" | "noLetter";

/** Why a typed clue cannot be given, or null when it can. It is trimmed first. */
export function validateClue(text: string): ClueError | null {
  const clue = text.trim();
  if (clue === "") return "empty";
  if (/\s/.test(clue)) return "space";
  const chars = [...clue];
  if (chars.length > CLUE_MAX_LENGTH) return "long";
  if (!chars.some((c) => isDigit(c) || isLetter(c))) return "noLetter";
  return null;
}

// Typing without Turkish letters or accents is common: "isik" is "ışık". Covers the letters
// that `normalize("NFKD")` would split, for engines without it, and the dotless ı it leaves.
const FOLD: Readonly<Record<string, string>> = {
  ı: "i",
  ç: "c",
  ğ: "g",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
  á: "a",
  à: "a",
  ä: "a",
  ã: "a",
  å: "a",
  é: "e",
  è: "e",
  ê: "e",
  ë: "e",
  í: "i",
  ì: "i",
  ï: "i",
  ó: "o",
  ò: "o",
  ô: "o",
  õ: "o",
  ú: "u",
  ù: "u",
  ñ: "n",
  ß: "ss",
};

/** A clue or word as compared: lowercased with `locale`, without accents or punctuation. */
export function clueKey(text: string, locale: string): string {
  const lower = text.toLocaleLowerCase(locale);
  const split = typeof lower.normalize === "function" ? lower.normalize("NFKD") : lower;
  const folded = [...split].map((c) => FOLD[c] ?? c).join("");
  return [...folded].filter((c) => isDigit(c) || isLetter(c)).join("");
}

export type StrikeReason = "duplicate" | "word";

/** Per clue, why it is struck automatically: it matches another, or it and the word contain one another. */
export function autoStrikes(word: string, clues: readonly string[], locale: string): (StrikeReason | null)[] {
  const wordKey = clueKey(word, locale);
  const keys = clues.map((c) => clueKey(c, locale));
  return keys.map((key, i) => {
    if (keys.some((other, j) => j !== i && other === key)) return "duplicate";
    if (key.includes(wordKey) || wordKey.includes(key)) return "word";
    return null;
  });
}

export type CluePhase = "setup" | "handoff" | "clue" | "check" | "guess" | "result" | "end";
export type ClueOutcome = "got" | "missed" | "passed";

export const CLUE_OUTCOMES = ["got", "missed", "passed"] as const satisfies readonly ClueOutcome[];

export interface ClueEntry {
  giver: string;
  text: string;
  /** Why the clue was struck automatically, kept when the table restores it. */
  auto: StrikeReason | null;
  struck: boolean;
}

export interface ClueRoundResult {
  word: WordCard;
  guesser: string;
  outcome: ClueOutcome;
  clues: ClueEntry[];
}

export interface ClueState {
  phase: CluePhase;
  setup: ClueSetup;
  /** The words' language, fixed when the game starts. */
  lang: Lang;
  /** The lists the game draws from; null before the first start. */
  words: WordSource | null;
  /** This game's words, one per round. */
  deck: WordCard[];
  /** Index into `deck` of the round being played. */
  round: number;
  /** Rounds finished since the setup, Play again included: the guesser is `players[turns % n]`. */
  turns: number;
  /** Index into `clueGiverSeats` of the giver holding the phone. */
  giver: number;
  /** The secret part of `clue`, `check` or `guess` is on screen. */
  revealed: boolean;
  /** This round's clues, in giving order. */
  clues: ClueEntry[];
  /** This game's finished rounds. */
  results: ClueRoundResult[];
  /** Ids shown on this device in `lang`. */
  seen: string[];
  /** When the last accepted tap happened, in ms. */
  lastActionAt: number;
}

/** `at` is the tap's timestamp in ms. */
export type ClueAction =
  | { type: "start"; setup: ClueSetup; lang: Lang; words: WordSource; seen: readonly string[]; rng: Rng; at: number }
  | { type: "begin"; at: number }
  | { type: "reveal"; at: number }
  | { type: "submit"; text: string; at: number }
  | { type: "strike"; index: number; at: number }
  | { type: "toGuess"; at: number }
  | { type: "answer"; outcome: ClueOutcome; at: number }
  | { type: "next"; at: number }
  | { type: "playAgain"; rng: Rng; at: number }
  | { type: "newGame"; at: number };

export function initialClueState(setup: ClueSetup): ClueState {
  return {
    phase: "setup",
    setup,
    lang: "en",
    words: null,
    deck: [],
    round: 0,
    turns: 0,
    giver: 0,
    revealed: false,
    clues: [],
    results: [],
    seen: [],
    lastActionAt: 0,
  };
}

/** The seat of this round's guesser. */
export function clueGuesserSeat(state: Pick<ClueState, "setup" | "turns">): number {
  return state.turns % state.setup.players.length;
}

export function clueGuesser(state: Pick<ClueState, "setup" | "turns">): string {
  return state.setup.players[clueGuesserSeat(state)];
}

/** The seats of this round's clue givers: everyone else, in seat order after the guesser. */
export function clueGiverSeats(state: Pick<ClueState, "setup" | "turns">): number[] {
  const n = state.setup.players.length;
  const guesser = clueGuesserSeat(state);
  return Array.from({ length: n - 1 }, (_, i) => (guesser + 1 + i) % n);
}

/** The seat of the clue giver holding the phone. */
export function clueGiverSeat(state: Pick<ClueState, "setup" | "turns" | "giver">): number {
  return clueGiverSeats(state)[state.giver];
}

/** This round's word, or null outside a game. */
export function clueWord(state: Pick<ClueState, "deck" | "round">): WordCard | null {
  return state.deck[state.round] ?? null;
}

/** Why a clue is struck, as the screens write it; null when it stays. */
export function clueStrikeReason(clue: Pick<ClueEntry, "auto" | "struck">): StrikeReason | "manual" | null {
  if (!clue.struck) return null;
  return clue.auto ?? "manual";
}

/** What the guesser sees: the clues nobody struck. */
export function survivingClues(clues: readonly ClueEntry[]): string[] {
  return clues.filter((c) => !c.struck).map((c) => c.text);
}

export function clueScore(results: readonly ClueRoundResult[]): number {
  return results.filter((r) => r.outcome === "got").length;
}

export const CLUE_RATING_KEYS = [
  "clueRatingAll",
  "clueRatingGreat",
  "clueRatingGood",
  "clueRatingSome",
  "clueRatingFew",
] as const;
export type ClueRatingKey = (typeof CLUE_RATING_KEYS)[number];

/** The end's rating line for `score` words guessed of `total`. */
export function clueRating(score: number, total: number): ClueRatingKey {
  if (total <= 0) return "clueRatingFew";
  if (score >= total) return "clueRatingAll";
  if (score * 4 >= total * 3) return "clueRatingGreat";
  if (score * 2 >= total) return "clueRatingGood";
  if (score * 4 >= total) return "clueRatingSome";
  return "clueRatingFew";
}

// Every screen's button sits where the last one was, and the next screen may be secret: a
// double tap would otherwise show the next giver's word, or the clues, to the wrong player.
function tooSoon(state: ClueState, at: number): boolean {
  const d = at - state.lastActionAt;
  return d >= 0 && d < CLUE_TAP_GUARD_MS;
}

function deal(
  setup: ClueSetup,
  lang: Lang,
  words: WordSource,
  seen: readonly string[],
  turns: number,
  rng: Rng,
  at: number
): ClueState | null {
  const built = buildClueDeck(words, setup.level, setup.deckSize, seen, rng);
  if (built.deck.length === 0) return null;
  return {
    ...initialClueState(setup),
    phase: "handoff",
    lang,
    words,
    deck: built.deck,
    seen: built.seen,
    turns,
    lastActionAt: at,
  };
}

export function clueReducer(state: ClueState, action: ClueAction): ClueState {
  if (tooSoon(state, action.at)) return state;
  switch (action.type) {
    case "start": {
      if (state.phase !== "setup" || validateClueSetup(action.setup, localeFor(action.lang)).length > 0) return state;
      const setup = { ...action.setup, players: action.setup.players.map((p) => p.trim()) };
      return deal(setup, action.lang, action.words, action.seen, 0, action.rng, action.at) ?? state;
    }
    case "begin": {
      const word = clueWord(state);
      if (state.phase !== "handoff" || !word) return state;
      return {
        ...state,
        phase: "clue",
        giver: 0,
        revealed: false,
        clues: [],
        seen: state.seen.includes(word.id) ? state.seen : [...state.seen, word.id],
        lastActionAt: action.at,
      };
    }
    case "reveal":
      if ((state.phase !== "clue" && state.phase !== "check" && state.phase !== "guess") || state.revealed) return state;
      return { ...state, revealed: true, lastActionAt: action.at };
    case "submit": {
      const word = clueWord(state);
      if (state.phase !== "clue" || !state.revealed || !word || validateClue(action.text) !== null) return state;
      const clue: ClueEntry = {
        giver: state.setup.players[clueGiverSeat(state)],
        text: action.text.trim(),
        auto: null,
        struck: false,
      };
      const clues = [...state.clues, clue];
      const given = { ...state, revealed: false, lastActionAt: action.at };
      if (state.giver + 1 < clueGiverSeats(state).length) return { ...given, clues, giver: state.giver + 1 };
      const strikes = autoStrikes(
        word.word,
        clues.map((c) => c.text),
        localeFor(state.lang)
      );
      return {
        ...given,
        phase: "check",
        clues: clues.map((c, i) => ({ ...c, auto: strikes[i], struck: strikes[i] !== null })),
      };
    }
    case "strike": {
      const target = state.clues[action.index];
      if (state.phase !== "check" || !state.revealed || !target) return state;
      return {
        ...state,
        clues: state.clues.map((c, i) => (i === action.index ? { ...c, struck: !c.struck } : c)),
        lastActionAt: action.at,
      };
    }
    case "toGuess":
      if (state.phase !== "check" || !state.revealed) return state;
      return { ...state, phase: "guess", revealed: false, lastActionAt: action.at };
    case "answer": {
      const word = clueWord(state);
      if (state.phase !== "guess" || !state.revealed || !word) return state;
      if (action.outcome !== "passed" && survivingClues(state.clues).length === 0) return state;
      const result: ClueRoundResult = { word, guesser: clueGuesser(state), outcome: action.outcome, clues: state.clues };
      return { ...state, phase: "result", results: [...state.results, result], lastActionAt: action.at };
    }
    case "next": {
      if (state.phase !== "result") return state;
      const round = state.round + 1;
      const over = round >= state.deck.length;
      return {
        ...state,
        phase: over ? "end" : "handoff",
        round: over ? state.round : round,
        turns: state.turns + 1,
        clues: [],
        lastActionAt: action.at,
      };
    }
    case "playAgain":
      if (state.phase !== "end" || !state.words) return state;
      return deal(state.setup, state.lang, state.words, state.seen, state.turns, action.rng, action.at) ?? state;
    case "newGame":
      if (state.phase !== "end") return state;
      // The setup's buttons can sit where New game was: keep the time so they are guarded too.
      return { ...initialClueState(state.setup), lastActionAt: action.at };
  }
}

export const CLUE_LEVEL_KEYS = {
  easy: "clueLevelEasy",
  hard: "clueLevelHard",
  mixed: "clueLevelMixed",
} as const satisfies Record<ClueLevel, string>;

/** The guess screen's buttons. */
export const CLUE_ANSWER_KEYS = {
  got: "clueGotIt",
  missed: "clueMissed",
  passed: "cluePass",
} as const satisfies Record<ClueOutcome, string>;

/** A finished round's result. */
export const CLUE_OUTCOME_KEYS = {
  got: "clueResultGot",
  missed: "clueResultMissed",
  passed: "clueResultPassed",
} as const satisfies Record<ClueOutcome, string>;

/** How a result is written: the mark and the label, never the colour alone. */
export const CLUE_OUTCOME_LOOK = {
  got: { mark: "✓", color: PLAYER_COLORS[4] },
  missed: { mark: "✕", color: PLAYER_COLORS[0] },
  passed: { mark: "↷", color: GAME_THEME.muted },
} as const satisfies Record<ClueOutcome, { mark: string; color: string }>;

/** Why a clue is struck, as the check screen writes it. */
export const CLUE_STRIKE_KEYS = {
  duplicate: "clueStruckDuplicate",
  word: "clueStruckWord",
  manual: "clueStruckManual",
} as const satisfies Record<StrikeReason | "manual", string>;

export const CLUE_ERROR_KEYS = {
  empty: "clueErrEmpty",
  space: "clueErrSpace",
  long: "clueErrLong",
  noLetter: "clueErrNoLetter",
} as const satisfies Record<ClueError, string>;
