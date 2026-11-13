import type { translationsFor } from "./i18n";
import { MAX_PLAYERS, MAX_TIMER_MINUTES, TAP_GUARD_MS } from "./imposter";

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

/**
 * The living seats in the order the phone visits them: from the first living seat after
 * `after`, the seat that started the night before (-1 before the first night).
 */
export function visitOrder(alive: boolean[], after: number): number[] {
  const n = alive.length;
  if (n === 0) return [];
  const start = (after + 1 + n) % n;
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

export type Phase = "setup" | "rules" | "deal" | "night" | "morning" | "day" | "end";

/**
 * Why a pick does nothing: a wolf chosen by a wolf, oneself, the doctor's last night, or a
 * potion the witch no longer has (or poison for herself).
 */
export type Rejection = "wolf" | "self" | "repeat" | "healUsed" | "poisonUsed" | "poisonSelf";

export const REJECTION_KEYS = {
  wolf: "wolfRejectWolf",
  self: "wolfRejectSelf",
  repeat: "wolfRejectRepeat",
  healUsed: "wolfRejectHealUsed",
  poisonUsed: "wolfRejectPoisonUsed",
  poisonSelf: "wolfRejectPoisonSelf",
} as const satisfies Record<Rejection, string>;

export interface Night extends NightOutcome {
  /** Also the number of the day that follows. */
  number: number;
  /** Pass the phone: the witch lap comes only while a living witch has a potion left. */
  lap: "main" | "witch";
  /** Pass the phone: the living seats in visiting order. */
  order: number[];
  /** Pass the phone: index into `order`. */
  visit: number;
  /** Pass the phone: the held card, the open choice, then the held result. */
  stage: "card" | "choose" | "result";
  /** Pass the phone: why the visitor's pick did nothing, shown on the result card. */
  rejected: Rejection | null;
  /** Pass the phone: whom each seat chose on the main lap. */
  picks: (number | null)[];
  /** Narrator: index into `narratorLines(setup)`. */
  line: number;
  /** The seer's pick. */
  seen: number | null;
}

export interface Removal {
  /** In seat order. */
  removed: number[];
  /** A removed hunter who takes a player with them. */
  hunter: number | null;
  shot: number | null;
}

export interface GameState {
  phase: Phase;
  setup: WolfSetup;
  /** By seat. */
  roles: Role[];
  alive: boolean[];
  /** Deal: whose card it is; `players.length` is the narrator's roster. */
  turn: number;
  /** The card of this deal turn or night visit has been seen. */
  revealed: boolean;
  night: Night | null;
  /** The doctor's pick of the night before, which may not be protected again. */
  lastProtected: number | null;
  /** The witch's potions still unused. */
  potions: { heal: boolean; poison: boolean };
  /** Whom the night or the vote removed, shown in the morning and after the vote. */
  removal: Removal | null;
  dayStep: "talk" | "vote" | "result";
  /** When the day's discussion timer runs out, in ms. */
  dayEndsAt: number;
  winner: Side | null;
  /** When the last accepted move happened, in ms. */
  lastActionAt: number;
}

/** `at` is the tap's timestamp in ms (Date.now()). */
export type GameAction =
  | { type: "start"; setup: WolfSetup; at: number }
  | { type: "deal"; rng: Rng; at: number }
  | { type: "reveal"; at: number }
  | { type: "next"; rng: Rng; at: number }
  /** `target: null` is Nobody, offered on the witch lap only. */
  | { type: "choose"; target: number | null; at: number }
  | { type: "heal"; at: number }
  | { type: "shoot"; target: number; at: number }
  | { type: "vote"; at: number }
  | { type: "talk"; at: number }
  | { type: "voteOut"; target: number | null; at: number }
  | { type: "continue"; at: number }
  | { type: "playAgain"; at: number }
  | { type: "newGame"; at: number };

export function initialGameState(setup: WolfSetup = DEFAULT_SETUP): GameState {
  return {
    phase: "setup",
    setup,
    roles: [],
    alive: [],
    turn: 0,
    revealed: false,
    night: null,
    lastProtected: null,
    potions: { heal: true, poison: true },
    removal: null,
    dayStep: "talk",
    dayEndsAt: 0,
    winner: null,
    lastActionAt: 0,
  };
}

// The buttons that move a turn on sit where the next screen's buttons appear, so a
// double tap would otherwise also press the next one, often for the next player.
function tooSoon(state: GameState, at: number): boolean {
  const d = at - state.lastActionAt;
  return d >= 0 && d < TAP_GUARD_MS;
}

function beginNight(state: GameState, at: number): GameState {
  const number = (state.night?.number ?? 0) + 1;
  return {
    ...state,
    phase: "night",
    night: {
      number,
      lap: "main",
      order: visitOrder(state.alive, state.night ? state.night.order[0] : -1),
      visit: 0,
      stage: "card",
      rejected: null,
      picks: state.roles.map(() => null),
      line: 0,
      victim: null,
      seen: null,
      protect: null,
      heal: false,
      poison: null,
    },
    removal: null,
    revealed: false,
    lastActionAt: at,
  };
}

function dealStep(state: GameState, action: GameAction): GameState {
  if (action.type === "reveal") {
    if (state.revealed) return state;
    return { ...state, revealed: true, lastActionAt: action.at };
  }
  if (action.type !== "next" || !state.revealed) return state;
  const turn = state.turn + 1;
  const n = state.setup.players.length;
  // In narrator mode the phone then goes back to the narrator: one more turn, the roster.
  if (turn < n || (turn === n && state.setup.night === "narrator")) {
    return { ...state, turn, revealed: false, lastActionAt: action.at };
  }
  return beginNight(state, action.at);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (tooSoon(state, action.at)) return state;
  switch (action.type) {
    case "start": {
      if (state.phase !== "setup" || validateSetup(action.setup).length > 0) return state;
      const setup = { ...action.setup, players: action.setup.players.map((p) => p.trim()) };
      return { ...initialGameState(setup), phase: "rules", lastActionAt: action.at };
    }
    case "deal": {
      if (state.phase !== "rules") return state;
      const roles = dealRoles(state.setup, action.rng);
      return { ...initialGameState(state.setup), phase: "deal", roles, alive: roles.map(() => true), lastActionAt: action.at };
    }
    case "playAgain":
      if (state.phase !== "end") return state;
      return { ...initialGameState(state.setup), phase: "rules", lastActionAt: action.at };
    case "newGame":
      // The setup's buttons can sit where this one was: keep the time so they are guarded too.
      return { ...initialGameState(state.setup), lastActionAt: action.at };
  }
  if (state.phase === "deal") return dealStep(state, action);
  if (state.phase === "night") return nightStep(state, action);
  if (state.phase === "morning" || state.phase === "day") return dayStep(state, action);
  return state;
}

// "witch" is the witch's pick on her lap; "poison" the narrator's poison pick for her.
type PickKind = "victim" | "seer" | "doctor" | "guess" | "witch" | "poison";

// The narrator's witch line, with the witch still in the game.
function witchTurn(state: GameState): boolean {
  const seat = state.roles.indexOf("witch");
  if (state.phase !== "night" || !state.night || seat < 0 || !state.alive[seat]) return false;
  return narratorLine(state) === "witch";
}

// What a tap on a player means right now, and whose choice it is.
function picker(state: GameState): { kind: PickKind; seat: number } | null {
  const { night } = state;
  if (state.phase !== "night" || !night) return null;
  if (witchTurn(state)) return state.potions.poison ? { kind: "poison", seat: state.roles.indexOf("witch") } : null;
  if (state.setup.night === "narrator") return narratorPicker(state);
  if (night.stage !== "choose") return null;
  const seat = night.order[night.visit];
  const role = state.roles[seat];
  if (night.lap === "witch") return { kind: role === "witch" ? "witch" : "guess", seat };
  if (role === "wolf") return { kind: "victim", seat };
  if (role === "seer" || role === "doctor") return { kind: role, seat };
  return { kind: "guess", seat };
}

// Why a pick is not allowed, or null when it is: the narrator cannot tap it, and when the phone
// goes round it counts as doing nothing.
function rejectionFor(state: GameState, p: { kind: PickKind; seat: number }, target: number): Rejection | null {
  if (p.kind === "victim") return state.roles[target] === "wolf" ? "wolf" : null;
  if (p.kind === "doctor") return target === state.lastProtected ? "repeat" : null;
  if (p.kind === "guess") return null;
  if (p.kind === "witch") {
    // On her lap the victim is healed and anyone else poisoned: one potion a night.
    if (target === state.night!.victim) return state.potions.heal ? null : "healUsed";
    if (target === p.seat) return "poisonSelf";
    return state.potions.poison ? null : "poisonUsed";
  }
  return target === p.seat ? "self" : null;
}

/** Whether a pick of `target` is taken right now. */
export function canPick(state: GameState, target: number): boolean {
  const p = picker(state);
  if (!p || !state.alive[target]) return false;
  return rejectionFor(state, p, target) === null;
}

export function canHeal(state: GameState): boolean {
  return witchTurn(state) && state.potions.heal && state.night!.victim !== null;
}

/** Whether Next may move the night on. */
export function canGoOn(state: GameState): boolean {
  const { night } = state;
  if (state.phase !== "night" || !night) return false;
  if (state.setup.night === "narrator") return narratorReady(state);
  // The pick itself moves on to the result card.
  if (night.stage === "choose") return false;
  return state.revealed;
}

export type VisitTask = "wolf" | "seer" | "doctor" | "guess" | "witch" | "idle";

/** What the visitor holding the phone does tonight (Pass the phone only). */
export function visitTask(state: GameState): VisitTask | null {
  const { night } = state;
  if (state.phase !== "night" || !night || state.setup.night !== "pass") return null;
  const role = state.roles[night.order[night.visit]];
  if (night.lap === "witch") return role === "witch" ? "witch" : "idle";
  if (role === "wolf" || role === "seer" || role === "doctor") return role;
  return "guess";
}

/** The picks of the wolves who held the phone earlier this night, in visiting order. */
export function wolfPicksSoFar(state: GameState): { wolf: number; target: number }[] {
  const { night } = state;
  if (!night) return [];
  return night.order.slice(0, night.visit).flatMap((seat) => {
    const target = night.picks[seat];
    return state.roles[seat] === "wolf" && target !== null ? [{ wolf: seat, target }] : [];
  });
}

export function livingSeats(state: GameState): number[] {
  return state.alive.flatMap((alive, seat) => (alive ? [seat] : []));
}

/**
 * Every living player, and whether a tap on them counts right now. When the phone goes round
 * every one of them can be tapped, so the choice screen looks the same for every role; a pick
 * the rules do not allow is taken as doing nothing, and the held result card says why.
 */
export function pickOptions(state: GameState): { seat: number; enabled: boolean }[] {
  const pass = state.setup.night === "pass";
  return livingSeats(state).map((seat) => ({ seat, enabled: pass || canPick(state, seat) }));
}

export interface CardText {
  /** The small line above the role. */
  heading: string;
  role: Role;
  lines: string[];
}

// What the held card says: the dealt role, or tonight's task on a visit. Every card has the
// same parts, so no role looks different from across the table.
export function cardText(state: GameState, t: Strings): CardText | null {
  const names = state.setup.players;
  if (state.phase === "deal" && state.turn < names.length) {
    const role = state.roles[state.turn];
    const lines = [t[ROLE_DESC_KEYS[role]]];
    if (role === "wolf") {
      const others = otherWolves(state.roles, state.turn).map((seat) => names[seat]);
      lines.push(others.length > 0 ? t.wolfOtherWolves.replace("{names}", () => others.join(", ")) : t.wolfOnlyWolf);
    }
    return { heading: t.wolfYourRole, role, lines };
  }
  const task = visitTask(state);
  const night = state.night;
  if (!task || !night) return null;
  const role = state.roles[night.order[night.visit]];
  const heading = t.wolfNightN.replace("{n}", String(night.number));
  if (night.stage === "result") return { heading, role, lines: [visitResult(state, t) ?? ""] };
  switch (task) {
    case "wolf": {
      const picks = wolfPicksSoFar(state).map(({ wolf, target }) => `${names[wolf]} → ${names[target]}`);
      const sofar = picks.length > 0 ? [t.wolfPicksSoFar.replace("{picks}", () => picks.join(", "))] : [];
      return { heading, role, lines: [t.wolfTaskWolf, ...sofar] };
    }
    case "seer":
      return { heading, role, lines: [t.wolfTaskSeer] };
    case "doctor": {
      const last = state.lastProtected;
      const rule = last !== null && state.alive[last] ? t.wolfTaskDoctorNot.replace("{name}", () => names[last]) : t.wolfTaskDoctor;
      return { heading, role, lines: [rule] };
    }
    case "guess":
      return { heading, role, lines: [t.wolfTaskGuess] };
    case "idle":
      return { heading, role, lines: [t.wolfNothingThisLap] };
    case "witch": {
      const { heal, poison } = state.potions;
      const left = [heal ? t.wolfPotionHeal : "", poison ? t.wolfPotionPoison : ""].filter(Boolean);
      const potions = t.wolfPotionsLeft.replace("{list}", () => left.join(", "));
      // The last line names exactly the picks rejectionFor lets through. When every wolf wasted
      // their vote there is no one to heal.
      if (night.victim === null) {
        return { heading, role, lines: [t.wolfNoVictim, potions, poison ? t.wolfWitchPoisonAny : t.wolfWitchNothing] };
      }
      const victim = names[night.victim];
      const self = night.victim === night.order[night.visit];
      const poisonOnly = self ? t.wolfWitchPoisonAny : t.wolfWitchPoisonOnly;
      const how = heal && poison ? t.wolfWitchBoth : heal ? t.wolfWitchHealOnly : poisonOnly;
      return {
        heading,
        role,
        lines: [t.wolfTaskWitch.replace("{name}", () => victim), potions, how.replace("{name}", () => victim)],
      };
    }
  }
}

/** What the result card says: why a pick did nothing, the seer's answer, or that it is saved. */
export function visitResult(state: GameState, t: Strings): string | null {
  const task = visitTask(state);
  const night = state.night;
  if (!task || !night || night.stage !== "result") return null;
  const names = state.setup.players;
  if (night.rejected) {
    const last = state.lastProtected === null ? "" : names[state.lastProtected];
    return t[REJECTION_KEYS[night.rejected]].replace("{name}", () => last);
  }
  if (task === "seer" && night.seen !== null) {
    return `${names[night.seen]}: ${state.roles[night.seen] === "wolf" ? t.wolfIsWolf : t.wolfNotWolf}`;
  }
  return t.wolfChoiceSaved;
}

function removalOf(roles: Role[], alive: boolean[], removed: number[]): Removal {
  const hunter = removed.find((seat) => roles[seat] === "hunter");
  // With no wolf left the village has won whomever the hunter takes: no shot is asked for.
  const matters = alive.some((a, seat) => a && roles[seat] === "wolf");
  return { removed, hunter: hunter !== undefined && matters ? hunter : null, shot: null };
}

function toMorning(state: GameState, at: number): GameState {
  const night = state.night!;
  const removed = nightRemovals(night);
  const alive = state.alive.map((a, seat) => a && !removed.includes(seat));
  return {
    ...state,
    phase: "morning",
    alive,
    potions: { heal: state.potions.heal && !night.heal, poison: state.potions.poison && night.poison === null },
    lastProtected: night.protect,
    removal: removalOf(state.roles, alive, removed),
    revealed: false,
    lastActionAt: at,
  };
}

function witchMayAct(state: GameState): boolean {
  const seat = state.roles.indexOf("witch");
  return seat >= 0 && state.alive[seat] && (state.potions.heal || state.potions.poison);
}

function nightNext(state: GameState, rng: Rng, at: number): GameState {
  if (!canGoOn(state)) return state;
  if (state.setup.night === "narrator") return narratorNext(state, at);
  const night = state.night!;
  if (night.stage === "card") return { ...state, night: { ...night, stage: "choose" }, lastActionAt: at };
  if (night.visit + 1 < night.order.length) {
    return {
      ...state,
      night: { ...night, visit: night.visit + 1, stage: "card", rejected: null },
      revealed: false,
      lastActionAt: at,
    };
  }
  if (night.lap === "witch") return toMorning(state, at);
  const decided = { ...state, night: { ...night, victim: wolvesVictim(night.picks, state.roles, rng) } };
  if (!witchMayAct(state)) return toMorning(decided, at);
  return {
    ...decided,
    night: { ...decided.night, lap: "witch", visit: 0, stage: "card", rejected: null },
    revealed: false,
    lastActionAt: at,
  };
}

// A visitor's tap on the open choice screen. Every tap leads to the held result card and then
// to the next visitor, so every visit takes the same steps and taps. A pick the rules do not
// allow is taken as doing nothing: going back to choose again would show the table a role.
function passChoose(state: GameState, target: number | null, at: number): GameState {
  const night = state.night!;
  const p = picker(state);
  if (!p || (target === null ? night.lap !== "witch" : !state.alive[target])) return state;
  const rejected = target === null ? null : rejectionFor(state, p, target);
  let picked = night;
  if (!rejected && night.lap === "main") {
    picked = {
      ...night,
      picks: night.picks.map((pick, seat) => (seat === p.seat ? target : pick)),
      seen: p.kind === "seer" ? target : night.seen,
      protect: p.kind === "doctor" ? target : night.protect,
    };
  } else if (p.kind === "witch") {
    // One potion a night: the victim is healed, anyone else poisoned. Nobody, or a pick her
    // potions cannot do, uses neither. Everyone else's pick on the witch lap changes nothing.
    const heal = !rejected && target !== null && target === night.victim;
    picked = { ...night, heal, poison: !rejected && target !== null && !heal ? target : null };
  }
  return { ...state, night: { ...picked, stage: "result", rejected }, revealed: false, lastActionAt: at };
}

function nightStep(state: GameState, action: GameAction): GameState {
  const night = state.night;
  if (!night) return state;
  switch (action.type) {
    case "reveal":
      if (state.setup.night !== "pass" || night.stage === "choose" || state.revealed) return state;
      return { ...state, revealed: true, lastActionAt: action.at };
    case "choose": {
      if (state.setup.night === "pass") return passChoose(state, action.target, action.at);
      const target = action.target;
      if (target === null || !canPick(state, target)) return state;
      const { kind } = picker(state)!;
      // The narrator's pick moves no turn on, so it does not restart the tap guard: Next right
      // after it counts. A poison pick takes the place of Heal: one potion a night.
      if (kind === "poison") {
        return { ...state, night: { ...night, poison: night.poison === target ? null : target, heal: false } };
      }
      if (kind === "victim") return { ...state, night: { ...night, victim: target } };
      if (kind === "seer") return { ...state, night: { ...night, seen: target } };
      return { ...state, night: { ...night, protect: target } };
    }
    case "heal":
      if (!canHeal(state)) return state;
      return { ...state, night: { ...night, heal: !night.heal, poison: null } };
    case "next":
      return nightNext(state, action.rng, action.at);
  }
  return state;
}

export function narratorLine(state: GameState): NarratorLine | null {
  if (state.phase !== "night" || !state.night || state.setup.night !== "narrator") return null;
  return narratorLines(state.setup)[state.night.line] ?? null;
}

/** The line's role is in the game but removed: it is read anyway, so the table cannot tell. */
export function lineRemoved(state: GameState): boolean {
  const line = narratorLine(state);
  if (line !== "seer" && line !== "doctor" && line !== "witch") return false;
  return !state.alive[state.roles.indexOf(line)];
}

function narratorPicker(state: GameState): { kind: PickKind; seat: number } | null {
  const line = narratorLine(state);
  if (line === "wolves") return { kind: "victim", seat: -1 };
  if ((line === "seer" || line === "doctor") && !lineRemoved(state)) {
    return { kind: line, seat: state.roles.indexOf(line) };
  }
  return null;
}

function narratorReady(state: GameState): boolean {
  const night = state.night!;
  const line = narratorLine(state);
  if (line === "wolves") return night.victim !== null;
  if (lineRemoved(state)) return true;
  if (line === "seer") return night.seen !== null;
  if (line === "doctor") return night.protect !== null;
  return true;
}

function narratorNext(state: GameState, at: number): GameState {
  const night = state.night!;
  if (night.line + 1 < narratorLines(state.setup).length) {
    return { ...state, night: { ...night, line: night.line + 1 }, lastActionAt: at };
  }
  return toMorning(state, at);
}

export function pendingShot(state: GameState): boolean {
  return state.removal !== null && state.removal.hunter !== null && state.removal.shot === null;
}

function dayStep(state: GameState, action: GameAction): GameState {
  // The morning and the vote's result both show a removal, with a hunter's shot if any.
  const showsRemoval = state.phase === "morning" || state.dayStep === "result";
  switch (action.type) {
    case "shoot": {
      if (!showsRemoval || !pendingShot(state) || !state.alive[action.target]) return state;
      const alive = state.alive.map((a, seat) => a && seat !== action.target);
      return { ...state, alive, removal: { ...state.removal!, shot: action.target }, lastActionAt: action.at };
    }
    case "continue": {
      if (!showsRemoval || pendingShot(state)) return state;
      const won = winner(state.roles, state.alive);
      if (won) return { ...state, phase: "end", winner: won, lastActionAt: action.at };
      if (state.phase === "day") return beginNight(state, action.at);
      const dayEndsAt = action.at + state.setup.timerMinutes * 60_000;
      return { ...state, phase: "day", dayStep: "talk", dayEndsAt, lastActionAt: action.at };
    }
    case "vote":
      if (state.phase !== "day" || state.dayStep !== "talk") return state;
      return { ...state, dayStep: "vote", lastActionAt: action.at };
    case "talk":
      if (state.phase !== "day" || state.dayStep !== "vote") return state;
      return { ...state, dayStep: "talk", lastActionAt: action.at };
    case "voteOut": {
      const { target } = action;
      if (state.phase !== "day" || state.dayStep !== "vote") return state;
      if (target !== null && !state.alive[target]) return state;
      const alive = state.alive.map((a, seat) => a && seat !== target);
      const removal = removalOf(state.roles, alive, target === null ? [] : [target]);
      return { ...state, alive, removal, dayStep: "result", lastActionAt: action.at };
    }
  }
  return state;
}
