import { localeFor, translationsFor, type Lang } from "./i18n";
import { MAX_PLAYERS, PLAYER_COLORS } from "./imposter";
import { POTATO_CATEGORIES, POTATO_LETTERS, type PotatoCategory } from "./hot-potato-letters";
import type { PotatoPrompt } from "./hot-potato-prompts/types";
import { fillTemplate } from "./word-game";

export { GAME_THEME, MAX_PLAYERS, playerColor } from "./imposter";
export { fillTemplate } from "./word-game";
export { POTATO_CANDIDATE_LETTERS, POTATO_CATEGORIES, POTATO_LETTERS } from "./hot-potato-letters";
export type { PotatoCategory } from "./hot-potato-letters";
export type { PotatoPrompt } from "./hot-potato-prompts/types";

export type Rng = () => number;
export type PotatoFuse = "short" | "normal" | "long";
export type PotatoTaskMode = "mixed" | "letters" | "prompts";

export interface PotatoSetup {
  players: string[];
  lives: number;
  fuse: PotatoFuse;
  tasks: PotatoTaskMode;
}

export const MIN_PLAYERS = 3;
export const LIVES_CHOICES = [1, 2, 3, 4, 5] as const;
export const POTATO_FUSES = ["short", "normal", "long"] as const satisfies readonly PotatoFuse[];
export const POTATO_TASK_MODES = ["mixed", "letters", "prompts"] as const satisfies readonly PotatoTaskMode[];
/** The range each fuse is drawn from, in seconds. */
export const FUSE_SECONDS = {
  short: [10, 30],
  normal: [20, 60],
  long: [40, 90],
} as const satisfies Record<PotatoFuse, readonly [number, number]>;
export const SETUP_STORAGE_KEY = "potato_setup";
export const POTATO_TAP_GUARD_MS = 250;
/** Next on the bang screen works only this long after the bang. */
export const POTATO_NEXT_LOCK_MS = 1500;
/** The bang screen's fill; dark text reads on it. */
export const POTATO_BANG_COLOR = PLAYER_COLORS[0];
/** How long the phone vibrates at the bang. */
export const POTATO_VIBRATE_MS = 600;

export const DEFAULT_SETUP: PotatoSetup = { players: [], lives: 3, fuse: "normal", tasks: "mixed" };

export type SetupError = "tooFewPlayers" | "tooManyPlayers" | "blankName" | "duplicateName" | "lives";

export const SETUP_ERROR_KEYS = {
  tooFewPlayers: "imposterErrTooFew",
  tooManyPlayers: "imposterErrTooMany",
  blankName: "imposterErrBlank",
  duplicateName: "imposterErrDuplicate",
  lives: "potatoErrLives",
} as const satisfies Record<SetupError, string>;

export const SETUP_STEPS = ["players", "rules"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

const ERROR_STEP = {
  tooFewPlayers: "players",
  tooManyPlayers: "players",
  blankName: "players",
  duplicateName: "players",
  lives: "rules",
} as const satisfies Record<SetupError, SetupStep>;

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

const MIN_LIVES = LIVES_CHOICES[0];
const MAX_LIVES = LIVES_CHOICES[LIVES_CHOICES.length - 1];

/** `locale` is the app language's, e.g. "tr-TR": names are compared lowercased with its rules. */
export function validateSetup(setup: PotatoSetup, locale: string): SetupError[] {
  const errors: SetupError[] = [];
  const names = setup.players.map((p) => p.trim());
  if (names.length < MIN_PLAYERS) errors.push("tooFewPlayers");
  if (names.length > MAX_PLAYERS) errors.push("tooManyPlayers");
  if (names.some((n) => n === "")) errors.push("blankName");
  const keys = names.filter((n) => n !== "").map((n) => n.toLocaleLowerCase(locale));
  if (new Set(keys).size !== keys.length) errors.push("duplicateName");
  if (!isIntIn(setup.lives, MIN_LIVES, MAX_LIVES)) errors.push("lives");
  return errors;
}

/** The `validateSetup` errors the given wizard step can fix. */
export function stepErrors(setup: PotatoSetup, step: SetupStep, locale: string): SetupError[] {
  return validateSetup(setup, locale).filter((e) => ERROR_STEP[e] === step);
}

function pick<T>(choices: readonly T[], value: unknown, fallback: T): T {
  return choices.includes(value as T) ? (value as T) : fallback;
}

// Saved settings come from device storage, which may hold an older shape or garbage:
// keep each field only if it is valid on its own.
export function parseSavedSetup(raw: string | null): PotatoSetup {
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
  return {
    players,
    lives: isIntIn(d.lives, MIN_LIVES, MAX_LIVES) ? d.lives : DEFAULT_SETUP.lives,
    fuse: pick<PotatoFuse>(POTATO_FUSES, d.fuse, DEFAULT_SETUP.fuse),
    tasks: pick<PotatoTaskMode>(POTATO_TASK_MODES, d.tasks, DEFAULT_SETUP.tasks),
  };
}

export type PotatoTask =
  | { kind: "letter"; id: string; category: PotatoCategory; letter: string }
  | { kind: "prompt"; id: string; text: string };

/** What one game draws its tasks from, all in one language. */
export interface PotatoPool {
  lang: Lang;
  /** The letters each category may be asked with, one character each. */
  letters: Readonly<Partial<Record<PotatoCategory, string>>>;
  prompts: readonly PotatoPrompt[];
}

export function potatoPool(lang: Lang, prompts: readonly PotatoPrompt[]): PotatoPool {
  return { lang, letters: POTATO_LETTERS[lang], prompts };
}

/** Every letter task of the pool, category by category. */
export function letterTasks(pool: PotatoPool): PotatoTask[] {
  return POTATO_CATEGORIES.flatMap((category) =>
    [...(pool.letters[category] ?? "")].map(
      (letter): PotatoTask => ({ kind: "letter", id: `${pool.lang}:${category}:${letter}`, category, letter })
    )
  );
}

function promptTasks(pool: PotatoPool): PotatoTask[] {
  return pool.prompts.map((p): PotatoTask => ({ kind: "prompt", id: p.id, text: p.text }));
}

function pickIndex(length: number, rng: Rng): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

function kindsFor(pool: PotatoPool, mode: PotatoTaskMode): PotatoTask[][] {
  const kinds = mode === "letters" ? [letterTasks(pool)] : mode === "prompts" ? [promptTasks(pool)] : [letterTasks(pool), promptTasks(pool)];
  return kinds.filter((tasks) => tasks.length > 0);
}

/** A task not in `used`, or null when the mode has no task at all. */
export function pickTask(
  pool: PotatoPool,
  mode: PotatoTaskMode,
  used: readonly string[],
  rng: Rng
): { task: PotatoTask; used: string[] } | null {
  const kinds = kindsFor(pool, mode);
  if (kinds.length === 0) return null;
  // A mixed game draws the kind first, so each kind comes up as often whatever its size.
  const tasks = kinds.length === 1 ? kinds[0] : kinds[pickIndex(kinds.length, rng)];
  let base: readonly string[] = used;
  let available = tasks.filter((task) => !used.includes(task.id));
  if (available.length === 0) {
    // Every task of this kind was used: start it over, but keep the other kind's history.
    const ids = new Set(tasks.map((task) => task.id));
    base = used.filter((id) => !ids.has(id));
    available = tasks;
  }
  const task = available[pickIndex(available.length, rng)];
  return { task, used: [...base, task.id] };
}

/** A round's fuse in ms, drawn from the setup's range. */
export function drawFuse(fuse: PotatoFuse, rng: Rng): number {
  const [min, max] = FUSE_SECONDS[fuse];
  const span = (max - min) * 1000;
  return min * 1000 + Math.min(span, Math.floor(rng() * (span + 1)));
}

/** The first living seat after `from`, going round the table. */
export function nextLiving(lives: readonly number[], from: number): number {
  const n = lives.length;
  for (let k = 1; k <= n; k++) {
    const seat = (from + k) % n;
    if (lives[seat] > 0) return seat;
  }
  return from;
}

export type PotatoPhase = "setup" | "ready" | "playing" | "bang" | "end";

export interface PotatoState {
  phase: PotatoPhase;
  setup: PotatoSetup;
  /** The game's tasks, fixed at start; null before the first start. */
  pool: PotatoPool | null;
  /** By seat; 0 is out. */
  lives: number[];
  /** Ready: who starts the round. Playing and bang: who holds the phone. */
  holder: number;
  task: PotatoTask | null;
  /** Task ids shown so far; kept for Play again and New game. */
  used: string[];
  /** This round's fuse, in ms of on-screen time. */
  fuseMs: number;
  /** On-screen time burnt before `litAt`. */
  burntMs: number;
  /** When the fuse last started burning; null while the game is off screen. */
  litAt: number | null;
  /** When the last bang happened, in ms. */
  bangAt: number;
  /** Seats in the order they went out. */
  outOrder: number[];
  /** When the last accepted tap happened, in ms. */
  lastActionAt: number;
}

/** `at` is the tap's (or, for tick, pause and resume, the clock's) timestamp in ms. */
export type PotatoAction =
  | { type: "start"; setup: PotatoSetup; pool: PotatoPool; rng: Rng; at: number }
  | { type: "light"; rng: Rng; at: number }
  | { type: "pass"; at: number }
  | { type: "tick"; at: number }
  | { type: "pause"; at: number }
  | { type: "resume"; at: number }
  | { type: "next"; at: number }
  | { type: "playAgain"; rng: Rng; at: number }
  | { type: "newGame"; at: number };

export function initialPotatoState(setup: PotatoSetup = DEFAULT_SETUP): PotatoState {
  return {
    phase: "setup",
    setup,
    pool: null,
    lives: [],
    holder: 0,
    task: null,
    used: [],
    fuseMs: 0,
    burntMs: 0,
    litAt: null,
    bangAt: 0,
    outOrder: [],
    lastActionAt: 0,
  };
}

/** The fuse's on-screen time at `at`. */
export function burnt(fuse: Pick<PotatoState, "burntMs" | "litAt">, at: number): number {
  return fuse.burntMs + (fuse.litAt === null ? 0 : Math.max(0, at - fuse.litAt));
}

export type FuseStage = "calm" | "pulse" | "fast";

/** The screen pulses in the last quarter of the fuse, faster in the last tenth. */
export function fuseStage(fuse: Pick<PotatoState, "fuseMs" | "burntMs" | "litAt">, at: number): FuseStage {
  const left = fuse.fuseMs - burnt(fuse, at);
  if (left <= fuse.fuseMs * 0.1) return "fast";
  if (left <= fuse.fuseMs * 0.25) return "pulse";
  return "calm";
}

/** The last player left, once the game has ended. */
export function winner(state: Pick<PotatoState, "phase" | "lives">): number | null {
  if (state.phase !== "end") return null;
  const seat = state.lives.findIndex((l) => l > 0);
  return seat < 0 ? null : seat;
}

// Pass sits under the holder's thumb and the next screen's button sits where the last one
// was, so a double tap would otherwise pass twice or skip a screen.
function tooSoon(state: PotatoState, at: number): boolean {
  const d = at - state.lastActionAt;
  return d >= 0 && d < POTATO_TAP_GUARD_MS;
}

function deal(state: PotatoState, setup: PotatoSetup, pool: PotatoPool, rng: Rng, at: number): PotatoState {
  return {
    ...initialPotatoState(setup),
    phase: "ready",
    pool,
    lives: setup.players.map(() => setup.lives),
    holder: pickIndex(setup.players.length, rng),
    used: state.used,
    lastActionAt: at,
  };
}

function explode(state: PotatoState, at: number): PotatoState {
  const seat = state.holder;
  const lives = state.lives.map((l, i) => (i === seat ? Math.max(0, l - 1) : l));
  return {
    ...state,
    phase: "bang",
    lives,
    burntMs: burnt(state, at),
    litAt: null,
    bangAt: at,
    outOrder: lives[seat] === 0 ? [...state.outOrder, seat] : state.outOrder,
  };
}

function fuseOut(state: PotatoState, at: number): boolean {
  return burnt(state, at) >= state.fuseMs;
}

export function potatoReducer(state: PotatoState, action: PotatoAction): PotatoState {
  switch (action.type) {
    case "start": {
      const { setup, pool } = action;
      if (state.phase !== "setup" || tooSoon(state, action.at)) return state;
      if (validateSetup(setup, localeFor(pool.lang)).length > 0 || kindsFor(pool, setup.tasks).length === 0) return state;
      const trimmed = { ...setup, players: setup.players.map((p) => p.trim()) };
      return deal(state, trimmed, pool, action.rng, action.at);
    }
    case "light": {
      if (state.phase !== "ready" || !state.pool || tooSoon(state, action.at)) return state;
      const picked = pickTask(state.pool, state.setup.tasks, state.used, action.rng);
      if (!picked) return state;
      return {
        ...state,
        phase: "playing",
        task: picked.task,
        used: picked.used,
        fuseMs: drawFuse(state.setup.fuse, action.rng),
        burntMs: 0,
        litAt: action.at,
        lastActionAt: action.at,
      };
    }
    case "pass":
      if (state.phase !== "playing" || tooSoon(state, action.at)) return state;
      // A timer that fires late must not let the holder escape: the pass comes too late.
      if (fuseOut(state, action.at)) return { ...explode(state, action.at), lastActionAt: action.at };
      return { ...state, holder: nextLiving(state.lives, state.holder), lastActionAt: action.at };
    // The clock's actions are not taps: no tap guard, and they leave its time alone.
    case "tick":
      if (state.phase !== "playing" || state.litAt === null || !fuseOut(state, action.at)) return state;
      return explode(state, action.at);
    case "pause":
      if (state.phase !== "playing" || state.litAt === null) return state;
      return { ...state, burntMs: burnt(state, action.at), litAt: null };
    case "resume":
      if (state.phase !== "playing" || state.litAt !== null) return state;
      return { ...state, litAt: action.at };
    case "next": {
      if (state.phase !== "bang" || tooSoon(state, action.at)) return state;
      const sinceBang = action.at - state.bangAt;
      if (sinceBang >= 0 && sinceBang < POTATO_NEXT_LOCK_MS) return state;
      if (state.lives.filter((l) => l > 0).length <= 1) return { ...state, phase: "end", lastActionAt: action.at };
      return {
        ...state,
        phase: "ready",
        holder: nextLiving(state.lives, state.holder),
        task: null,
        lastActionAt: action.at,
      };
    }
    case "playAgain":
      if (state.phase !== "end" || !state.pool || tooSoon(state, action.at)) return state;
      return deal(state, state.setup, state.pool, action.rng, action.at);
    case "newGame":
      if (state.phase !== "end" || tooSoon(state, action.at)) return state;
      // The setup's buttons can sit where New game was: keep the time so they are guarded too.
      return { ...initialPotatoState(state.setup), used: state.used, lastActionAt: action.at };
  }
}

// Animals, food, jobs, places, objects and actions ask for the thing itself; the other
// categories hold too few things per letter, so they ask for any word on the topic.
export const POTATO_TASK_KEYS = {
  animals: "potatoTaskAnimals",
  food: "potatoTaskFood",
  jobs: "potatoTaskJobs",
  places: "potatoTaskPlaces",
  objects: "potatoTaskObjects",
  actions: "potatoTaskActions",
  sports: "potatoTaskSports",
  home: "potatoTaskHome",
  nature: "potatoTaskNature",
  body: "potatoTaskBody",
  transport: "potatoTaskTransport",
  arts: "potatoTaskArts",
} as const satisfies Record<PotatoCategory, string>;

export const FUSE_LABEL_KEYS = {
  short: "potatoFuseShort",
  normal: "potatoFuseNormal",
  long: "potatoFuseLong",
} as const satisfies Record<PotatoFuse, string>;

export const TASK_MODE_KEYS = {
  mixed: { label: "potatoTasksMixed", hint: "potatoTasksMixedHint" },
  letters: { label: "potatoTasksLetters", hint: "potatoTasksLettersHint" },
  prompts: { label: "potatoTasksPrompts", hint: "potatoTasksPromptsHint" },
} as const satisfies Record<PotatoTaskMode, { label: string; hint: string }>;

/** The task as shown, in the game's language whatever the app shows now. */
export function taskText(task: PotatoTask, lang: Lang): string {
  if (task.kind === "prompt") return task.text;
  return fillTemplate(translationsFor(lang)[POTATO_TASK_KEYS[task.category]], { letter: task.letter });
}
