import { localeFor, translationsFor, type Lang } from "./i18n";
import { PLAYER_COLORS } from "./imposter";
import type { ScalePair } from "./scale-pairs/types";
import { WORD_MAX_TEAM, WORD_MIN_TEAM, defaultTeamNames, type WordTeam } from "./word-game";

export { GAME_THEME, playerColor } from "./imposter";
export type { ScalePair } from "./scale-pairs/types";
export {
  WORD_MAX_TEAM,
  defaultTeamNames,
  defaultWordSetup,
  fillTemplate,
  parseSavedSeen as parseSavedScaleSeen,
  teamColor,
  type WordSetup,
  type WordTeam,
} from "./word-game";

export type Rng = () => number;

export interface ScaleSetup {
  teams: [WordTeam, WordTeam];
  /** Turns per team. */
  turns: number;
}

export const SCALE_TURN_CHOICES = [4, 6, 8] as const;
export const SCALE_SETUP_STORAGE_KEY = "scale_setup";

/** The device's list of pairs played in `lang`, kept until every pair of the language has been. */
export function scaleSeenKey(lang: Lang): string {
  return `scale_seen_${lang}`;
}
export const SCALE_TAP_GUARD_MS = 400;
/** Next ignores taps this long after the reveal, so the confirming tap cannot skip it. */
export const SCALE_REVEAL_LOCK_MS = 1000;
export const SCALE_MIN = 0;
export const SCALE_MAX = 100;
export const SCALE_NEEDLE_START = 50;
export const SCALE_TARGET_MIN = 3;
export const SCALE_TARGET_MAX = 97;
/** The scoring band, narrowest zone last: a needle within `within` of the target scores `points`. */
export const SCALE_BANDS = [
  { within: 14, points: 2 },
  { within: 8, points: 3 },
  { within: 3, points: 4 },
] as const;

export function defaultScaleSetup(teamNames: readonly [string, string]): ScaleSetup {
  return {
    teams: [
      { name: teamNames[0], players: [] },
      { name: teamNames[1], players: [] },
    ],
    turns: 6,
  };
}

/** A setup moved to another language: team names still at either language's default follow it. */
export function scaleSetupInLang(setup: ScaleSetup, teamNames: readonly [string, string]): ScaleSetup {
  const defaults = (["tr", "en"] as const).map((l) => defaultTeamNames(translationsFor(l).wordTeamDefault));
  const teams = setup.teams.map((team, i) =>
    defaults.some((names) => names[i] === team.name) ? { ...team, name: teamNames[i] } : team
  ) as [WordTeam, WordTeam];
  return { ...setup, teams };
}

export type ScaleSetupError = "teamSize" | "blankName" | "duplicateName" | "blankTeamName" | "sameTeamName" | "rules";

export const SCALE_SETUP_ERROR_KEYS = {
  teamSize: "wordErrTeamSize",
  blankName: "wordErrBlank",
  duplicateName: "wordErrDuplicate",
  blankTeamName: "wordErrTeamBlank",
  sameTeamName: "wordErrTeamSame",
  rules: "scaleErrRules",
} as const satisfies Record<ScaleSetupError, string>;

export const SCALE_SETUP_STEPS = ["teams", "rules"] as const;
export type ScaleSetupStep = (typeof SCALE_SETUP_STEPS)[number];

const ERROR_STEP = {
  teamSize: "teams",
  blankName: "teams",
  duplicateName: "teams",
  blankTeamName: "teams",
  sameTeamName: "teams",
  rules: "rules",
} as const satisfies Record<ScaleSetupError, ScaleSetupStep>;

function isIn<T>(choices: readonly T[], value: unknown): value is T {
  return choices.includes(value as T);
}

/** `locale` is the app language's, e.g. "tr-TR": names are compared lowercased with its rules. */
export function validateScaleSetup(setup: ScaleSetup, locale: string): ScaleSetupError[] {
  const errors: ScaleSetupError[] = [];
  const { teams } = setup;
  if (teams.some((team) => team.players.length < WORD_MIN_TEAM || team.players.length > WORD_MAX_TEAM)) {
    errors.push("teamSize");
  }
  const names = teams.flatMap((team) => team.players.map((p) => p.trim()));
  if (names.some((n) => n === "")) errors.push("blankName");
  const keys = names.filter((n) => n !== "").map((n) => n.toLocaleLowerCase(locale));
  if (new Set(keys).size !== keys.length) errors.push("duplicateName");
  const teamNames = teams.map((team) => team.name.trim().toLocaleLowerCase(locale));
  if (teamNames.some((n) => n === "")) errors.push("blankTeamName");
  else if (teamNames[0] === teamNames[1]) errors.push("sameTeamName");
  if (!isIn(SCALE_TURN_CHOICES, setup.turns)) errors.push("rules");
  return errors;
}

/** The `validateScaleSetup` errors the given wizard step can fix. */
export function scaleStepErrors(setup: ScaleSetup, step: ScaleSetupStep, locale: string): ScaleSetupError[] {
  return validateScaleSetup(setup, locale).filter((e) => ERROR_STEP[e] === step);
}

function parseTeam(value: unknown, fallback: WordTeam): WordTeam {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const v = value as Record<string, unknown>;
  const players = Array.isArray(v.players) ? v.players.filter((p): p is string => typeof p === "string") : [];
  return { name: typeof v.name === "string" ? v.name : fallback.name, players: players.slice(0, WORD_MAX_TEAM) };
}

// Saved settings come from device storage, which may hold an older shape or garbage:
// keep each field only if it is valid on its own.
export function parseSavedScaleSetup(raw: string | null, teamNames: readonly [string, string]): ScaleSetup {
  const fallback = defaultScaleSetup(teamNames);
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
    teams: [parseTeam(teams[0], fallback.teams[0]), parseTeam(teams[1], fallback.teams[1])],
    turns: isIn<number>(SCALE_TURN_CHOICES, d.turns) ? d.turns : fallback.turns,
  };
}

export function scalePoints(distance: number): number {
  return [...SCALE_BANDS].reverse().find((band) => distance <= band.within)?.points ?? 0;
}

export type ScaleOutcome = "bullseye" | "veryClose" | "close" | "miss";

const OUTCOMES: Record<number, ScaleOutcome> = { 4: "bullseye", 3: "veryClose", 2: "close" };

export function scaleOutcome(points: number): ScaleOutcome {
  return OUTCOMES[points] ?? "miss";
}

export const SCALE_OUTCOME_KEYS = {
  bullseye: "scaleBullseye",
  veryClose: "scaleVeryClose",
  close: "scaleClose",
  miss: "scaleMiss",
} as const satisfies Record<ScaleOutcome, string>;

export interface ScaleZone {
  points: number;
  /** Where the zone starts and ends on the 0–100 line. */
  from: number;
  to: number;
}

/** The band around `target`, left to right, clipped to the line. */
export function scaleZones(target: number): ScaleZone[] {
  // Each zone reaches half a step past its last scoring value, so that value is drawn inside it.
  const reach = SCALE_BANDS.map((band) => band.within + 0.5);
  const last = SCALE_BANDS.length - 1;
  const zones: ScaleZone[] = SCALE_BANDS.map((band, i) => ({
    points: band.points,
    from: target - reach[i],
    to: i < last ? target - reach[i + 1] : target + reach[i],
  }));
  for (let i = last - 1; i >= 0; i--) {
    zones.push({ points: SCALE_BANDS[i].points, from: target + reach[i + 1], to: target + reach[i] });
  }
  return zones
    .map((zone) => ({ ...zone, from: Math.max(SCALE_MIN, zone.from), to: Math.min(SCALE_MAX, zone.to) }))
    .filter((zone) => zone.to > zone.from);
}

/** A whole target from SCALE_TARGET_MIN to SCALE_TARGET_MAX. */
export function drawScaleTarget(rng: Rng): number {
  const span = SCALE_TARGET_MAX - SCALE_TARGET_MIN + 1;
  return SCALE_TARGET_MIN + Math.min(span - 1, Math.floor(rng() * span));
}

function clampNeedle(value: number): number {
  return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, value)));
}

/** The needle value at `offset` along a line `width` long, in the same unit. */
export function needleAt(offset: number, width: number): number {
  if (!(width > 0)) return SCALE_NEEDLE_START;
  return clampNeedle((offset / width) * SCALE_MAX);
}

export function scaleWinner(scores: readonly [number, number]): 0 | 1 | null {
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}

export type ScalePhase = "setup" | "handoff" | "secret" | "guess" | "reveal" | "end";

export interface ScaleState {
  phase: ScalePhase;
  setup: ScaleSetup;
  /** The pairs' language, fixed when the game starts. */
  lang: Lang;
  /** The game's pairs, fixed at start; empty before it. */
  pairs: ScalePair[];
  /** Ids played on this device in `lang`; they leave when every pair has been played. Saved after every turn. */
  used: string[];
  /** This turn's pair, kept after the turn so the next draw can avoid it. */
  pair: ScalePair | null;
  target: number;
  needle: number;
  /** Lock in was tapped once: the next tap locks the needle. */
  confirming: boolean;
  /** Finished turns. The team on turn is `turnsPlayed % 2`. */
  turnsPlayed: number;
  /**
   * Turns each team has finished since the setup, Play again included: the next clue giver is
   * `players[clueGivers[team] % players.length]`, so over games every member gives clues.
   */
  clueGivers: [number, number];
  scores: [number, number];
  /** When the needle was locked, in ms. */
  revealedAt: number;
  /** When the last accepted button tap happened, in ms. */
  lastActionAt: number;
}

/** `at` is the tap's (or, for move, the drag's) timestamp in ms. */
export type ScaleAction =
  | { type: "start"; setup: ScaleSetup; lang: Lang; pairs: readonly ScalePair[]; seen: readonly string[]; at: number }
  | { type: "show"; rng: Rng; at: number }
  | { type: "hide"; at: number }
  | { type: "move"; needle: number; at: number }
  | { type: "lock"; at: number }
  | { type: "next"; at: number }
  | { type: "playAgain"; at: number }
  | { type: "newGame"; at: number };

export function initialScaleState(setup: ScaleSetup): ScaleState {
  return {
    phase: "setup",
    setup,
    lang: "en",
    pairs: [],
    used: [],
    pair: null,
    target: SCALE_NEEDLE_START,
    needle: SCALE_NEEDLE_START,
    confirming: false,
    turnsPlayed: 0,
    clueGivers: [0, 0],
    scores: [0, 0],
    revealedAt: 0,
    lastActionAt: 0,
  };
}

export function scaleTeam(state: Pick<ScaleState, "turnsPlayed">): 0 | 1 {
  return state.turnsPlayed % 2 === 0 ? 0 : 1;
}

/** The team on turn's turn number, 1-based. */
export function scaleTurn(state: Pick<ScaleState, "turnsPlayed">): number {
  return Math.floor(state.turnsPlayed / 2) + 1;
}

export function scaleClueGiver(state: Pick<ScaleState, "setup" | "turnsPlayed" | "clueGivers">): string {
  const team = scaleTeam(state);
  const { players } = state.setup.teams[team];
  return players[state.clueGivers[team] % players.length];
}

export function scaleDistance(state: Pick<ScaleState, "needle" | "target">): number {
  return Math.abs(state.needle - state.target);
}

// The next screen's buttons can sit where the last ones were, so a double tap would otherwise
// skip a screen or lock the needle unconfirmed.
function tooSoon(state: ScaleState, at: number): boolean {
  const d = at - state.lastActionAt;
  return d >= 0 && d < SCALE_TAP_GUARD_MS;
}

function revealLocked(state: ScaleState, at: number): boolean {
  const d = at - state.revealedAt;
  return d >= 0 && d < SCALE_REVEAL_LOCK_MS;
}

/** A pair not played yet. When the list has run out its ids are forgotten, and `last` is avoided. */
function drawPair(state: ScaleState, rng: Rng): Pick<ScaleState, "pair" | "used"> {
  const used = new Set(state.used);
  let choices = state.pairs.filter((p) => !used.has(p.id));
  let kept = state.used;
  if (choices.length === 0) {
    const ids = new Set(state.pairs.map((p) => p.id));
    kept = state.used.filter((id) => !ids.has(id));
    const others = state.pairs.filter((p) => p.id !== state.pair?.id);
    choices = others.length > 0 ? others : state.pairs;
  }
  const pair = choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
  return { pair, used: [...kept, pair.id] };
}

function trimSetup(setup: ScaleSetup): ScaleSetup {
  return {
    ...setup,
    teams: setup.teams.map((team) => ({ name: team.name.trim(), players: team.players.map((p) => p.trim()) })) as [
      WordTeam,
      WordTeam,
    ],
  };
}

function deal(
  state: ScaleState,
  setup: ScaleSetup,
  lang: Lang,
  pairs: ScalePair[],
  used: string[],
  clueGivers: [number, number],
  at: number
): ScaleState {
  return {
    ...initialScaleState(setup),
    phase: "handoff",
    lang,
    pairs,
    used,
    pair: state.pair,
    clueGivers,
    lastActionAt: at,
  };
}

export function scaleReducer(state: ScaleState, action: ScaleAction): ScaleState {
  switch (action.type) {
    case "start":
      if (state.phase !== "setup" || action.pairs.length === 0 || tooSoon(state, action.at)) return state;
      if (validateScaleSetup(action.setup, localeFor(action.lang)).length > 0) return state;
      return deal(state, trimSetup(action.setup), action.lang, [...action.pairs], [...action.seen], [0, 0], action.at);
    case "show":
      if (state.phase !== "handoff" || tooSoon(state, action.at)) return state;
      return {
        ...state,
        ...drawPair(state, action.rng),
        target: drawScaleTarget(action.rng),
        phase: "secret",
        lastActionAt: action.at,
      };
    case "hide":
      if (state.phase !== "secret" || tooSoon(state, action.at)) return state;
      return { ...state, phase: "guess", needle: SCALE_NEEDLE_START, confirming: false, lastActionAt: action.at };
    // Not a button: a drag sends many and ◀ ▶ may be tapped fast, so moves leave the last tap's
    // time alone. They still wait out the guard after a button.
    case "move":
      if (state.phase !== "guess" || Number.isNaN(action.needle) || tooSoon(state, action.at)) return state;
      return { ...state, needle: clampNeedle(action.needle), confirming: false };
    case "lock": {
      if (state.phase !== "guess" || tooSoon(state, action.at)) return state;
      if (!state.confirming) return { ...state, confirming: true, lastActionAt: action.at };
      const scores: [number, number] = [...state.scores];
      scores[scaleTeam(state)] += scalePoints(scaleDistance(state));
      return { ...state, phase: "reveal", confirming: false, scores, revealedAt: action.at, lastActionAt: action.at };
    }
    case "next": {
      if (state.phase !== "reveal" || tooSoon(state, action.at) || revealLocked(state, action.at)) return state;
      const team = scaleTeam(state);
      const turnsPlayed = state.turnsPlayed + 1;
      const clueGivers: [number, number] = [...state.clueGivers];
      clueGivers[team] += 1;
      return {
        ...state,
        phase: turnsPlayed >= 2 * state.setup.turns ? "end" : "handoff",
        turnsPlayed,
        clueGivers,
        lastActionAt: action.at,
      };
    }
    case "playAgain":
      if (state.phase !== "end" || tooSoon(state, action.at)) return state;
      return deal(state, state.setup, state.lang, state.pairs, state.used, state.clueGivers, action.at);
    case "newGame":
      if (state.phase !== "end" || tooSoon(state, action.at)) return state;
      // The setup's buttons can sit where New game was: keep the time so they are guarded too.
      return { ...initialScaleState(state.setup), pair: state.pair, lastActionAt: action.at };
  }
}

/** A zone's fill. The points are written on it too; dark text reads on each. */
export function scaleZoneColor(points: number): string {
  if (points === 4) return PLAYER_COLORS[5];
  return points === 3 ? PLAYER_COLORS[2] : PLAYER_COLORS[1];
}
