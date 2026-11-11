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
}

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const MAX_IMPOSTERS = 3;
export const MAX_TIMER_MINUTES = 10;
export const SETUP_STORAGE_KEY = "imposter_setup";

export const DEFAULT_SETUP: ImposterSetup = {
  players: [],
  mode: "no-word",
  category: "mixed",
  imposterCount: 1,
  timerMinutes: 0,
  voting: false,
  scoreboard: false,
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

export type Card = { kind: "word"; text: string } | { kind: "imposter"; category: ImposterCategory };

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
    return setup.mode === "similar-word"
      ? { kind: "word", text: pair }
      : { kind: "imposter", category: picked.category };
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
