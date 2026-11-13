import type { Lang } from "./i18n";
import { IMPOSTER_CATEGORIES, IMPOSTER_WORDS, type ImposterCategory } from "./imposter-words";

export { IMPOSTER_CATEGORIES, IMPOSTER_WORDS };
export type { ImposterCategory, WordEntry } from "./imposter-words";

export type ImposterMode = "no-word" | "similar-word";
export type CategoryChoice = ImposterCategory | "mixed";

export interface ImposterSetup {
  players: string[];
  mode: ImposterMode;
  category: CategoryChoice;
  imposterCount: number;
  /** 0 means the timer is off. */
  timerMinutes: number;
  voting: boolean;
  scoreboard: boolean;
  /** similar-word mode only: the imposter is told they are the imposter. */
  imposterKnows: boolean;
}

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const MAX_IMPOSTERS = 3;
export const MAX_TIMER_MINUTES = 10;
export const SETUP_STORAGE_KEY = "imposter_setup";
export const TAP_GUARD_MS = 400;

export const DEFAULT_SETUP: ImposterSetup = {
  players: [],
  mode: "no-word",
  category: "mixed",
  imposterCount: 1,
  timerMinutes: 0,
  voting: false,
  scoreboard: false,
  imposterKnows: false,
};

export const CATEGORY_CHOICES: CategoryChoice[] = ["mixed", ...IMPOSTER_CATEGORIES];

export const CATEGORY_LABEL_KEYS = {
  mixed: "imposterCategoryMixed",
  animals: "imposterCategoryAnimals",
  food: "imposterCategoryFood",
  jobs: "imposterCategoryJobs",
  places: "imposterCategoryPlaces",
  objects: "imposterCategoryObjects",
  sports: "imposterCategorySports",
} as const satisfies Record<CategoryChoice, string>;

export const CATEGORY_EMOJI = {
  mixed: "🎲",
  animals: "🐾",
  food: "🍕",
  jobs: "🧑‍🚒",
  places: "🏝️",
  objects: "📦",
  sports: "⚽",
} as const satisfies Record<CategoryChoice, string>;

/** One colour per seat. All are light enough for `GAME_THEME.ink` text on top. */
export const PLAYER_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFD93D",
  "#A78BFA",
  "#6BCB77",
  "#FF9F43",
  "#54A0FF",
  "#F78FB3",
  "#C4E538",
  "#48DBFB",
  "#E2B07E",
  "#B2BEC3",
] as const;

export function playerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

/** Fixed colours of the game screens; they do not follow the app's light or dark theme. */
export const GAME_THEME = {
  bg: "#0B1020",
  text: "#FFFFFF",
  muted: "#A3ACC2",
  /** Text on a player's colour. */
  ink: "#111827",
} as const;

export type SetupError =
  | "tooFewPlayers"
  | "tooManyPlayers"
  | "blankName"
  | "duplicateName"
  | "imposterCount"
  | "scoreboardNeedsVoting";

export const SETUP_ERROR_KEYS = {
  tooFewPlayers: "imposterErrTooFew",
  tooManyPlayers: "imposterErrTooMany",
  blankName: "imposterErrBlank",
  duplicateName: "imposterErrDuplicate",
  imposterCount: "imposterErrCount",
  scoreboardNeedsVoting: "imposterErrScoreboard",
} as const satisfies Record<SetupError, string>;

export const SETUP_STEPS = ["players", "category", "rules"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

const ERROR_STEP = {
  tooFewPlayers: "players",
  tooManyPlayers: "players",
  blankName: "players",
  duplicateName: "players",
  imposterCount: "rules",
  scoreboardNeedsVoting: "rules",
} as const satisfies Record<SetupError, SetupStep>;

type Rng = () => number;

// Imposters must stay a minority, and more than three stops being fun.
export function maxImposters(playerCount: number): number {
  return Math.max(0, Math.min(MAX_IMPOSTERS, Math.floor((playerCount - 1) / 2)));
}

export function validateSetup(setup: ImposterSetup): SetupError[] {
  const errors: SetupError[] = [];
  const names = setup.players.map((p) => p.trim());
  if (names.length < MIN_PLAYERS) errors.push("tooFewPlayers");
  if (names.length > MAX_PLAYERS) errors.push("tooManyPlayers");
  if (names.some((n) => n === "")) errors.push("blankName");
  const keys = names.filter((n) => n !== "").map((n) => n.toLocaleLowerCase());
  if (new Set(keys).size !== keys.length) errors.push("duplicateName");
  // With too few players the player error already explains it; do not add a second one.
  const limit = Math.max(1, maxImposters(names.length));
  if (setup.imposterCount < 1 || setup.imposterCount > limit) errors.push("imposterCount");
  if (setup.scoreboard && !setup.voting) errors.push("scoreboardNeedsVoting");
  return errors;
}

/** The `validateSetup` errors the given wizard step can fix. */
export function stepErrors(setup: ImposterSetup, step: SetupStep): SetupError[] {
  return validateSetup(setup).filter((e) => ERROR_STEP[e] === step);
}

function pickIndex(length: number, rng: Rng): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

export function pickEntry(
  choice: CategoryChoice,
  used: string[],
  rng: Rng
): { id: string; category: ImposterCategory; index: number; used: string[] } {
  const categories: readonly ImposterCategory[] = choice === "mixed" ? IMPOSTER_CATEGORIES : [choice];
  const pool = categories.flatMap((category) =>
    IMPOSTER_WORDS[category].map((_, index) => ({ id: `${category}:${index}`, category, index }))
  );
  let base = used;
  let available = pool.filter((p) => !used.includes(p.id));
  if (available.length === 0) {
    // Every word of this choice was played: start over, but keep other categories' history.
    const poolIds = new Set(pool.map((p) => p.id));
    base = used.filter((id) => !poolIds.has(id));
    available = pool;
  }
  const picked = available[pickIndex(available.length, rng)];
  return { ...picked, used: [...base, picked.id] };
}

function pickImposters(playerCount: number, count: number, rng: Rng): number[] {
  const pool = Array.from({ length: playerCount }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + pickIndex(playerCount - i, rng);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

export type Card =
  | { kind: "word"; text: string }
  | { kind: "imposter"; category: ImposterCategory; word?: string };

export interface Round {
  entryId: string;
  category: ImposterCategory;
  word: string;
  pair: string;
  imposters: number[];
  cards: Card[];
  starter: number;
}

export function dealRound(
  setup: ImposterSetup,
  lang: Lang,
  used: string[],
  rng: Rng
): { round: Round; used: string[] } {
  const playerCount = setup.players.length;
  const picked = pickEntry(setup.category, used, rng);
  const { word, pair } = IMPOSTER_WORDS[picked.category][picked.index][lang];
  const imposters = pickImposters(playerCount, setup.imposterCount, rng);
  const cards: Card[] = setup.players.map((_, i) => {
    if (!imposters.includes(i)) return { kind: "word", text: word };
    if (setup.mode === "no-word") return { kind: "imposter", category: picked.category };
    return setup.imposterKnows
      ? { kind: "imposter", category: picked.category, word: pair }
      : { kind: "word", text: pair };
  });
  const starter = pickIndex(playerCount, rng);
  return {
    round: { entryId: picked.id, category: picked.category, word, pair, imposters, cards, starter },
    used: picked.used,
  };
}

/** `votes[voter]` is the index of the player that voter accused. */
export function tallyVotes(
  votes: number[],
  playerCount: number,
  imposters: number[]
): { counts: number[]; accused: number | null; crewWins: boolean } {
  const counts = Array.from({ length: playerCount }, () => 0);
  for (const target of votes) counts[target] += 1;
  const top = Math.max(...counts);
  const leaders = counts.flatMap((c, i) => (c === top ? [i] : []));
  const accused = leaders.length === 1 ? leaders[0] : null;
  return { counts, accused, crewWins: accused !== null && imposters.includes(accused) };
}

export function applyScore(scores: number[], imposters: number[], crewWins: boolean): number[] {
  return scores.map((score, i) => {
    const isImposter = imposters.includes(i);
    if (crewWins) return isImposter ? score : score + 1;
    return isImposter ? score + 2 : score;
  });
}

export type Phase = "setup" | "deal" | "discuss" | "vote" | "result";

export interface Outcome {
  accused: number | null;
  crewWins: boolean;
}

export interface GameState {
  phase: Phase;
  setup: ImposterSetup;
  round: Round | null;
  /** Whose turn it is to hold the phone, in deal and vote. */
  turn: number;
  /** Whether that player's card (deal) or ballot (vote) is showing. */
  revealed: boolean;
  votes: number[];
  scores: number[];
  /** Word ids played this session, so they do not come back too soon. */
  used: string[];
  outcome: Outcome | null;
  /** When the last accepted timed action happened, in ms. */
  lastActionAt: number;
}

/** `at` is the tap's timestamp in ms (Date.now()). */
export type GameAction =
  | { type: "start"; setup: ImposterSetup; lang: Lang; rng: Rng; at: number }
  | { type: "reveal"; at: number }
  | { type: "next"; at: number }
  | { type: "finishDiscussion"; at: number }
  | { type: "vote"; target: number; at: number }
  | { type: "nextRound"; lang: Lang; rng: Rng; at: number }
  | { type: "end"; at: number };

export function initialGameState(setup: ImposterSetup = DEFAULT_SETUP): GameState {
  return {
    phase: "setup",
    setup,
    round: null,
    turn: 0,
    revealed: false,
    votes: [],
    scores: [],
    used: [],
    outcome: null,
    lastActionAt: 0,
  };
}

// The buttons that move a turn on sit where the next screen's buttons appear, so a
// double tap would otherwise also press the next one, often for the next player.
function tooSoon(state: GameState, at: number): boolean {
  const d = at - state.lastActionAt;
  return d >= 0 && d < TAP_GUARD_MS;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start": {
      if (state.phase !== "setup" || validateSetup(action.setup).length > 0) return state;
      const setup = { ...action.setup, players: action.setup.players.map((p) => p.trim()) };
      const { round, used } = dealRound(setup, action.lang, state.used, action.rng);
      return {
        ...state,
        phase: "deal",
        setup,
        round,
        used,
        turn: 0,
        revealed: false,
        votes: [],
        outcome: null,
        scores: setup.players.map(() => 0),
        lastActionAt: action.at,
      };
    }
    case "reveal":
      if (state.phase !== "deal" && state.phase !== "vote") return state;
      if (tooSoon(state, action.at)) return state;
      return { ...state, revealed: true, lastActionAt: action.at };
    case "next": {
      if (state.phase !== "deal" || !state.revealed || tooSoon(state, action.at)) return state;
      const turn = state.turn + 1;
      if (turn < state.setup.players.length) return { ...state, turn, revealed: false, lastActionAt: action.at };
      return { ...state, phase: "discuss", turn: 0, revealed: false, lastActionAt: action.at };
    }
    case "finishDiscussion":
      if (state.phase !== "discuss" || tooSoon(state, action.at)) return state;
      if (state.setup.voting) {
        return { ...state, phase: "vote", turn: 0, revealed: false, votes: [], lastActionAt: action.at };
      }
      return { ...state, phase: "result", outcome: null, lastActionAt: action.at };
    case "vote": {
      if (state.phase !== "vote" || !state.revealed || !state.round || tooSoon(state, action.at)) return state;
      const playerCount = state.setup.players.length;
      const { target } = action;
      if (!Number.isInteger(target) || target < 0 || target >= playerCount || target === state.turn) return state;
      const votes = [...state.votes, target];
      if (votes.length < playerCount) {
        return { ...state, votes, turn: state.turn + 1, revealed: false, lastActionAt: action.at };
      }
      const { accused, crewWins } = tallyVotes(votes, playerCount, state.round.imposters);
      const scores = state.setup.scoreboard ? applyScore(state.scores, state.round.imposters, crewWins) : state.scores;
      return {
        ...state,
        phase: "result",
        votes,
        revealed: false,
        outcome: { accused, crewWins },
        scores,
        lastActionAt: action.at,
      };
    }
    case "nextRound": {
      if (state.phase !== "result" || tooSoon(state, action.at)) return state;
      const { round, used } = dealRound(state.setup, action.lang, state.used, action.rng);
      return {
        ...state,
        phase: "deal",
        round,
        used,
        turn: 0,
        revealed: false,
        votes: [],
        outcome: null,
        lastActionAt: action.at,
      };
    }
    case "end":
      if (tooSoon(state, action.at)) return state;
      return { ...initialGameState(state.setup), used: state.used };
  }
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

// Saved settings come from device storage, which may hold an older shape or garbage:
// keep each field only if it is valid on its own.
export function parseSavedSetup(raw: string | null): ImposterSetup {
  if (!raw) return DEFAULT_SETUP;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_SETUP;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return DEFAULT_SETUP;
  const d = data as Record<string, unknown>;
  const players = Array.isArray(d.players)
    ? d.players.filter((p): p is string => typeof p === "string").slice(0, MAX_PLAYERS)
    : [];
  const category = CATEGORY_CHOICES.includes(d.category as CategoryChoice) ? (d.category as CategoryChoice) : "mixed";
  const voting = d.voting === true;
  return {
    players,
    mode: d.mode === "similar-word" ? "similar-word" : "no-word",
    category,
    imposterCount: isIntIn(d.imposterCount, 1, MAX_IMPOSTERS) ? d.imposterCount : 1,
    timerMinutes: isIntIn(d.timerMinutes, 0, MAX_TIMER_MINUTES) ? d.timerMinutes : 0,
    voting,
    scoreboard: voting && d.scoreboard === true,
    imposterKnows: d.imposterKnows === true,
  };
}

export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
