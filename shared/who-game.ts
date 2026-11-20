import { localeFor, translationsFor, type Lang } from "./i18n";
import { MAX_PLAYERS, PLAYER_COLORS, playerColor } from "./imposter";
import { WHO_KINDS, type WhoCard, type WhoKind, type WhoLevel, type WhoRegion } from "./who-cards/types";
import type { WordCard } from "./word-game-words/types";
import { WORD_MAX_TEAM, WORD_MIN_TEAM, defaultTeamNames, shuffle, teamColor, type WordTeam } from "./word-game";

export { GAME_THEME, MAX_PLAYERS, playerColor } from "./imposter";
export { WHO_KINDS } from "./who-cards/types";
export type { WhoCard, WhoKind, WhoLevel, WhoRegion } from "./who-cards/types";
export {
  WORD_MAX_TEAM,
  defaultTeamNames,
  defaultWordSetup,
  fillTemplate,
  formatCountdown,
  parseSavedSeen as parseSavedWhoSeen,
  teamColor,
  type WordSetup,
  type WordTeam,
} from "./word-game";

export type Rng = () => number;
export type WhoMode = "solo" | "teams";
export type WhoRegionChoice = WhoRegion | "mixed";
export type WhoLevelChoice = WhoLevel | "mixed";

export const WHO_THING_CATEGORIES = ["animals", "jobs", "objects"] as const;
export type WhoThingCategory = (typeof WHO_THING_CATEGORIES)[number];
/** Things per language: the Describe It lists, passed in so this module never loads them. */
export type WhoThings = Readonly<Record<Lang, Readonly<Record<WhoThingCategory, readonly WordCard[]>>>>;

/** Everything a game can deal from. */
export interface WhoSources {
  people: readonly WhoCard[];
  characters: readonly WhoCard[];
  things: WhoThings;
}

export interface WhoSetup {
  mode: WhoMode;
  /** The solo players. Kept while teams are chosen, so switching back loses no names. */
  players: string[];
  teams: [WordTeam, WordTeam];
  kinds: WhoKind[];
  /** People and characters only; things have no region. */
  region: WhoRegionChoice;
  level: WhoLevelChoice;
  turnSeconds: number;
  rounds: number;
}

export const WHO_MIN_PLAYERS = 2;
export const WHO_MODES = ["solo", "teams"] as const satisfies readonly WhoMode[];
export const WHO_REGION_CHOICES = ["tr", "world", "mixed"] as const satisfies readonly WhoRegionChoice[];
export const WHO_LEVEL_CHOICES = ["easy", "hard", "mixed"] as const satisfies readonly WhoLevelChoice[];
export const WHO_TURN_SECONDS = [30, 60, 90] as const;
export const WHO_ROUND_CHOICES = [1, 2, 3] as const;
export const WHO_SETUP_STORAGE_KEY = "who_setup";
/** The fewest cards a game may be dealt from; fewer unseen ones and the seen list starts over. */
export const WHO_DECK_MIN = 50;
export const WHO_TAP_GUARD_MS = 400;
/** The summary ignores taps this long after the turn ends. */
export const WHO_SUMMARY_LOCK_MS = 1500;
/** How long the phone vibrates when the time is up. */
export const WHO_VIBRATE_MS = 600;

export function whoSeenKey(lang: Lang): string {
  return `who_seen_${lang}`;
}

export function defaultWhoSetup(lang: Lang, teamNames: readonly [string, string]): WhoSetup {
  return {
    mode: "solo",
    players: [],
    teams: [
      { name: teamNames[0], players: [] },
      { name: teamNames[1], players: [] },
    ],
    kinds: ["people", "characters"],
    region: lang === "tr" ? "mixed" : "world",
    level: "mixed",
    turnSeconds: 60,
    rounds: 2,
  };
}

/** A setup moved to `lang`: default team names follow it, and so does the region unless `keepRegion`. */
export function whoSetupInLang(
  setup: WhoSetup,
  lang: Lang,
  teamNames: readonly [string, string],
  keepRegion: boolean
): WhoSetup {
  const defaults = (["tr", "en"] as const).map((l) => defaultTeamNames(translationsFor(l).wordTeamDefault));
  const teams = setup.teams.map((team, i) =>
    defaults.some((names) => names[i] === team.name) ? { ...team, name: teamNames[i] } : team
  ) as [WordTeam, WordTeam];
  return { ...setup, teams, region: keepRegion ? setup.region : defaultWhoSetup(lang, teamNames).region };
}

export type WhoSetupError =
  | "tooFewPlayers"
  | "tooManyPlayers"
  | "blankName"
  | "duplicateName"
  | "teamSize"
  | "blankTeamName"
  | "sameTeamName"
  | "noKinds"
  | "smallPool"
  | "rules";

export const WHO_SETUP_ERROR_KEYS = {
  tooFewPlayers: "whoErrTooFew",
  tooManyPlayers: "imposterErrTooMany",
  blankName: "imposterErrBlank",
  duplicateName: "imposterErrDuplicate",
  teamSize: "wordErrTeamSize",
  blankTeamName: "wordErrTeamBlank",
  sameTeamName: "wordErrTeamSame",
  noKinds: "whoErrNoKinds",
  smallPool: "whoErrSmallPool",
  rules: "whoErrRules",
} as const satisfies Record<WhoSetupError, string>;

export const WHO_SETUP_STEPS = ["players", "cards", "rules"] as const;
export type WhoSetupStep = (typeof WHO_SETUP_STEPS)[number];

const ERROR_STEP = {
  tooFewPlayers: "players",
  tooManyPlayers: "players",
  blankName: "players",
  duplicateName: "players",
  teamSize: "players",
  blankTeamName: "players",
  sameTeamName: "players",
  noKinds: "cards",
  smallPool: "cards",
  rules: "rules",
} as const satisfies Record<WhoSetupError, WhoSetupStep>;

function isIn<T>(choices: readonly T[], value: unknown): value is T {
  return choices.includes(value as T);
}

/**
 * `locale` is the app language's, e.g. "tr-TR": names are compared lowercased with its rules.
 * `poolSize` is how many cards the setup's kinds, region and level give (`whoPool`).
 */
export function validateWhoSetup(setup: WhoSetup, locale: string, poolSize: number): WhoSetupError[] {
  const errors: WhoSetupError[] = [];
  const lists = setup.mode === "solo" ? [setup.players] : setup.teams.map((team) => team.players);
  if (setup.mode === "solo") {
    if (setup.players.length < WHO_MIN_PLAYERS) errors.push("tooFewPlayers");
    if (setup.players.length > MAX_PLAYERS) errors.push("tooManyPlayers");
  } else if (setup.teams.some((team) => team.players.length < WORD_MIN_TEAM || team.players.length > WORD_MAX_TEAM)) {
    errors.push("teamSize");
  }
  const names = lists.flat().map((p) => p.trim());
  if (names.some((n) => n === "")) errors.push("blankName");
  const keys = names.filter((n) => n !== "").map((n) => n.toLocaleLowerCase(locale));
  if (new Set(keys).size !== keys.length) errors.push("duplicateName");
  if (setup.mode === "teams") {
    const teamNames = setup.teams.map((team) => team.name.trim().toLocaleLowerCase(locale));
    if (teamNames.some((n) => n === "")) errors.push("blankTeamName");
    else if (teamNames[0] === teamNames[1]) errors.push("sameTeamName");
  }
  if (setup.kinds.length === 0) errors.push("noKinds");
  else if (poolSize < WHO_DECK_MIN) errors.push("smallPool");
  if (!isIn(WHO_TURN_SECONDS, setup.turnSeconds) || !isIn(WHO_ROUND_CHOICES, setup.rounds)) errors.push("rules");
  return errors;
}

/** The `validateWhoSetup` errors the given wizard step can fix. */
export function whoStepErrors(setup: WhoSetup, step: WhoSetupStep, locale: string, poolSize: number): WhoSetupError[] {
  return validateWhoSetup(setup, locale, poolSize).filter((e) => ERROR_STEP[e] === step);
}

function strings(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.filter((p): p is string => typeof p === "string").slice(0, max) : [];
}

function parseTeam(value: unknown, fallback: WordTeam): WordTeam {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const v = value as Record<string, unknown>;
  return { name: typeof v.name === "string" ? v.name : fallback.name, players: strings(v.players, WORD_MAX_TEAM) };
}

// Saved settings come from device storage, which may hold an older shape or garbage:
// keep each field only if it is valid on its own.
export function parseSavedWhoSetup(raw: string | null, lang: Lang, teamNames: readonly [string, string]): WhoSetup {
  const fallback = defaultWhoSetup(lang, teamNames);
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
  const kinds: unknown[] | null = Array.isArray(d.kinds) ? d.kinds : null;
  const pick = <T>(choices: readonly T[], value: unknown, otherwise: T): T => (isIn(choices, value) ? value : otherwise);
  return {
    mode: pick(WHO_MODES, d.mode, fallback.mode),
    players: strings(d.players, MAX_PLAYERS),
    teams: [parseTeam(teams[0], fallback.teams[0]), parseTeam(teams[1], fallback.teams[1])],
    kinds: kinds ? WHO_KINDS.filter((k) => kinds.includes(k)) : fallback.kinds,
    region: pick(WHO_REGION_CHOICES, d.region, fallback.region),
    level: pick(WHO_LEVEL_CHOICES, d.level, fallback.level),
    turnSeconds: pick<number>(WHO_TURN_SECONDS, d.turnSeconds, fallback.turnSeconds),
    rounds: pick<number>(WHO_ROUND_CHOICES, d.rounds, fallback.rounds),
  };
}

/** A card as one game shows it: in the game's language. */
export interface WhoPlayCard {
  id: string;
  name: string;
  hint: string;
}

export const WHO_THING_HINT_KEYS = {
  animals: "imposterCategoryAnimals",
  jobs: "imposterCategoryJobs",
  objects: "imposterCategoryObjects",
} as const satisfies Record<WhoThingCategory, string>;

// As the card lists' own duplicate check: lowercased with the language's rules, accents and
// anything but letters and digits dropped. Letters are told by having a case, not by a Unicode
// property escape, and normalize is optional: the phone's JavaScript engine may lack either.
// Each letter of the card lists outside ASCII, as the language's lowercasing and NFKD decomposition
// leave it once marks are dropped. Hermes on Android sends every toLocaleLowerCase, normalize and
// non-ASCII case change through Java, so the pool's thousands of names never call them.
const NAME_FOLD: Readonly<Record<string, string>> = {
  Á: "a", á: "a", à: "a", ã: "a", ä: "a", ă: "a", ą: "a",
  Ç: "c", ç: "c", ć: "c", Č: "c", č: "c",
  É: "e", é: "e", è: "e", ë: "e", ě: "e",
  İ: "i", í: "i", ı: "ı",
  ñ: "n",
  Ö: "o", ö: "o", ó: "o", ō: "o", Ø: "ø", ø: "ø", æ: "æ",
  ğ: "g", ř: "r",
  Ś: "s", Ş: "s", ş: "s", Š: "s", š: "s",
  Ü: "u", ü: "u", ú: "u", ū: "u",
  ž: "z",
};

/** A letter the table does not know, by the engine's own rules. */
function foldRare(c: string, lang: Lang): string {
  const lower = c.toLocaleLowerCase(localeFor(lang));
  return [...(typeof lower.normalize === "function" ? lower.normalize("NFKD") : lower)]
    .filter((d) => (d >= "0" && d <= "9") || d.toLowerCase() !== d.toUpperCase())
    .join("");
}

/** A name lowercased with the language's rules, accents, spaces and punctuation dropped. */
export function whoNameKey(name: string, lang: Lang): string {
  let key = "";
  for (const c of name) {
    if ((c >= "a" && c <= "z") || (c >= "0" && c <= "9")) key += c;
    else if (c >= "A" && c <= "Z") key += c === "I" && lang === "tr" ? "ı" : String.fromCharCode(c.charCodeAt(0) + 32);
    else if (c > "\x7f") key += NAME_FOLD[c] ?? foldRare(c, lang);
  }
  return key;
}

// Building a pool runs thousands of locale-aware lowercasings and normalisations, which are
// slow on the phone, and the screens ask for the same pool several times while it opens.
// Pools are never changed after they are built, so each choice is built once per sources.
const POOLS = new WeakMap<WhoSources, Map<string, readonly WhoPlayCard[]>>();

/** Every card the setup's kinds, region and level allow, in `lang`, each name once. Shared, so read-only. */
export function whoPool(
  choice: Pick<WhoSetup, "kinds" | "region" | "level">,
  sources: WhoSources,
  lang: Lang
): readonly WhoPlayCard[] {
  const key = [lang, [...choice.kinds].sort().join(","), choice.region, choice.level].join("|");
  let pools = POOLS.get(sources);
  if (!pools) POOLS.set(sources, (pools = new Map()));
  const cached = pools.get(key);
  if (cached) return cached;
  const pool = buildPool(choice, sources, lang);
  pools.set(key, pool);
  return pool;
}

function buildPool(
  choice: Pick<WhoSetup, "kinds" | "region" | "level">,
  sources: WhoSources,
  lang: Lang
): WhoPlayCard[] {
  const levelOk = (level: WhoLevel) => choice.level === "mixed" || level === choice.level;
  const named = (list: readonly WhoCard[]) =>
    list
      .filter((c) => (choice.region === "mixed" || c.region === choice.region) && levelOk(c.level))
      .map((c): WhoPlayCard => ({ id: c.id, name: c.name[lang], hint: c.hint[lang] }));
  const t = translationsFor(lang);
  const things = () =>
    WHO_THING_CATEGORIES.flatMap((category) =>
      sources.things[lang][category]
        .filter((w) => levelOk(w.level))
        .map((w): WhoPlayCard => ({ id: `things:${w.id}`, name: w.word, hint: t[WHO_THING_HINT_KEYS[category]] }))
    );
  const cards = WHO_KINDS.flatMap((kind) => {
    if (!choice.kinds.includes(kind)) return [];
    if (kind === "things") return things();
    return named(kind === "people" ? sources.people : sources.characters);
  });
  // A painter and a Ninja Turtle can share a name: the first kind's card is dealt, never both.
  const names = new Set<string>();
  return cards.filter((c) => {
    const key = whoNameKey(c.name, lang);
    if (names.has(key)) return false;
    names.add(key);
    return true;
  });
}

// The cards this device has not shown yet come first. When fewer than WHO_DECK_MIN are unseen,
// the pool's part of the seen list is forgotten, so the next games start from fresh cards again.
export function buildWhoDeck(
  pool: readonly WhoPlayCard[],
  seen: readonly string[],
  rng: Rng
): { deck: WhoPlayCard[]; seen: string[] } {
  const seenIds = new Set(seen);
  const unseen = pool.filter((c) => !seenIds.has(c.id));
  const again = pool.filter((c) => seenIds.has(c.id));
  const deck = [...shuffle(unseen, rng), ...shuffle(again, rng)];
  if (unseen.length >= WHO_DECK_MIN) return { deck, seen: [...seen] };
  const poolIds = new Set(pool.map((c) => c.id));
  return { deck, seen: seen.filter((id) => !poolIds.has(id)) };
}

export type WhoPhase = "setup" | "handoff" | "turn" | "summary" | "end";
export type WhoResult = "got" | "pass";

export interface WhoTurnCard {
  card: WhoPlayCard;
  result: WhoResult;
}

export interface WhoState {
  phase: WhoPhase;
  setup: WhoSetup;
  /** The cards' language, fixed when the game starts. */
  lang: Lang;
  /** The game's cards, fixed at start; empty before it. */
  pool: readonly WhoPlayCard[];
  deck: WhoPlayCard[];
  /** The card on screen during a turn. */
  card: WhoPlayCard | null;
  /** Ids shown on this device in `lang`; saved after every turn. */
  seen: string[];
  /** Finished turns. */
  turnsPlayed: number;
  /**
   * Turns each team has had since the setup, Play again included: the next guesser is
   * `players[guessers[team] % players.length]`, so over games every member guesses.
   */
  guessers: [number, number];
  /** Per player (solo) or per team, for finished turns. */
  scores: number[];
  /** This turn's cards in the order they were shown. */
  results: WhoTurnCard[];
  /** The turn's length in ms of on-screen time. */
  turnMs: number;
  /** On-screen time used before `runningSince`. */
  usedMs: number;
  /** When the clock last started; null while the game is off screen. */
  runningSince: number | null;
  /** When the last turn ended, in ms. */
  endedAt: number;
  /** When the last accepted tap (or the turn's end) happened, in ms. */
  lastActionAt: number;
}

/** `at` is the tap's (or, for tick, pause and resume, the clock's) timestamp in ms. */
export type WhoAction =
  | { type: "start"; setup: WhoSetup; lang: Lang; sources: WhoSources; seen: readonly string[]; rng: Rng; at: number }
  | { type: "begin"; rng: Rng; at: number }
  | { type: "answer"; result: WhoResult; rng: Rng; at: number }
  | { type: "tick"; at: number }
  | { type: "pause"; at: number }
  | { type: "resume"; at: number }
  | { type: "flip"; index: number; at: number }
  | { type: "next"; at: number }
  | { type: "playAgain"; rng: Rng; at: number }
  | { type: "newGame"; at: number };

export function initialWhoState(setup: WhoSetup): WhoState {
  return {
    phase: "setup",
    setup,
    lang: "en",
    pool: [],
    deck: [],
    card: null,
    seen: [],
    turnsPlayed: 0,
    guessers: [0, 0],
    scores: [],
    results: [],
    turnMs: 0,
    usedMs: 0,
    runningSince: null,
    endedAt: 0,
    lastActionAt: 0,
  };
}

function sides(setup: WhoSetup): number {
  return setup.mode === "solo" ? setup.players.length : 2;
}

/** Every player (solo) or every team plays one turn per round. */
export function totalTurns(setup: WhoSetup): number {
  return sides(setup) * setup.rounds;
}

/** The player (solo) or team on turn. */
export function whoSide(state: Pick<WhoState, "setup" | "turnsPlayed">): number {
  return state.turnsPlayed % sides(state.setup);
}

/** 1-based. */
export function whoRound(state: Pick<WhoState, "setup" | "turnsPlayed">): number {
  return Math.floor(state.turnsPlayed / sides(state.setup)) + 1;
}

/** Who guesses this turn. A team's members guess one after another, carried over Play again. */
export function whoGuesser(state: Pick<WhoState, "setup" | "turnsPlayed" | "guessers">): string {
  const { setup } = state;
  const side = whoSide(state);
  if (setup.mode === "solo") return setup.players[side];
  const { players } = setup.teams[side];
  return players[state.guessers[side] % players.length];
}

export function turnPoints(results: readonly WhoTurnCard[]): number {
  return results.filter((r) => r.result === "got").length;
}

/** The scores as shown: in the summary they include the turn being checked. */
export function whoScores(state: Pick<WhoState, "phase" | "scores" | "results" | "setup" | "turnsPlayed">): number[] {
  if (state.phase !== "summary") return state.scores;
  const side = whoSide(state);
  return state.scores.map((s, i) => (i === side ? s + turnPoints(state.results) : s));
}

/** Every side with the top score: more than one is a tie. */
export function whoWinners(scores: readonly number[]): number[] {
  const top = Math.max(...scores);
  return scores.flatMap((s, i) => (s === top ? [i] : []));
}

function used(clock: Pick<WhoState, "usedMs" | "runningSince">, at: number): number {
  return clock.usedMs + (clock.runningSince === null ? 0 : Math.max(0, at - clock.runningSince));
}

/** The turn's on-screen time left at `at`, in ms. */
export function whoTimeLeft(clock: Pick<WhoState, "turnMs" | "usedMs" | "runningSince">, at: number): number {
  return Math.max(0, clock.turnMs - used(clock, at));
}

// The holder taps blind, and the next screen's buttons can sit where the last ones were, so a
// double tap would otherwise score twice or skip a screen.
function tooSoon(state: WhoState, at: number): boolean {
  const d = at - state.lastActionAt;
  return d >= 0 && d < WHO_TAP_GUARD_MS;
}

function markSeen(seen: string[], id: string): string[] {
  return seen.includes(id) ? seen : [...seen, id];
}

/** The next card. An empty deck is dealt again from the whole pool, `shown` last. */
function draw(state: WhoState, shown: WhoPlayCard | null, rng: Rng): Pick<WhoState, "card" | "deck" | "seen"> {
  let deck = state.deck;
  if (deck.length === 0) {
    const rest = shuffle(
      state.pool.filter((c) => c.id !== shown?.id),
      rng
    );
    deck = shown && rest.length > 0 ? [...rest, shown] : rest.length > 0 ? rest : [...state.pool];
  }
  const [card, ...remaining] = deck;
  return { card, deck: remaining, seen: markSeen(state.seen, card.id) };
}

// Time up: the card on screen counts as passed.
function endTurn(state: WhoState, at: number): WhoState {
  return {
    ...state,
    phase: "summary",
    card: null,
    results: state.card ? [...state.results, { card: state.card, result: "pass" }] : state.results,
    usedMs: state.turnMs,
    runningSince: null,
    endedAt: at,
    lastActionAt: at,
  };
}

// The guesser keeps tapping blind until they feel the vibration: the summary waits a moment.
function summaryLocked(state: WhoState, at: number): boolean {
  const d = at - state.endedAt;
  return d >= 0 && d < WHO_SUMMARY_LOCK_MS;
}

function timeUp(state: WhoState, at: number): boolean {
  return used(state, at) >= state.turnMs;
}

function trimSetup(setup: WhoSetup): WhoSetup {
  return {
    ...setup,
    players: setup.players.map((p) => p.trim()),
    teams: setup.teams.map((team) => ({ name: team.name.trim(), players: team.players.map((p) => p.trim()) })) as [
      WordTeam,
      WordTeam,
    ],
  };
}

function deal(
  setup: WhoSetup,
  lang: Lang,
  pool: readonly WhoPlayCard[],
  seen: readonly string[],
  guessers: [number, number],
  rng: Rng,
  at: number
): WhoState {
  const built = buildWhoDeck(pool, seen, rng);
  return {
    ...initialWhoState(setup),
    phase: "handoff",
    guessers,
    lang,
    pool,
    deck: built.deck,
    seen: built.seen,
    scores: Array.from({ length: sides(setup) }, () => 0),
    lastActionAt: at,
  };
}

function nextGuessers(guessers: [number, number], team: number): [number, number] {
  return team === 0 ? [guessers[0] + 1, guessers[1]] : [guessers[0], guessers[1] + 1];
}

export function whoReducer(state: WhoState, action: WhoAction): WhoState {
  switch (action.type) {
    case "start": {
      if (state.phase !== "setup" || tooSoon(state, action.at)) return state;
      const pool = whoPool(action.setup, action.sources, action.lang);
      if (validateWhoSetup(action.setup, localeFor(action.lang), pool.length).length > 0) return state;
      return deal(trimSetup(action.setup), action.lang, pool, action.seen, [0, 0], action.rng, action.at);
    }
    case "begin":
      if (state.phase !== "handoff" || tooSoon(state, action.at)) return state;
      return {
        ...state,
        ...draw(state, null, action.rng),
        phase: "turn",
        results: [],
        turnMs: state.setup.turnSeconds * 1000,
        usedMs: 0,
        runningSince: action.at,
        lastActionAt: action.at,
      };
    case "answer": {
      const { card } = state;
      if (state.phase !== "turn" || !card || tooSoon(state, action.at)) return state;
      // A tap that comes in at or after the end, e.g. before a late tick, ends the turn instead.
      if (timeUp(state, action.at)) return endTurn(state, action.at);
      const answered = { ...state, results: [...state.results, { card, result: action.result }] };
      return { ...answered, ...draw(answered, card, action.rng), lastActionAt: action.at };
    }
    // The clock's actions are not taps: no tap guard, and they leave its time alone.
    case "tick":
      if (state.phase !== "turn" || state.runningSince === null || !timeUp(state, action.at)) return state;
      return endTurn(state, action.at);
    case "pause":
      if (state.phase !== "turn" || state.runningSince === null) return state;
      return { ...state, usedMs: used(state, action.at), runningSince: null };
    case "resume":
      if (state.phase !== "turn" || state.runningSince !== null) return state;
      return { ...state, runningSince: action.at };
    case "flip": {
      const target = state.results[action.index];
      if (state.phase !== "summary" || !target || tooSoon(state, action.at) || summaryLocked(state, action.at)) return state;
      const flipped: WhoTurnCard = { ...target, result: target.result === "got" ? "pass" : "got" };
      return {
        ...state,
        results: state.results.map((r, i) => (i === action.index ? flipped : r)),
        lastActionAt: action.at,
      };
    }
    case "next": {
      if (state.phase !== "summary" || tooSoon(state, action.at) || summaryLocked(state, action.at)) return state;
      const turnsPlayed = state.turnsPlayed + 1;
      return {
        ...state,
        phase: turnsPlayed >= totalTurns(state.setup) ? "end" : "handoff",
        scores: whoScores(state),
        turnsPlayed,
        guessers: state.setup.mode === "teams" ? nextGuessers(state.guessers, whoSide(state)) : state.guessers,
        lastActionAt: action.at,
      };
    }
    case "playAgain":
      if (state.phase !== "end" || tooSoon(state, action.at)) return state;
      return deal(state.setup, state.lang, state.pool, state.seen, state.guessers, action.rng, action.at);
    case "newGame":
      if (state.phase !== "end" || tooSoon(state, action.at)) return state;
      // The setup's buttons can sit where New game was: keep the time so they are guarded too.
      return { ...initialWhoState(state.setup), lastActionAt: action.at };
  }
}

export type NameSize = "xl" | "lg" | "md" | "sm";

// The name must be readable across a table but fit the screen: long names, and names with a
// long word that cannot wrap, get a smaller step.
export function nameSize(name: string): NameSize {
  const length = [...name].length;
  const longest = Math.max(0, ...name.split(/\s+/).map((w) => [...w].length));
  if (length <= 10 && longest <= 8) return "xl";
  if (length <= 18 && longest <= 11) return "lg";
  if (length <= 28 && longest <= 15) return "md";
  return "sm";
}

export const WHO_KIND_KEYS = {
  people: { label: "whoKindPeople", hint: "whoKindPeopleHint" },
  characters: { label: "whoKindCharacters", hint: "whoKindCharactersHint" },
  things: { label: "whoKindThings", hint: "whoKindThingsHint" },
} as const satisfies Record<WhoKind, { label: string; hint: string }>;

export const WHO_KIND_EMOJI = {
  people: "🌟",
  characters: "🧚",
  things: "🐘",
} as const satisfies Record<WhoKind, string>;

export const WHO_REGION_KEYS = {
  tr: "whoRegionTr",
  world: "whoRegionWorld",
  mixed: "whoRegionMixed",
} as const satisfies Record<WhoRegionChoice, string>;

export const WHO_LEVEL_KEYS = {
  easy: "whoLevelEasy",
  hard: "whoLevelHard",
  mixed: "whoLevelMixed",
} as const satisfies Record<WhoLevelChoice, string>;

export const WHO_RESULT_KEYS = {
  got: "whoResultGot",
  pass: "whoResultPassed",
} as const satisfies Record<WhoResult, string>;

/** The two tap halves; dark text reads on both. */
export const WHO_ANSWER_COLORS = {
  got: PLAYER_COLORS[4],
  pass: PLAYER_COLORS[2],
} as const satisfies Record<WhoResult, string>;

/** How a result is written in the summary: the mark and the label, never the colour alone. */
export const WHO_RESULT_MARKS = {
  got: "✓",
  pass: "↷",
} as const satisfies Record<WhoResult, string>;

/** The colour of a player (solo) or team (teams) side. */
export function sideColor(mode: WhoMode, side: number): string {
  return mode === "solo" ? playerColor(side) : teamColor(side);
}

/** A side's name: the player (solo) or the team. */
export function sideName(setup: WhoSetup, side: number): string {
  return setup.mode === "solo" ? setup.players[side] : setup.teams[side].name;
}

/** Every side's name, in turn order. */
export function sideNames(setup: WhoSetup): string[] {
  return Array.from({ length: sides(setup) }, (_, side) => sideName(setup, side));
}
