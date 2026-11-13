import type { Lang } from "./i18n";
import { PLAYER_COLORS } from "./imposter";
import { WORD_CATEGORIES, type WordCard, type WordCategory } from "./word-game-words/types";

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
// the seen list is forgotten so the game still has enough words.
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
  return { deck: shuffle(pool, rng), seen: seen.filter((id) => !poolIds.has(id)) };
}
