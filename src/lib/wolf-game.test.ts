import { describe, it, expect } from "vitest";
import { translationsFor } from "@/lib/i18n";
import * as W from "@/lib/wolf-game";

type WolfSetup = W.WolfSetup;

const NAMES = ["Ann", "Bob", "Cem", "Dan", "Eda", "Fay", "Gil", "Hal", "Ivy", "Jon", "Kim", "Lea"];
const players = (n: number) => NAMES.slice(0, n);
const setup = (over: Partial<WolfSetup> = {}): WolfSetup => ({ ...W.DEFAULT_SETUP, players: players(5), ...over });
const en = translationsFor("en");
const tr = translationsFor("tr");

describe("wolf suggestion", () => {
  it("suggests 1 wolf for 5 to 7 players, 2 for 8 to 11 and 3 for 12", () => {
    expect([5, 6, 7, 8, 11, 12].map(W.suggestWolves)).toEqual([1, 1, 1, 2, 2, 3]);
  });

  it("follows the player count until the wolves are set by hand", () => {
    expect(W.wolfCount(setup({ players: players(8) }))).toBe(2);
    expect(W.wolfCount(setup({ players: players(12) }))).toBe(3);
    expect(W.wolfCount(setup({ players: players(12), wolves: 1 }))).toBe(1);
  });

  it("keeps the wolves fewer than the other players", () => {
    expect([5, 6, 7, 12].map(W.maxWolves)).toEqual([2, 2, 3, 5]);
  });
});

describe("validateSetup", () => {
  it("accepts 5 to 12 named players", () => {
    expect(W.validateSetup(setup())).toEqual([]);
    expect(W.validateSetup(setup({ players: players(12) }))).toEqual([]);
  });

  it("reports only the player error below 5 players", () => {
    expect(W.validateSetup(setup({ players: players(4), wolves: 3, specials: [...W.SPECIAL_ROLES] }))).toEqual([
      "tooFewPlayers",
    ]);
  });

  it("reports too many, blank and repeated names", () => {
    expect(W.validateSetup(setup({ players: [...players(12), "Max"] }))).toContain("tooManyPlayers");
    expect(W.validateSetup(setup({ players: ["Ann", " ", "Cem", "Dan", "Eda"] }))).toEqual(["blankName"]);
    expect(W.validateSetup(setup({ players: ["Ann", "ann ", "Cem", "Dan", "Eda"] }))).toEqual(["duplicateName"]);
  });

  it("needs at least one wolf and fewer wolves than other players", () => {
    expect(W.validateSetup(setup({ wolves: 0 }))).toEqual(["wolfCount"]);
    expect(W.validateSetup(setup({ wolves: 2, specials: [] }))).toEqual([]);
    expect(W.validateSetup(setup({ wolves: 3, specials: [] }))).toEqual(["wolfCount"]);
    expect(W.validateSetup(setup({ players: players(6), wolves: 3, specials: [] }))).toEqual(["wolfCount"]);
  });

  it("allows wolves and special roles up to the player count", () => {
    expect(W.validateSetup(setup({ wolves: 1, specials: [...W.SPECIAL_ROLES] }))).toEqual([]);
    expect(W.validateSetup(setup({ wolves: 2, specials: [...W.SPECIAL_ROLES] }))).toEqual(["tooManyRoles"]);
  });

  it("sends each error to the step that can fix it", () => {
    const bad = setup({ players: ["Ann", "", "Cem", "Dan", "Eda"], wolves: 2, specials: [...W.SPECIAL_ROLES] });
    expect(W.stepErrors(bad, "players")).toEqual(["blankName"]);
    expect(W.stepErrors(bad, "roles")).toEqual(["tooManyRoles"]);
    expect(W.stepErrors(bad, "rules")).toEqual([]);
  });

  it("has a message for every error in both languages", () => {
    for (const key of Object.values(W.SETUP_ERROR_KEYS)) {
      expect(en[key]).toBeTruthy();
      expect(tr[key]).toBeTruthy();
    }
  });
});

describe("roles in play", () => {
  it("lists the wolves first, then the special roles in a fixed order, then the villagers", () => {
    expect(W.rolesInPlay(setup({ players: players(9), specials: ["witch", "seer"] }))).toEqual([
      { role: "wolf", count: 2 },
      { role: "seer", count: 1 },
      { role: "witch", count: 1 },
      { role: "villager", count: 5 },
    ]);
  });

  it("leaves the villagers out when the special roles fill the table", () => {
    expect(W.rolesInPlay(setup({ wolves: 1, specials: [...W.SPECIAL_ROLES] })).map((r) => r.role)).toEqual([
      "wolf",
      "seer",
      "doctor",
      "hunter",
      "witch",
    ]);
  });

  it("sums the roles up in one line", () => {
    expect(W.roleSummary(setup({ players: players(9) }), en)).toBe("2 wolves, Seer, Doctor, 5 villagers");
    expect(W.roleSummary(setup({ players: players(6), wolves: 1, specials: [...W.SPECIAL_ROLES] }), en)).toBe(
      "1 wolf, Seer, Doctor, Hunter, Witch, 1 villager"
    );
    expect(W.roleSummary(setup({ players: players(9) }), tr)).toBe("2 kurt, Kâhin, Doktor, 5 köylü");
  });

  it("has a name and a description for every role in both languages", () => {
    for (const keys of [W.ROLE_NAME_KEYS, W.ROLE_DESC_KEYS]) {
      for (const key of Object.values(keys)) {
        expect(en[key]).toBeTruthy();
        expect(tr[key]).toBeTruthy();
      }
    }
    expect(tr.wolfTitle).toBe("Kurt Gecesi");
    expect(en.wolfTitle).toBe("Wolf Night");
  });
});

describe("parseSavedSetup", () => {
  it("falls back to the defaults for nothing or garbage", () => {
    for (const raw of [null, "", "{", "[]", "42"]) expect(W.parseSavedSetup(raw)).toEqual(W.DEFAULT_SETUP);
  });

  it("reads back a saved setup", () => {
    const saved = setup({
      players: players(8),
      wolves: 3,
      specials: ["hunter", "witch"],
      night: "narrator",
      timerMinutes: 4,
      showRoles: false,
    });
    expect(W.parseSavedSetup(JSON.stringify(saved))).toEqual(saved);
  });

  it("keeps each field only when it is valid on its own", () => {
    const raw = { players: ["Ann", 7, "Bob"], wolves: 9, specials: ["witch", "king", "seer"], night: "moon", timerMinutes: 11, showRoles: "no" };
    expect(W.parseSavedSetup(JSON.stringify(raw))).toEqual({
      players: ["Ann", "Bob"],
      wolves: null,
      specials: ["seer", "witch"],
      night: "pass",
      timerMinutes: 0,
      showRoles: true,
    });
  });

  it("keeps the defaults' special roles when none were saved", () => {
    expect(W.parseSavedSetup(JSON.stringify({ players: ["Ann"] })).specials).toEqual(W.DEFAULT_SETUP.specials);
  });
});

type Role = W.Role;
const zero = () => 0;

describe("dealRoles", () => {
  const count = (roles: Role[], role: Role) => roles.filter((r) => r === role).length;

  it("deals every role in play, as many times as it is counted", () => {
    const s = setup({ players: players(9), specials: [...W.SPECIAL_ROLES] });
    for (const rng of [zero, () => 0.999, Math.random]) {
      const roles = W.dealRoles(s, rng);
      expect(roles).toHaveLength(9);
      expect(count(roles, "wolf")).toBe(2);
      for (const special of W.SPECIAL_ROLES) expect(count(roles, special)).toBe(1);
      expect(count(roles, "villager")).toBe(3);
    }
  });

  it("seats the roles by the random numbers it is given", () => {
    expect(W.dealRoles(setup(), zero)).toEqual(["seer", "doctor", "villager", "villager", "wolf"]);
    expect(W.dealRoles(setup(), () => 0.999)).toEqual(["wolf", "seer", "doctor", "villager", "villager"]);
  });

  it("tells each wolf who the other wolves are", () => {
    const roles: Role[] = ["wolf", "villager", "wolf", "seer", "wolf"];
    expect(W.otherWolves(roles, 0)).toEqual([2, 4]);
    expect(W.otherWolves(roles, 2)).toEqual([0, 4]);
    expect(W.otherWolves(["wolf", "villager"], 0)).toEqual([]);
  });
});

describe("winner", () => {
  const roles: Role[] = ["wolf", "villager", "seer", "wolf", "villager"];

  it("lets the game go on while the wolves are fewer than the others", () => {
    expect(W.winner(roles, [true, true, true, true, true])).toBeNull();
  });

  it("gives the village the win when no wolf is left", () => {
    expect(W.winner(roles, [false, true, false, false, true])).toBe("village");
  });

  it("gives the wolves the win when they are as many as the others or more", () => {
    expect(W.winner(roles, [true, true, false, true, false])).toBe("wolves");
    expect(W.winner(roles, [true, true, false, false, false])).toBe("wolves");
  });

  it("gives the village the win when the last wolf and the last villagers fall together", () => {
    expect(W.winner(roles, [false, false, false, false, false])).toBe("village");
  });
});

describe("visitOrder", () => {
  it("visits the living players in seat order, starting one seat later each night", () => {
    const all = [true, true, true, true, true];
    expect(W.visitOrder(all, 1)).toEqual([0, 1, 2, 3, 4]);
    expect(W.visitOrder(all, 2)).toEqual([1, 2, 3, 4, 0]);
    expect(W.visitOrder(all, 7)).toEqual([1, 2, 3, 4, 0]);
    expect(W.visitOrder([true, false, true, true, false], 2)).toEqual([2, 3, 0]);
  });
});

describe("night resolution", () => {
  const roles: Role[] = ["wolf", "wolf", "wolf", "villager", "villager", "seer"];

  it("takes the player most wolves chose", () => {
    expect(W.wolvesVictim([4, 3, 4, null, null, null], roles, zero)).toBe(4);
  });

  it("settles a wolf tie at random and counts only the wolves' picks", () => {
    const picks = [3, 4, 5, 0, 0, 0];
    expect(W.wolvesVictim(picks, roles, zero)).toBe(3);
    expect(W.wolvesVictim(picks, roles, () => 0.5)).toBe(4);
    expect(W.wolvesVictim(picks, roles, () => 0.99)).toBe(5);
  });

  it("removes the victim unless the doctor protects or the witch heals them", () => {
    expect(W.nightRemovals({ victim: 3, protect: null, heal: false, poison: null })).toEqual([3]);
    expect(W.nightRemovals({ victim: 3, protect: 3, heal: false, poison: null })).toEqual([]);
    expect(W.nightRemovals({ victim: 3, protect: 4, heal: true, poison: null })).toEqual([]);
  });

  it("cannot stop the poison", () => {
    expect(W.nightRemovals({ victim: 3, protect: 3, heal: false, poison: 1 })).toEqual([1]);
    expect(W.nightRemovals({ victim: 3, protect: null, heal: true, poison: 3 })).toEqual([3]);
  });

  it("lists the victim and the poisoned player in seat order", () => {
    expect(W.nightRemovals({ victim: 4, protect: null, heal: false, poison: 1 })).toEqual([1, 4]);
  });
});

describe("narratorLines", () => {
  it("calls only the roles in the game, and the hunter has no line", () => {
    expect(W.narratorLines(setup({ specials: [...W.SPECIAL_ROLES] }))).toEqual([
      "sleep",
      "wolves",
      "seer",
      "doctor",
      "witch",
      "wake",
    ]);
    expect(W.narratorLines(setup({ specials: ["hunter"] }))).toEqual(["sleep", "wolves", "wake"]);
  });

  it("has a translated text for every line", () => {
    for (const key of Object.values(W.NARRATOR_LINE_KEYS)) {
      expect(en[key]).toBeTruthy();
      expect(tr[key]).toBeTruthy();
    }
  });
});

type GameState = W.GameState;
type Act = { [K in W.GameAction["type"]]: Omit<Extract<W.GameAction, { type: K }>, "at"> }[W.GameAction["type"]];

let clock = 1_800_000_000_000;
// Applies one action a second after the last one, well outside the tap guard.
function step(state: GameState, action: Act): GameState {
  clock += 1000;
  return W.gameReducer(state, { ...action, at: clock } as W.GameAction);
}

// A game whose cards were dealt as `roles`, seat by seat.
function dealt(roles: Role[], over: Partial<WolfSetup> = {}): GameState {
  const s = setup({
    players: players(roles.length),
    wolves: roles.filter((r) => r === "wolf").length,
    specials: W.SPECIAL_ROLES.filter((r) => roles.includes(r)),
    ...over,
  });
  return { ...W.initialGameState(s), phase: "deal", roles, alive: roles.map(() => true) };
}

// Every player sees their card (and the narrator the roster) until the first night.
function dealAll(state: GameState): GameState {
  let s = state;
  while (s.phase === "deal") s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
  return s;
}

const night1 = (roles: Role[], over: Partial<WolfSetup> = {}) => dealAll(dealt(roles, over));
// Ann villager, Bob wolf, Cem seer, Dan doctor, Eda villager.
const basic: Role[] = ["villager", "wolf", "seer", "doctor", "villager"];

describe("before the night", () => {
  it("shows the This game screen after the setup and deals only from there", () => {
    let s = step(W.initialGameState(), { type: "start", setup: setup({ players: [" Ann", "Bob ", "Cem", "Dan", "Eda"] }) });
    expect(s.phase).toBe("rules");
    expect(s.setup.players).toEqual(players(5));
    expect(s.roles).toEqual([]);
    s = step(s, { type: "deal", rng: zero });
    expect(s.phase).toBe("deal");
    expect(s.roles).toEqual(["seer", "doctor", "villager", "villager", "wolf"]);
    expect(s.alive).toEqual([true, true, true, true, true]);
    expect([s.turn, s.revealed]).toEqual([0, false]);
  });

  it("does not start from an invalid setup", () => {
    expect(step(W.initialGameState(), { type: "start", setup: setup({ players: players(4) }) }).phase).toBe("setup");
  });

  it("passes the phone on only after the card was seen", () => {
    let s = step(dealt(basic), { type: "next", rng: zero });
    expect(s.turn).toBe(0);
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect([s.turn, s.revealed]).toEqual([1, false]);
  });

  it("starts the first night after the last card when the phone goes round", () => {
    const s = night1(basic);
    expect(s.phase).toBe("night");
    expect(s.night).toMatchObject({ number: 1, lap: "main", order: [0, 1, 2, 3, 4], visit: 0, stage: "card" });
    expect(s.revealed).toBe(false);
  });

  it("gives the phone to the narrator after the last card in narrator mode", () => {
    let s = dealt(basic, { night: "narrator" });
    for (let i = 0; i < 5; i++) s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect([s.phase, s.turn, s.revealed]).toEqual(["deal", 5, false]);
    s = step(s, { type: "next", rng: zero });
    expect(s.phase).toBe("deal");
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect(s.phase).toBe("night");
    expect(s.night?.line).toBe(0);
  });

  it("goes back to the setup with the same settings on New game", () => {
    const s = step(dealt(basic), { type: "newGame" });
    expect(s).toMatchObject({ phase: "setup", roles: [], night: null });
    expect(s.setup).toEqual(dealt(basic).setup);
  });

  it("deals again only from the This game screen after Play again", () => {
    const over: GameState = { ...dealt(basic), phase: "end", winner: "village" };
    expect(step(over, { type: "deal", rng: zero }).phase).toBe("end");
    const again = step(over, { type: "playAgain" });
    expect(again).toMatchObject({ phase: "rules", roles: [], alive: [], night: null, winner: null });
    expect(again.potions).toEqual({ heal: true, poison: true });
    expect(again.setup).toEqual(over.setup);
  });
});

describe("tap guard", () => {
  it("ignores a tap that comes too soon after the last accepted one", () => {
    const shown = W.gameReducer(dealt(basic), { type: "reveal", at: 10_000 });
    expect(W.gameReducer(shown, { type: "next", rng: zero, at: 10_000 + W.TAP_GUARD_MS - 1 }).turn).toBe(0);
    expect(W.gameReducer(shown, { type: "next", rng: zero, at: 10_000 + W.TAP_GUARD_MS }).turn).toBe(1);
  });

  it("does not let a second reveal restart the guard", () => {
    const shown = W.gameReducer(dealt(basic), { type: "reveal", at: 10_000 });
    expect(W.gameReducer(shown, { type: "reveal", at: 10_500 }).lastActionAt).toBe(10_000);
  });
});

interface PassChoices {
  picks?: Record<number, number>;
  heal?: boolean;
  poison?: number;
  rng?: W.Rng;
}

const firstPick = (s: GameState) => s.alive.findIndex((_, i) => W.canPick(s, i));
const pickable = (s: GameState) => s.alive.flatMap((_, i) => (W.canPick(s, i) ? [i] : []));

// One visit: the visitor holds the card, goes on, picks (the given target or the first one
// allowed; on the witch lap the witch heals and poisons as told) and passes the phone on.
function visitOnce(state: GameState, c: PassChoices = {}): GameState {
  const rng = c.rng ?? zero;
  const { lap, order, visit } = state.night!;
  const seat = order[visit];
  let s = step(step(state, { type: "reveal" }), { type: "next", rng });
  if (s.phase !== "night" || s.night!.stage !== "choose") return s;
  if (lap === "main" && s.night!.picks[seat] === null) {
    s = step(s, { type: "choose", target: c.picks?.[seat] ?? firstPick(s) });
  }
  if (lap === "witch" && c.heal) s = step(s, { type: "heal" });
  if (lap === "witch" && c.poison !== undefined) s = step(s, { type: "choose", target: c.poison });
  return step(s, { type: "next", rng });
}

function mainLap(state: GameState, c: PassChoices = {}): GameState {
  let s = state;
  for (let guard = 0; s.phase === "night" && s.night!.lap === "main"; guard++) {
    if (guard > 20) throw new Error("the main lap did not end");
    s = visitOnce(s, c);
  }
  return s;
}

function passNight(state: GameState, c: PassChoices = {}): GameState {
  let s = state;
  for (let guard = 0; s.phase === "night"; guard++) {
    if (guard > 40) throw new Error("the night did not end");
    s = visitOnce(s, c);
  }
  return s;
}

// Moves the phone on until `seat` holds it, on the choice screen.
function choosingAt(state: GameState, seat: number): GameState {
  let s = state;
  for (let guard = 0; s.night!.order[s.night!.visit] !== seat || s.night!.stage !== "choose"; guard++) {
    if (guard > 40) throw new Error(`seat ${seat} never got the phone`);
    s = s.night!.stage === "card" ? step(step(s, { type: "reveal" }), { type: "next", rng: zero }) : visitOnce(s);
  }
  return s;
}

describe("night: the phone goes round", () => {
  it("opens the choice only after the card was held", () => {
    let s = night1(basic);
    expect(W.visitTask(s)).toBe("guess");
    expect(W.canPick(s, 1)).toBe(false);
    s = step(s, { type: "next", rng: zero });
    expect(s.night?.stage).toBe("card");
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect(s.night?.stage).toBe("choose");
    expect(W.canPick(s, 1)).toBe(true);
  });

  it("needs a pick from every player before the phone moves on", () => {
    let s = choosingAt(night1(basic), 0);
    expect(W.canGoOn(s)).toBe(false);
    s = step(s, { type: "next", rng: zero });
    expect(s.night?.visit).toBe(0);
    s = step(s, { type: "choose", target: 2 });
    expect(W.canGoOn(s)).toBe(true);
    s = step(s, { type: "next", rng: zero });
    expect(s.night).toMatchObject({ visit: 1, stage: "card" });
    expect(s.revealed).toBe(false);
  });

  it("lets the wolves pick only non-wolves, the seer anyone but themselves and the doctor anyone", () => {
    let s = choosingAt(night1(["villager", "wolf", "seer", "doctor", "wolf", "villager", "villager"]), 1);
    expect([W.visitTask(s), pickable(s)]).toEqual(["wolf", [0, 2, 3, 5, 6]]);
    s = choosingAt(s, 2);
    expect([W.visitTask(s), pickable(s)]).toEqual(["seer", [0, 1, 3, 4, 5, 6]]);
    s = choosingAt(s, 3);
    expect([W.visitTask(s), pickable(s)]).toEqual(["doctor", [0, 1, 2, 3, 4, 5, 6]]);
    s = choosingAt(s, 5);
    expect([W.visitTask(s), pickable(s)]).toEqual(["guess", [0, 1, 2, 3, 4, 6]]);
  });

  it("does not let the doctor protect last night's player again", () => {
    let s = choosingAt({ ...night1(basic), lastProtected: 4 }, 3);
    expect(W.canPick(s, 4)).toBe(false);
    s = step(s, { type: "choose", target: 4 });
    expect(s.night?.protect).toBeNull();
    s = step(s, { type: "choose", target: 3 });
    expect(s.night?.protect).toBe(3);
  });

  it("shows a wolf the earlier wolves' picks of this night", () => {
    let s = choosingAt(night1(["villager", "wolf", "seer", "wolf", "villager", "villager", "villager"]), 1);
    expect(W.wolfPicksSoFar(s)).toEqual([]);
    s = choosingAt(step(s, { type: "choose", target: 5 }), 3);
    expect(W.wolfPicksSoFar(s)).toEqual([{ wolf: 1, target: 5 }]);
  });

  it("tells the seer at once and keeps the first pick", () => {
    let s = step(choosingAt(night1(basic), 2), { type: "choose", target: 1 });
    expect(s.night?.seen).toBe(1);
    expect(W.visitResult(s, en)).toBe("Bob: Wolf");
    s = step(s, { type: "choose", target: 0 });
    expect(s.night?.seen).toBe(1);
    expect(pickable(s)).toEqual([]);
  });

  it("removes the wolves' victim in the morning and remembers the doctor's pick", () => {
    const s = passNight(night1(basic), { picks: { 1: 4, 3: 0 } });
    expect(s.phase).toBe("morning");
    expect(s.removal).toEqual({ removed: [4], hunter: null, shot: null });
    expect(s.alive).toEqual([true, true, true, true, false]);
    expect(s.lastProtected).toBe(0);
  });

  it("takes the victim most wolves chose and settles a tie at random", () => {
    const roles: Role[] = ["wolf", "wolf", "villager", "villager", "villager", "seer", "villager"];
    expect(passNight(night1(roles), { picks: { 0: 3, 1: 3 } }).removal?.removed).toEqual([3]);
    expect(passNight(night1(roles), { picks: { 0: 2, 1: 3 } }).removal?.removed).toEqual([2]);
    expect(passNight(night1(roles), { picks: { 0: 2, 1: 3 }, rng: () => 0.9 }).removal?.removed).toEqual([3]);
  });

  it("lets the doctor save the victim", () => {
    expect(passNight(night1(basic), { picks: { 1: 4, 3: 4 } }).removal?.removed).toEqual([]);
  });

  it("does not let a pick restart the tap guard", () => {
    let s = W.gameReducer(night1(basic), { type: "reveal", at: 20_000 });
    s = W.gameReducer(s, { type: "next", rng: zero, at: 21_000 });
    expect(W.gameReducer(s, { type: "choose", target: 1, at: 21_000 + W.TAP_GUARD_MS - 1 }).night?.picks[0]).toBeNull();
    s = W.gameReducer(s, { type: "choose", target: 1, at: 21_500 });
    expect(s.night?.picks[0]).toBe(1);
    s = W.gameReducer(s, { type: "next", rng: zero, at: 21_600 });
    expect(s.night?.visit).toBe(1);
  });
});

describe("night: the witch lap", () => {
  // Ann wolf, Bob seer, Cem witch, then three villagers.
  const witchRoles: Role[] = ["wolf", "seer", "witch", "villager", "villager", "villager"];

  it("goes round once more for a living witch with a potion, who sees the victim", () => {
    const s = mainLap(night1(witchRoles), { picks: { 0: 4 } });
    expect(s.phase).toBe("night");
    expect(s.night).toMatchObject({ lap: "witch", order: [0, 1, 2, 3, 4, 5], visit: 0, stage: "card", victim: 4 });
  });

  it("lets everyone but the witch pass the phone on from the card", () => {
    let s = mainLap(night1(witchRoles), { picks: { 0: 4 } });
    expect(W.visitTask(s)).toBe("idle");
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect(s.night).toMatchObject({ lap: "witch", visit: 1, stage: "card" });
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect(W.visitTask(s)).toBe("witch");
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect(s.night?.stage).toBe("choose");
    expect(W.canGoOn(s)).toBe(true);
  });

  it("heals the victim, and the healing potion is then used up", () => {
    const s = passNight(night1(witchRoles), { picks: { 0: 4 }, heal: true });
    expect(s.removal?.removed).toEqual([]);
    expect(s.potions).toEqual({ heal: false, poison: true });
  });

  it("removes the poisoned player, and both potions work on the same night", () => {
    const s = passNight(night1(witchRoles), { picks: { 0: 4 }, heal: true, poison: 3 });
    expect(s.removal?.removed).toEqual([3]);
    expect(s.potions).toEqual({ heal: false, poison: false });
  });

  it("lets the witch heal herself but not poison herself", () => {
    let s = choosingAt(mainLap(night1(witchRoles), { picks: { 0: 2 } }), 2);
    expect(W.canHeal(s)).toBe(true);
    expect(W.canPick(s, 2)).toBe(false);
    s = passNight(step(s, { type: "heal" }));
    expect(s.removal?.removed).toEqual([]);
  });

  it("still comes with only the poison left", () => {
    expect(mainLap({ ...night1(witchRoles), potions: { heal: false, poison: true } }).night?.lap).toBe("witch");
  });

  it("does not come once both potions are used or when the witch is out", () => {
    expect(mainLap({ ...night1(witchRoles), potions: { heal: false, poison: false } }).phase).toBe("morning");
    expect(mainLap(dealAll({ ...dealt(witchRoles), alive: [true, true, false, true, true, true] })).phase).toBe("morning");
  });
});

describe("card texts", () => {
  it("shows the dealt role, and the other wolves to a wolf", () => {
    const s = dealt(["wolf", "villager", "wolf", "seer", "villager"]);
    expect(W.cardText(s, en)).toEqual({ heading: "Your role", role: "wolf", lines: [en.wolfDescWolf, "Other wolves: Cem"] });
    expect(W.cardText({ ...s, turn: 3 }, en)).toEqual({ heading: "Your role", role: "seer", lines: [en.wolfDescSeer] });
    expect(W.cardText({ ...dealt(basic), turn: 1 }, en)?.lines).toEqual([en.wolfDescWolf, "You are the only wolf."]);
  });

  it("shows each visitor's task", () => {
    const roles: Role[] = ["villager", "wolf", "seer", "doctor", "wolf", "villager", "villager"];
    const s = night1(roles);
    expect(W.cardText(s, en)).toEqual({ heading: "Night 1", role: "villager", lines: [en.wolfTaskGuess] });
    const first = choosingAt(s, 1);
    expect(W.cardText(first, en)?.lines).toEqual([en.wolfTaskWolf]);
    const second = choosingAt(step(first, { type: "choose", target: 6 }), 4);
    expect(W.cardText(second, en)?.lines).toEqual([en.wolfTaskWolf, "Chosen so far tonight: Bob → Gil"]);
    expect(W.cardText(choosingAt(s, 2), en)?.lines).toEqual([en.wolfTaskSeer]);
    expect(W.cardText(choosingAt(s, 3), en)?.lines).toEqual([en.wolfTaskDoctor]);
  });

  it("shows the witch the victim and her potions, and everyone else that this lap has nothing", () => {
    let s = mainLap(night1(["wolf", "seer", "witch", "villager", "villager", "villager"]), { picks: { 0: 4 } });
    expect(W.cardText(s, en)?.lines).toEqual([en.wolfNothingThisLap]);
    s = choosingAt(s, 2);
    expect(W.cardText(s, en)?.lines).toEqual(["The wolves chose Eda.", "Potions left: healing, poison"]);
  });

  it("shows a visitor's own pick under the choice", () => {
    expect(W.visitResult(choosingAt(night1(basic), 0), en)).toBeNull();
    expect(W.visitResult(step(choosingAt(night1(basic), 0), { type: "choose", target: 2 }), en)).toBe("Chosen: Cem");
  });
});
