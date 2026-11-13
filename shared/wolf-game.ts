import type { translationsFor } from "./i18n";
import { MAX_PLAYERS, MAX_TIMER_MINUTES } from "./imposter";

export {
  GAME_THEME,
  MAX_PLAYERS,
  MAX_TIMER_MINUTES,
  TAP_GUARD_MS,
  formatCountdown,
  playerColor,
  remainingSeconds,
} from "./imposter";

type Strings = ReturnType<typeof translationsFor>;
export type Rng = () => number;

export type Role = "wolf" | "villager" | "seer" | "doctor" | "hunter" | "witch";
export type SpecialRole = Exclude<Role, "wolf" | "villager">;
export type NightMode = "pass" | "narrator";
export type Side = "village" | "wolves";

/** Also the order the special roles are listed and dealt in. */
export const SPECIAL_ROLES: readonly SpecialRole[] = ["seer", "doctor", "hunter", "witch"];
export const MIN_PLAYERS = 5;
export const SETUP_STORAGE_KEY = "wolf_setup";
/** The narrator's screens belong to no player: a light grey that dark text reads on. */
export const NARRATOR_COLOR = "#D1D5DB";

export interface WolfSetup {
  players: string[];
  /** null: follow `suggestWolves` for the player count. */
  wolves: number | null;
  specials: SpecialRole[];
  night: NightMode;
  /** 0 means the timer is off. */
  timerMinutes: number;
  /** Show the role of a removed player. */
  showRoles: boolean;
}

export const DEFAULT_SETUP: WolfSetup = {
  players: [],
  wolves: null,
  specials: ["seer", "doctor"],
  night: "pass",
  timerMinutes: 0,
  showRoles: true,
};

export const ROLE_NAME_KEYS = {
  wolf: "wolfRoleWolf",
  villager: "wolfRoleVillager",
  seer: "wolfRoleSeer",
  doctor: "wolfRoleDoctor",
  hunter: "wolfRoleHunter",
  witch: "wolfRoleWitch",
} as const satisfies Record<Role, string>;

export const ROLE_DESC_KEYS = {
  wolf: "wolfDescWolf",
  villager: "wolfDescVillager",
  seer: "wolfDescSeer",
  doctor: "wolfDescDoctor",
  hunter: "wolfDescHunter",
  witch: "wolfDescWitch",
} as const satisfies Record<Role, string>;

export function suggestWolves(playerCount: number): number {
  if (playerCount >= 12) return 3;
  if (playerCount >= 8) return 2;
  return 1;
}

// The wolves must stay fewer than the other players.
export function maxWolves(playerCount: number): number {
  return Math.max(1, Math.floor((playerCount - 1) / 2));
}

export function wolfCount(setup: WolfSetup): number {
  return setup.wolves ?? suggestWolves(setup.players.length);
}

export type SetupError =
  | "tooFewPlayers"
  | "tooManyPlayers"
  | "blankName"
  | "duplicateName"
  | "wolfCount"
  | "tooManyRoles";

export const SETUP_ERROR_KEYS = {
  tooFewPlayers: "wolfErrTooFew",
  tooManyPlayers: "imposterErrTooMany",
  blankName: "imposterErrBlank",
  duplicateName: "imposterErrDuplicate",
  wolfCount: "wolfErrWolves",
  tooManyRoles: "wolfErrRoles",
} as const satisfies Record<SetupError, string>;

export const SETUP_STEPS = ["players", "roles", "rules"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

const ERROR_STEP = {
  tooFewPlayers: "players",
  tooManyPlayers: "players",
  blankName: "players",
  duplicateName: "players",
  wolfCount: "roles",
  tooManyRoles: "roles",
} as const satisfies Record<SetupError, SetupStep>;

export function validateSetup(setup: WolfSetup): SetupError[] {
  const errors: SetupError[] = [];
  const names = setup.players.map((p) => p.trim());
  if (names.length < MIN_PLAYERS) errors.push("tooFewPlayers");
  if (names.length > MAX_PLAYERS) errors.push("tooManyPlayers");
  if (names.some((n) => n === "")) errors.push("blankName");
  const keys = names.filter((n) => n !== "").map((n) => n.toLocaleLowerCase());
  if (new Set(keys).size !== keys.length) errors.push("duplicateName");
  // With too few players the player error already explains it; do not add a second one.
  if (names.length < MIN_PLAYERS) return errors;
  const wolves = wolfCount(setup);
  if (!Number.isInteger(wolves) || wolves < 1 || wolves >= names.length - wolves) errors.push("wolfCount");
  if (wolves + setup.specials.length > names.length) errors.push("tooManyRoles");
  return errors;
}

/** The `validateSetup` errors the given wizard step can fix. */
export function stepErrors(setup: WolfSetup, step: SetupStep): SetupError[] {
  return validateSetup(setup).filter((e) => ERROR_STEP[e] === step);
}

export interface RoleCount {
  role: Role;
  count: number;
}

/** Wolves first, then the special roles in their fixed order, then the villagers. */
export function rolesInPlay(setup: WolfSetup): RoleCount[] {
  const wolves = wolfCount(setup);
  const specials = SPECIAL_ROLES.filter((role) => setup.specials.includes(role));
  const villagers = setup.players.length - wolves - specials.length;
  return [
    { role: "wolf", count: wolves },
    ...specials.map((role): RoleCount => ({ role, count: 1 })),
    ...(villagers > 0 ? [{ role: "villager", count: villagers } as RoleCount] : []),
  ];
}

/** "2 wolves, Seer, Doctor, 5 villagers". */
export function roleSummary(setup: WolfSetup, t: Strings): string {
  return rolesInPlay(setup)
    .map(({ role, count }) => {
      if (role === "wolf") return (count === 1 ? t.wolfSumWolf : t.wolfSumWolves).replace("{n}", String(count));
      if (role === "villager") {
        return (count === 1 ? t.wolfSumVillager : t.wolfSumVillagers).replace("{n}", String(count));
      }
      return t[ROLE_NAME_KEYS[role]];
    })
    .join(", ");
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

// Saved settings come from device storage, which may hold an older shape or garbage:
// keep each field only if it is valid on its own.
export function parseSavedSetup(raw: string | null): WolfSetup {
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
  const saved = d.specials;
  return {
    players,
    wolves: isIntIn(d.wolves, 1, maxWolves(MAX_PLAYERS)) ? d.wolves : null,
    specials: Array.isArray(saved) ? SPECIAL_ROLES.filter((role) => saved.includes(role)) : DEFAULT_SETUP.specials,
    night: d.night === "narrator" ? "narrator" : "pass",
    timerMinutes: isIntIn(d.timerMinutes, 0, MAX_TIMER_MINUTES) ? d.timerMinutes : 0,
    showRoles: d.showRoles !== false,
  };
}

function pickIndex(length: number, rng: Rng): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

/** `result[seat]` is that player's role. */
export function dealRoles(setup: WolfSetup, rng: Rng): Role[] {
  const deck = rolesInPlay(setup).flatMap(({ role, count }) => Array.from({ length: count }, () => role));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = pickIndex(i + 1, rng);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function otherWolves(roles: Role[], seat: number): number[] {
  return roles.flatMap((role, i) => (role === "wolf" && i !== seat ? [i] : []));
}

export function winner(roles: Role[], alive: boolean[]): Side | null {
  const wolves = roles.filter((role, i) => alive[i] && role === "wolf").length;
  const others = roles.filter((role, i) => alive[i] && role !== "wolf").length;
  // In this order, so the village wins when both hold at once.
  if (wolves === 0) return "village";
  if (wolves >= others) return "wolves";
  return null;
}

/** The living seats in the order the phone visits them on night `nightNumber` (from 1). */
export function visitOrder(alive: boolean[], nightNumber: number): number[] {
  const n = alive.length;
  if (n === 0) return [];
  const start = (nightNumber - 1) % n;
  return Array.from({ length: n }, (_, k) => (start + k) % n).filter((seat) => alive[seat]);
}

/** `picks[seat]` is whom that seat chose; only the wolves' picks count. */
export function wolvesVictim(picks: (number | null)[], roles: Role[], rng: Rng): number | null {
  const counts = new Map<number, number>();
  picks.forEach((target, seat) => {
    if (target !== null && roles[seat] === "wolf") counts.set(target, (counts.get(target) ?? 0) + 1);
  });
  if (counts.size === 0) return null;
  const top = Math.max(...counts.values());
  const leaders = [...counts.keys()].filter((target) => counts.get(target) === top).sort((a, b) => a - b);
  return leaders.length === 1 ? leaders[0] : leaders[pickIndex(leaders.length, rng)];
}

export interface NightOutcome {
  victim: number | null;
  /** The doctor's pick. */
  protect: number | null;
  /** The witch used the healing potion on the victim. */
  heal: boolean;
  poison: number | null;
}

/** Who leaves the game in the morning, in seat order. */
export function nightRemovals(night: NightOutcome): number[] {
  const removed = new Set<number>();
  // The doctor and the healing potion stop only the wolves; the poison cannot be stopped.
  if (night.victim !== null && night.victim !== night.protect && !night.heal) removed.add(night.victim);
  if (night.poison !== null) removed.add(night.poison);
  return [...removed].sort((a, b) => a - b);
}

export type NarratorLine = "sleep" | "wolves" | "seer" | "doctor" | "witch" | "wake";

export const NARRATOR_LINE_KEYS = {
  sleep: "wolfLineSleep",
  wolves: "wolfLineWolves",
  seer: "wolfLineSeer",
  doctor: "wolfLineDoctor",
  witch: "wolfLineWitch",
  wake: "wolfLineWake",
} as const satisfies Record<NarratorLine, string>;

// The hunter acts only when removed, so it has no line.
export function narratorLines(setup: WolfSetup): NarratorLine[] {
  const called = (["seer", "doctor", "witch"] as const).filter((role) => setup.specials.includes(role));
  return ["sleep", "wolves", ...called, "wake"];
}
