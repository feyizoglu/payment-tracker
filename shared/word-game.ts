import type { Lang } from "./i18n";
import { CATEGORY_EMOJI, CATEGORY_LABEL_KEYS, GAME_THEME, PLAYER_COLORS } from "./imposter";
import { WORD_CATEGORIES, type WordCard, type WordCategory } from "./word-game-words/types";

export { GAME_THEME, formatCountdown, remainingSeconds } from "./imposter";

export { WORD_CATEGORIES };
export type { WordCard, WordCategory, WordLevel } from "./word-game-words/types";

export type Rng = () => number;
export type WordMode = "free" | "forbidden" | "mime";
export type WordDifficulty = "easy" | "hard" | "mixed";
export type WordCategoryChoice = WordCategory | "mixed";
export type WordEndBy = "rounds" | "target";

export interface WordTeam {
  name: string;
  players: string[];
}

export interface WordSetup {
  teams: [WordTeam, WordTeam];
  category: WordCategoryChoice;
  difficulty: WordDifficulty;
  mode: WordMode;
  turnSeconds: number;
  /** null means unlimited. */
  passLimit: number | null;
  endBy: WordEndBy;
  rounds: number;
  target: number;
}

export const WORD_MIN_TEAM = 2;
export const WORD_MAX_TEAM = 8;
export const WORD_SETUP_STORAGE_KEY = "word_game_setup";
export const WORD_MODES = ["free", "forbidden", "mime"] as const satisfies readonly WordMode[];
export const WORD_DIFFICULTIES = ["easy", "hard", "mixed"] as const satisfies readonly WordDifficulty[];
export const WORD_END_BYS = ["rounds", "target"] as const satisfies readonly WordEndBy[];
export const TURN_SECONDS = [30, 60, 90] as const;
export const PASS_LIMITS = [0, 3, null] as const;
export const ROUND_CHOICES = [1, 2, 3] as const;
export const TARGET_CHOICES = [20, 30, 50] as const;
export const WORD_CATEGORY_CHOICES: readonly WordCategoryChoice[] = ["mixed", ...WORD_CATEGORIES];

/** Team 1 and team 2. Both are light enough for `GAME_THEME.ink` text on top. */
export const WORD_TEAM_COLORS = [PLAYER_COLORS[0], PLAYER_COLORS[6]] as const;

export function teamColor(team: number): string {
  return WORD_TEAM_COLORS[team % 2];
}

export function wordSeenKey(lang: Lang): string {
  return `word_game_seen_${lang}`;
}

/** The two default team names from the translated "Team {n}". */
export function defaultTeamNames(template: string): [string, string] {
  return [template.replace("{n}", "1"), template.replace("{n}", "2")];
}

export function defaultWordSetup(teamNames: readonly [string, string]): WordSetup {
  return {
    teams: [
      { name: teamNames[0], players: [] },
      { name: teamNames[1], players: [] },
    ],
    category: "mixed",
    difficulty: "mixed",
    mode: "free",
    turnSeconds: 60,
    passLimit: 3,
    endBy: "rounds",
    rounds: 2,
    target: 30,
  };
}

export type WordSetupError = "teamSize" | "blankName" | "duplicateName" | "blankTeamName" | "sameTeamName";

export const WORD_SETUP_ERROR_KEYS = {
  teamSize: "wordErrTeamSize",
  blankName: "wordErrBlank",
  duplicateName: "wordErrDuplicate",
  blankTeamName: "wordErrTeamBlank",
  sameTeamName: "wordErrTeamSame",
} as const satisfies Record<WordSetupError, string>;

export const WORD_SETUP_STEPS = ["teams", "words", "rules"] as const;
export type WordSetupStep = (typeof WORD_SETUP_STEPS)[number];

const ERROR_STEP = {
  teamSize: "teams",
  blankName: "teams",
  duplicateName: "teams",
  blankTeamName: "teams",
  sameTeamName: "teams",
} as const satisfies Record<WordSetupError, WordSetupStep>;

export function validateWordSetup(setup: WordSetup): WordSetupError[] {
  const errors: WordSetupError[] = [];
  const { teams } = setup;
  if (teams.some((team) => team.players.length < WORD_MIN_TEAM || team.players.length > WORD_MAX_TEAM)) {
    errors.push("teamSize");
  }
  const names = teams.flatMap((team) => team.players.map((p) => p.trim()));
  if (names.some((n) => n === "")) errors.push("blankName");
  const keys = names.filter((n) => n !== "").map((n) => n.toLocaleLowerCase());
  if (new Set(keys).size !== keys.length) errors.push("duplicateName");
  const teamNames = teams.map((team) => team.name.trim().toLocaleLowerCase());
  if (teamNames.some((n) => n === "")) errors.push("blankTeamName");
  else if (teamNames[0] === teamNames[1]) errors.push("sameTeamName");
  return errors;
}

/** The `validateWordSetup` errors the given wizard step can fix. */
export function wordStepErrors(setup: WordSetup, step: WordSetupStep): WordSetupError[] {
  return validateWordSetup(setup).filter((e) => ERROR_STEP[e] === step);
}

function pickIndex(length: number, rng: Rng): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = pickIndex(i + 1, rng);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function shuffleTeams(setup: WordSetup, rng: Rng): WordSetup {
  const names = shuffle(
    setup.teams.flatMap((team) => team.players.map((p) => p.trim()).filter((p) => p !== "")),
    rng
  );
  const half = Math.ceil(names.length / 2);
  return {
    ...setup,
    teams: [
      { ...setup.teams[0], players: names.slice(0, half) },
      { ...setup.teams[1], players: names.slice(half) },
    ],
  };
}

function pick<T>(choices: readonly T[], value: unknown, fallback: T): T {
  return choices.includes(value as T) ? (value as T) : fallback;
}

function parseTeam(value: unknown, fallbackName: string): WordTeam {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { name: fallbackName, players: [] };
  const v = value as Record<string, unknown>;
  const players = Array.isArray(v.players) ? v.players.filter((p): p is string => typeof p === "string") : [];
  return { name: typeof v.name === "string" ? v.name : fallbackName, players: players.slice(0, WORD_MAX_TEAM) };
}

// Saved settings come from device storage, which may hold an older shape or garbage:
// keep each field only if it is valid on its own.
export function parseSavedWordSetup(raw: string | null, teamNames: readonly [string, string]): WordSetup {
  const fallback = defaultWordSetup(teamNames);
  if (!raw) return fallback;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return fallback;
  const d = data as Record<string, unknown>;
  const teams: unknown[] = Array.isArray(d.teams) ? d.teams : [];
  return {
    teams: [parseTeam(teams[0], teamNames[0]), parseTeam(teams[1], teamNames[1])],
    category: pick(WORD_CATEGORY_CHOICES, d.category, fallback.category),
    difficulty: pick<WordDifficulty>(WORD_DIFFICULTIES, d.difficulty, fallback.difficulty),
    mode: pick<WordMode>(WORD_MODES, d.mode, fallback.mode),
    turnSeconds: pick<number>(TURN_SECONDS, d.turnSeconds, fallback.turnSeconds),
    passLimit: pick<number | null>(PASS_LIMITS, d.passLimit, fallback.passLimit),
    endBy: pick<WordEndBy>(WORD_END_BYS, d.endBy, fallback.endBy),
    rounds: pick<number>(ROUND_CHOICES, d.rounds, fallback.rounds),
    target: pick<number>(TARGET_CHOICES, d.target, fallback.target),
  };
}

export function parseSavedSeen(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? [...new Set(data.filter((id): id is string => typeof id === "string"))] : [];
  } catch {
    return [];
  }
}

/** One language's word lists, as `WORD_GAME_WORDS[lang]`. */
export type WordSource = Readonly<Record<WordCategory, readonly WordCard[]>>;

export const WORD_DECK_MIN = 50;

// The deck skips words this device has shown before. When the choice runs low, its part of
// the seen list is forgotten so the game still has enough words, and the words just seen
// still come last.
export function buildDeck(
  words: WordSource,
  category: WordCategoryChoice,
  difficulty: WordDifficulty,
  seen: readonly string[],
  rng: Rng
): { deck: WordCard[]; seen: string[] } {
  const categories: readonly WordCategory[] = category === "mixed" ? WORD_CATEGORIES : [category];
  const pool = categories
    .flatMap((c) => words[c])
    .filter((card) => difficulty === "mixed" || card.level === difficulty);
  const seenIds = new Set(seen);
  const unseen = pool.filter((card) => !seenIds.has(card.id));
  if (unseen.length >= WORD_DECK_MIN) return { deck: shuffle(unseen, rng), seen: [...seen] };
  const poolIds = new Set(pool.map((card) => card.id));
  const again = pool.filter((card) => seenIds.has(card.id));
  return {
    deck: [...shuffle(unseen, rng), ...shuffle(again, rng)],
    seen: seen.filter((id) => !poolIds.has(id)),
  };
}

export const WORD_TAP_GUARD_MS = 300;

export type WordPhase = "setup" | "handoff" | "play" | "summary" | "end";
export type WordResult = "correct" | "pass" | "foul";

export const RESULT_POINTS = { correct: 1, pass: 0, foul: -1 } as const satisfies Record<WordResult, number>;

export interface TurnResult {
  card: WordCard;
  result: WordResult;
}

export interface WordGameState {
  phase: WordPhase;
  setup: WordSetup;
  /** The language of the words, fixed when the game starts. */
  lang: Lang;
  /** The lists the game draws from; null before the first start. */
  words: WordSource | null;
  deck: WordCard[];
  /** Words shown in earlier turns of this game that are not back in the deck. */
  played: WordCard[];
  /** The word on screen during a turn. */
  card: WordCard | null;
  /** Ids shown on this device in `lang`; saved after every turn. */
  seen: string[];
  /** Finished turns. The team on turn is `turnsPlayed % 2`. */
  turnsPlayed: number;
  scores: [number, number];
  /** This turn's words in the order they were shown. */
  results: TurnResult[];
  /** null means unlimited. */
  passesLeft: number | null;
  /** When the turn's clock runs out, in ms. */
  endsAt: number;
  /** The deck ran out: the game ends after this turn. */
  outOfWords: boolean;
  /** When the last accepted tap happened, in ms. */
  lastActionAt: number;
}

/** `at` is the tap's (or, for timeUp, the clock's) timestamp in ms. */
export type WordGameAction =
  | { type: "start"; setup: WordSetup; lang: Lang; words: WordSource; seen: readonly string[]; rng: Rng; at: number }
  | { type: "begin"; at: number }
  | { type: "answer"; result: WordResult; rng: Rng; at: number }
  | { type: "timeUp"; at: number }
  | { type: "next"; at: number }
  | { type: "endGame"; at: number }
  | { type: "playAgain"; rng: Rng; at: number }
  | { type: "newGame"; at: number };

export function initialWordState(setup: WordSetup): WordGameState {
  return {
    phase: "setup",
    setup,
    lang: "en",
    words: null,
    deck: [],
    played: [],
    card: null,
    seen: [],
    turnsPlayed: 0,
    scores: [0, 0],
    results: [],
    passesLeft: setup.passLimit,
    endsAt: 0,
    outOfWords: false,
    lastActionAt: 0,
  };
}

export function currentTeam(state: Pick<WordGameState, "turnsPlayed">): 0 | 1 {
  return state.turnsPlayed % 2 === 0 ? 0 : 1;
}

/** A team's n-th turn is played by `players[n % players.length]`. */
export function describer(state: Pick<WordGameState, "setup" | "turnsPlayed">): string {
  const { players } = state.setup.teams[currentTeam(state)];
  return players[Math.floor(state.turnsPlayed / 2) % players.length];
}

/** Checked after each pair of turns: rounds played out, or a team ahead at the target. */
export function isGameOver(setup: WordSetup, scores: readonly [number, number], turnsPlayed: number): boolean {
  if (turnsPlayed === 0 || turnsPlayed % 2 !== 0) return false;
  if (setup.endBy === "rounds") {
    const longest = Math.max(setup.teams[0].players.length, setup.teams[1].players.length);
    return turnsPlayed >= 2 * setup.rounds * longest;
  }
  return Math.max(scores[0], scores[1]) >= setup.target && scores[0] !== scores[1];
}

export function winner(scores: readonly [number, number]): 0 | 1 | null {
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}

export function turnPoints(results: readonly TurnResult[]): number {
  return results.reduce((sum, r) => sum + RESULT_POINTS[r.result], 0);
}

export function signedPoints(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

// Every button moves the game on at once and the next screen's buttons sit where the last
// ones were, so a double tap would otherwise skip a word or a screen.
function tooSoon(state: WordGameState, at: number): boolean {
  const d = at - state.lastActionAt;
  return d >= 0 && d < WORD_TAP_GUARD_MS;
}

function markSeen(seen: string[], id: string): string[] {
  return seen.includes(id) ? seen : [...seen, id];
}

/** `played` after a turn: its words join once each, unless they are back in the deck. */
function afterTurn(played: WordCard[], results: readonly TurnResult[], deck: readonly WordCard[]): WordCard[] {
  const skip = new Set([...played, ...deck].map((c) => c.id));
  const next = [...played];
  for (const { card } of results) {
    if (skip.has(card.id)) continue;
    skip.add(card.id);
    next.push(card);
  }
  return next;
}

function trimTeam(team: WordTeam): WordTeam {
  return { name: team.name.trim(), players: team.players.map((p) => p.trim()) };
}

function dealGame(setup: WordSetup, lang: Lang, words: WordSource, seen: readonly string[], rng: Rng, at: number): WordGameState {
  const built = buildDeck(words, setup.category, setup.difficulty, seen, rng);
  const empty = built.deck.length === 0;
  return {
    ...initialWordState(setup),
    phase: empty ? "end" : "handoff",
    lang,
    words,
    deck: built.deck,
    seen: built.seen,
    outOfWords: empty,
    lastActionAt: at,
  };
}

export function wordGameReducer(state: WordGameState, action: WordGameAction): WordGameState {
  switch (action.type) {
    case "start": {
      if (state.phase !== "setup" || validateWordSetup(action.setup).length > 0 || tooSoon(state, action.at)) return state;
      const setup: WordSetup = { ...action.setup, teams: [trimTeam(action.setup.teams[0]), trimTeam(action.setup.teams[1])] };
      return dealGame(setup, action.lang, action.words, action.seen, action.rng, action.at);
    }
    case "begin": {
      if (state.phase !== "handoff" || tooSoon(state, action.at)) return state;
      const [card, ...deck] = state.deck;
      if (!card) return { ...state, phase: "end", outOfWords: true, lastActionAt: action.at };
      return {
        ...state,
        phase: "play",
        card,
        deck,
        seen: markSeen(state.seen, card.id),
        results: [],
        passesLeft: state.setup.passLimit,
        endsAt: action.at + state.setup.turnSeconds * 1000,
        lastActionAt: action.at,
      };
    }
    case "answer": {
      const { card } = state;
      if (state.phase !== "play" || !card || tooSoon(state, action.at) || action.at >= state.endsAt) return state;
      const pass = action.result === "pass";
      if (pass && state.passesLeft === 0) return state;
      const scores: [number, number] = [...state.scores];
      scores[currentTeam(state)] += RESULT_POINTS[action.result];
      let deck = state.deck;
      let played = state.played;
      // Out of fresh words: the words of earlier turns come back, so every turn can be played.
      if (deck.length === 0) {
        deck = shuffle(played, action.rng);
        played = [];
      }
      const [nextCard, ...rest] = deck;
      const answered: WordGameState = {
        ...state,
        scores,
        results: [...state.results, { card, result: action.result }],
        passesLeft: pass && state.passesLeft !== null ? state.passesLeft - 1 : state.passesLeft,
        lastActionAt: action.at,
      };
      if (!nextCard) return { ...answered, phase: "summary", card: null, deck: [], outOfWords: true };
      return { ...answered, card: nextCard, deck: rest, played, seen: markSeen(state.seen, nextCard.id) };
    }
    case "timeUp": {
      // Not tap-guarded: the clock ends the turn even right after a tap.
      if (state.phase !== "play" || action.at < state.endsAt) return state;
      const deck = state.card ? [...state.deck, state.card] : state.deck;
      return {
        ...state,
        phase: "summary",
        card: null,
        deck,
        played: afterTurn(state.played, state.results, deck),
        lastActionAt: action.at,
      };
    }
    case "next": {
      if (state.phase !== "summary" || tooSoon(state, action.at)) return state;
      const turnsPlayed = state.turnsPlayed + 1;
      const over = state.outOfWords || isGameOver(state.setup, state.scores, turnsPlayed);
      return { ...state, phase: over ? "end" : "handoff", turnsPlayed, lastActionAt: action.at };
    }
    case "endGame":
      if ((state.phase !== "handoff" && state.phase !== "summary") || tooSoon(state, action.at)) return state;
      return { ...state, phase: "end", lastActionAt: action.at };
    case "playAgain":
      if (state.phase !== "end" || !state.words || tooSoon(state, action.at)) return state;
      return dealGame(state.setup, state.lang, state.words, state.seen, action.rng, action.at);
    case "newGame":
      if (state.phase !== "end" || tooSoon(state, action.at)) return state;
      // The setup's Start can sit where New game was: keep the time so Start is guarded too.
      return { ...initialWordState(state.setup), lastActionAt: action.at };
  }
}

export const WORD_CATEGORY_LABEL_KEYS = {
  ...CATEGORY_LABEL_KEYS,
  home: "wordCategoryHome",
  nature: "wordCategoryNature",
  body: "wordCategoryBody",
  transport: "wordCategoryTransport",
  arts: "wordCategoryArts",
  actions: "wordCategoryActions",
  idioms: "wordCategoryIdioms",
} as const satisfies Record<WordCategoryChoice, string>;

export const WORD_CATEGORY_EMOJI = {
  ...CATEGORY_EMOJI,
  home: "🏠",
  nature: "🌳",
  body: "💪",
  transport: "🚗",
  arts: "🎨",
  actions: "🏃",
  idioms: "💬",
} as const satisfies Record<WordCategoryChoice, string>;

export const WORD_DIFFICULTY_KEYS = {
  easy: "wordEasy",
  hard: "wordHard",
  mixed: "wordDifficultyMixed",
} as const satisfies Record<WordDifficulty, string>;

export const WORD_MODE_KEYS = {
  free: { label: "wordModeFree", rule: "wordModeFreeRule" },
  forbidden: { label: "wordModeForbidden", rule: "wordModeForbiddenRule" },
  mime: { label: "wordModeMime", rule: "wordModeMimeRule" },
} as const satisfies Record<WordMode, { label: string; rule: string }>;

export const WORD_RESULT_KEYS = {
  correct: "wordResultCorrect",
  pass: "wordResultPass",
  foul: "wordResultFoul",
} as const satisfies Record<WordResult, string>;

/** The red of the last seconds and the forbidden words. */
export const WORD_COLORS = { warn: PLAYER_COLORS[0] } as const;

// The buttons sit on the team's colour: Foul is dark with red text, as a red fill would
// vanish on team 1's screen.
export const WORD_ANSWER_LOOK = {
  correct: { fill: PLAYER_COLORS[4], text: GAME_THEME.ink },
  pass: { fill: PLAYER_COLORS[2], text: GAME_THEME.ink },
  foul: { fill: GAME_THEME.bg, text: PLAYER_COLORS[0] },
} as const satisfies Record<WordResult, { fill: string; text: string }>;

/** How a result is written in the summary; the mark and label, never the colour alone. */
export const WORD_RESULT_LOOK = {
  correct: { mark: "✓", color: PLAYER_COLORS[4] },
  pass: { mark: "↷", color: GAME_THEME.muted },
  foul: { mark: "✕", color: PLAYER_COLORS[0] },
} as const satisfies Record<WordResult, { mark: string; color: string }>;

/** The clock turns red and pulses for this many seconds; it is read out once when it starts. */
export const WORD_WARN_SECONDS = 10;
/** How long "Time's up!" stays on the card before the turn ends. */
export const WORD_TIME_UP_MS = 1500;
