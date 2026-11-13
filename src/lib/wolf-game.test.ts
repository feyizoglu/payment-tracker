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
  it("visits the living players in seat order, from the first living seat after the last start", () => {
    const all = [true, true, true, true, true];
    expect(W.visitOrder(all, -1)).toEqual([0, 1, 2, 3, 4]);
    expect(W.visitOrder(all, 0)).toEqual([1, 2, 3, 4, 0]);
    expect(W.visitOrder(all, 4)).toEqual([0, 1, 2, 3, 4]);
    expect(W.visitOrder([true, false, true, true, false], 0)).toEqual([2, 3, 0]);
  });

  it("never lets one player start two nights running when a seat is out", () => {
    const alive = [true, false, true, true, true, true];
    const starts: number[] = [];
    let last = -1;
    for (let night = 0; night < 6; night++) {
      last = W.visitOrder(alive, last)[0];
      starts.push(last);
    }
    expect(starts).toEqual([0, 2, 3, 4, 5, 0]);
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
  /** The witch's pick on the witch lap: the victim heals, anyone else is poisoned, null is Nobody. */
  witch?: number | null;
  rng?: W.Rng;
}

const firstPick = (s: GameState) => s.alive.findIndex((_, i) => W.canPick(s, i));
const pickable = (s: GameState) => s.alive.flatMap((_, i) => (W.canPick(s, i) ? [i] : []));

// One visit: the visitor holds the card, goes on, picks, holds the result card and passes the
// phone on. On the main lap the pick is the given target or the first one that is taken; on the
// witch lap the witch picks as told and everyone else picks Nobody.
function visitOnce(state: GameState, c: PassChoices = {}): GameState {
  const rng = c.rng ?? zero;
  const { lap, order, visit } = state.night!;
  const seat = order[visit];
  let s = step(step(state, { type: "reveal" }), { type: "next", rng });
  if (s.phase !== "night" || s.night!.stage !== "choose") return s;
  const witch = s.roles[seat] === "witch" ? (c.witch ?? null) : null;
  s = step(s, { type: "choose", target: lap === "main" ? (c.picks?.[seat] ?? firstPick(s)) : witch });
  return step(step(s, { type: "reveal" }), { type: "next", rng });
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
    s = s.night!.stage === "choose" ? visitOnce(s) : step(step(s, { type: "reveal" }), { type: "next", rng: zero });
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

  it("moves on only after the pick's result card was held", () => {
    let s = choosingAt(night1(basic), 0);
    expect(W.canGoOn(s)).toBe(false);
    s = step(s, { type: "next", rng: zero });
    expect(s.night?.stage).toBe("choose");
    s = step(s, { type: "choose", target: 2 });
    expect([s.night?.stage, s.night?.visit, s.revealed]).toEqual(["result", 0, false]);
    expect(W.canGoOn(s)).toBe(false);
    s = step(s, { type: "next", rng: zero });
    expect(s.night?.stage).toBe("result");
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect(s.night).toMatchObject({ visit: 1, stage: "card" });
    expect(s.revealed).toBe(false);
  });

  it("offers every living player to every visitor, whatever the role and the night", () => {
    const roles: Role[] = ["villager", "wolf", "seer", "doctor", "wolf", "villager", "villager"];
    const everyone = [0, 1, 2, 3, 4, 5, 6].map((seat) => ({ seat, enabled: true }));
    let s = night1(roles);
    for (const seat of [0, 1, 2, 3]) {
      s = choosingAt(s, seat);
      expect(W.pickOptions(s)).toEqual(everyone);
    }
    expect(W.pickOptions({ ...choosingAt(night1(roles), 3), lastProtected: 4 })).toEqual(everyone);
  });

  it("takes a wolf's pick only on a non-wolf, the seer's only on someone else and anyone else's on anyone", () => {
    let s = choosingAt(night1(["villager", "wolf", "seer", "doctor", "wolf", "villager", "villager"]), 1);
    expect([W.visitTask(s), pickable(s)]).toEqual(["wolf", [0, 2, 3, 5, 6]]);
    s = choosingAt(s, 2);
    expect([W.visitTask(s), pickable(s)]).toEqual(["seer", [0, 1, 3, 4, 5, 6]]);
    s = choosingAt(s, 3);
    expect([W.visitTask(s), pickable(s)]).toEqual(["doctor", [0, 1, 2, 3, 4, 5, 6]]);
    s = choosingAt(s, 5);
    expect([W.visitTask(s), pickable(s)]).toEqual(["guess", [0, 1, 2, 3, 4, 5, 6]]);
  });

  it("takes a wolf's pick of a wolf as no vote, says so on the result card and goes on", () => {
    let s = step(choosingAt(night1(["villager", "wolf", "seer", "doctor", "wolf"]), 1), { type: "choose", target: 4 });
    expect([s.night?.stage, s.night?.rejected, s.night?.picks[1]]).toEqual(["result", "wolf", null]);
    expect(W.visitResult(s, en)).toBe("You cannot choose a wolf, so you cast no vote tonight.");
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect([s.night?.stage, s.night?.visit, s.night?.rejected]).toEqual(["card", 2, null]);
  });

  it("leaves a wasted wolf vote out of the count, and no victim when every wolf wastes theirs", () => {
    const roles: Role[] = ["wolf", "wolf", "villager", "villager", "villager", "seer", "villager"];
    expect(passNight(night1(roles), { picks: { 0: 1, 1: 3 } }).removal?.removed).toEqual([3]);
    const none = passNight(night1(roles), { picks: { 0: 1, 1: 0 } });
    expect([none.removal?.removed, none.night?.victim]).toEqual([[], null]);
  });

  it("takes the doctor's repeat of last night as no protection tonight and goes on", () => {
    let s = step(choosingAt({ ...night1(basic), lastProtected: 4 }, 3), { type: "choose", target: 4 });
    expect([s.night?.rejected, s.night?.protect]).toEqual(["repeat", null]);
    expect(W.visitResult(s, en)).toBe("You protected Eda last night, so you protect no one tonight.");
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect([s.night?.stage, s.night?.visit]).toEqual(["card", 4]);
  });

  it("remembers only real protections: after a wasted night the doctor may protect that player again", () => {
    let s = passNight(night1(basic), { picks: { 1: 4, 3: 4 } });
    expect([s.removal?.removed, s.lastProtected]).toEqual([[], 4]);
    s = passNight(step(voteOut(toDay(s), null), { type: "continue" }), { picks: { 1: 2, 3: 4 } });
    expect([s.removal?.removed, s.lastProtected]).toEqual([[2], null]);
    s = choosingAt(step(voteOut(toDay(s), null), { type: "continue" }), 3);
    expect(W.cardText(s, en)?.lines).toEqual([en.wolfTaskDoctor]);
    expect(W.canPick(s, 4)).toBe(true);
  });

  it("shows a wolf the earlier wolves' picks of this night", () => {
    let s = choosingAt(night1(["villager", "wolf", "seer", "wolf", "villager", "villager", "villager"]), 1);
    expect(W.wolfPicksSoFar(s)).toEqual([]);
    s = choosingAt(step(s, { type: "choose", target: 5 }), 3);
    expect(W.wolfPicksSoFar(s)).toEqual([{ wolf: 1, target: 5 }]);
  });

  it("gives the seer the answer on the result card, and nothing for a pick of themselves", () => {
    expect(W.visitResult(step(choosingAt(night1(basic), 2), { type: "choose", target: 1 }), en)).toBe("Bob: Wolf");
    let s = step(choosingAt(night1(basic), 2), { type: "choose", target: 2 });
    expect([s.night?.rejected, s.night?.seen]).toEqual(["self", null]);
    expect(W.visitResult(s, en)).toBe("You cannot choose yourself, so you learn nothing tonight.");
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect([s.night?.stage, s.night?.visit]).toEqual(["card", 3]);
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

  it("guards the pick and the result card like any other move", () => {
    let s = W.gameReducer(night1(basic), { type: "reveal", at: 20_000 });
    s = W.gameReducer(s, { type: "next", rng: zero, at: 21_000 });
    expect(W.gameReducer(s, { type: "choose", target: 1, at: 21_000 + W.TAP_GUARD_MS - 1 }).night?.stage).toBe("choose");
    s = W.gameReducer(s, { type: "choose", target: 1, at: 21_500 });
    expect([s.night?.stage, s.night?.picks[0]]).toEqual(["result", 1]);
    expect(W.gameReducer(s, { type: "reveal", at: 21_500 + W.TAP_GUARD_MS - 1 }).revealed).toBe(false);
    expect(W.gameReducer(s, { type: "reveal", at: 21_500 + W.TAP_GUARD_MS }).revealed).toBe(true);
  });
});

describe("night: the witch lap", () => {
  // Ann wolf, Bob seer, Cem witch, then three villagers.
  const witchRoles: Role[] = ["wolf", "seer", "witch", "villager", "villager", "villager"];

  it("goes round once more for a living witch with a potion, who is told the victim", () => {
    const s = mainLap(night1(witchRoles), { picks: { 0: 4 } });
    expect(s.phase).toBe("night");
    expect(s.night).toMatchObject({ lap: "witch", order: [0, 1, 2, 3, 4, 5], visit: 0, stage: "card", victim: 4 });
  });

  it("takes every visitor, the witch too, through the same steps and taps", () => {
    let s = mainLap(night1(witchRoles), { picks: { 0: 4 } });
    const visits: string[][] = [];
    for (let guard = 0; s.phase === "night"; guard++) {
      if (guard > 10) throw new Error("the witch lap did not end");
      const seen: string[] = [];
      const note = () => seen.push(`${s.night!.stage} held:${s.revealed} next:${W.canGoOn(s)} options:${W.pickOptions(s).length}`);
      note();
      s = step(s, { type: "reveal" });
      note();
      s = step(s, { type: "next", rng: zero });
      note();
      // The witch heals the victim; everyone else picks Nobody.
      const isWitch = s.roles[s.night!.order[s.night!.visit]] === "witch";
      s = step(s, { type: "choose", target: isWitch ? 4 : null });
      note();
      s = step(s, { type: "reveal" });
      note();
      s = step(s, { type: "next", rng: zero });
      visits.push(seen);
    }
    expect(visits).toHaveLength(6);
    for (const visit of visits) expect(visit).toEqual(visits[0]);
    expect([s.removal?.removed, s.potions]).toEqual([[], { heal: false, poison: true }]);
  });

  it("heals the victim when the witch chooses them, which uses up the healing potion", () => {
    const s = passNight(night1(witchRoles), { picks: { 0: 4 }, witch: 4 });
    expect(s.removal?.removed).toEqual([]);
    expect(s.potions).toEqual({ heal: false, poison: true });
  });

  it("poisons anyone else the witch chooses, and uses only that one potion", () => {
    const s = passNight(night1(witchRoles), { picks: { 0: 4 }, witch: 3 });
    expect(s.removal?.removed).toEqual([3, 4]);
    expect(s.potions).toEqual({ heal: true, poison: false });
  });

  it("uses no potion when the witch chooses Nobody", () => {
    const s = passNight(night1(witchRoles), { picks: { 0: 4 }, witch: null });
    expect([s.removal?.removed, s.potions]).toEqual([[4], { heal: true, poison: true }]);
  });

  it("lets the witch heal herself but not poison herself", () => {
    const healed = step(choosingAt(mainLap(night1(witchRoles), { picks: { 0: 2 } }), 2), { type: "choose", target: 2 });
    expect([healed.night?.rejected, healed.night?.heal]).toEqual([null, true]);
    const poisoned = step(choosingAt(mainLap(night1(witchRoles), { picks: { 0: 4 } }), 2), { type: "choose", target: 2 });
    expect([poisoned.night?.rejected, poisoned.night?.heal, poisoned.night?.poison]).toEqual(["poisonSelf", false, null]);
    expect(W.visitResult(poisoned, en)).toBe("You cannot poison yourself, so you use no potion tonight.");
    expect(passNight(poisoned).removal?.removed).toEqual([4]);
  });

  it("uses no potion when the witch chooses what her potions cannot do, and goes on", () => {
    const noHeal = mainLap({ ...night1(witchRoles), potions: { heal: false, poison: true } }, { picks: { 0: 4 } });
    let s = step(choosingAt(noHeal, 2), { type: "choose", target: 4 });
    expect([s.night?.rejected, s.night?.heal, s.night?.poison]).toEqual(["healUsed", false, null]);
    expect(W.visitResult(s, en)).toBe("Your healing potion is used up, so you use no potion tonight.");
    s = step(step(s, { type: "reveal" }), { type: "next", rng: zero });
    expect([s.night?.stage, s.night?.visit]).toEqual(["card", 3]);
    expect(passNight(s).removal?.removed).toEqual([4]);
    const noPoison = mainLap({ ...night1(witchRoles), potions: { heal: true, poison: false } }, { picks: { 0: 4 } });
    const wasted = passNight(noPoison, { witch: 3 });
    expect([wasted.removal?.removed, wasted.potions]).toEqual([[4], { heal: true, poison: false }]);
    expect(W.visitResult(step(choosingAt(noPoison, 2), { type: "choose", target: 3 }), en)).toBe(
      "Your poison is used up, so you use no potion tonight."
    );
  });

  it("saves anyone else's pick or Nobody on the witch lap, and it changes nothing", () => {
    const s = mainLap(night1(witchRoles), { picks: { 0: 4 } });
    for (const target of [1, null]) {
      const picked = step(choosingAt(s, 1), { type: "choose", target });
      expect([picked.night?.rejected, picked.night?.heal, picked.night?.poison]).toEqual([null, false, null]);
      expect(W.visitResult(picked, en)).toBe(en.wolfChoiceSaved);
    }
  });

  it("offers Nobody only on the witch lap", () => {
    expect(step(choosingAt(night1(witchRoles), 0), { type: "choose", target: null }).night?.stage).toBe("choose");
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

  it("shows each visitor's task with its rules", () => {
    const roles: Role[] = ["villager", "wolf", "seer", "doctor", "wolf", "villager", "villager"];
    const lines = (s: GameState) => W.cardText(s, en)?.lines;
    const s = night1(roles);
    expect(W.cardText(s, en)).toEqual({ heading: "Night 1", role: "villager", lines: [en.wolfTaskGuess] });
    const first = choosingAt(s, 1);
    expect(lines(first)).toEqual(["Choose a victim who is not a wolf."]);
    const second = choosingAt(step(first, { type: "choose", target: 6 }), 4);
    expect(lines(second)).toEqual([en.wolfTaskWolf, "Chosen so far tonight: Bob → Gil"]);
    expect(lines(choosingAt(s, 2))).toEqual(["Choose a player to learn whether they are a wolf; not yourself."]);
    expect(lines(choosingAt(s, 3))).toEqual([en.wolfTaskDoctor]);
    expect(lines(choosingAt({ ...s, lastProtected: 5 }, 3))).toEqual([
      "Choose a player to protect from the wolves tonight; not the same as last night (Fay).",
    ]);
  });

  describe("the witch's card on her lap", () => {
    // Ann wolf, Bob seer, Cem witch, Dan, Eda and Fay villagers.
    const roles: Role[] = ["wolf", "seer", "witch", "villager", "villager", "villager"];
    const both = { heal: true, poison: true };
    const healOnly = { heal: true, poison: false };
    const poisonOnly = { heal: false, poison: true };
    // Ann's pick: Eda, Cem the witch herself, or Ann herself, which is no vote and no victim.
    const lap = (potions: GameState["potions"], wolfPick: number) =>
      mainLap({ ...night1(roles), potions }, { picks: { 0: wolfPick } });
    const card = (potions: GameState["potions"], wolfPick: number, t = en) =>
      W.cardText(choosingAt(lap(potions, wolfPick), 2), t)?.lines;

    it("tells everyone but the witch that this lap has nothing for them", () => {
      expect(W.cardText(lap(both, 4), en)?.lines).toEqual(["Nothing to do this lap; choose anyone or Nobody."]);
    });

    it("states every rule her tap is judged by, for each victim and the potions left", () => {
      expect(card(both, 4)).toEqual([
        "The wolves chose Eda.",
        "Potions left: healing, poison",
        "Choose Eda to heal them, anyone else but yourself to poison, or Nobody.",
      ]);
      expect(card(healOnly, 4)?.slice(1)).toEqual(["Potions left: healing", "Choose Eda to heal them, or Nobody."]);
      expect(card(poisonOnly, 4)?.slice(1)).toEqual([
        "Potions left: poison",
        "Choose a player other than Eda and yourself to poison, or Nobody.",
      ]);

      expect(card(both, 2)).toEqual([
        "The wolves chose Cem.",
        "Potions left: healing, poison",
        "Choose Cem to heal them, anyone else but yourself to poison, or Nobody.",
      ]);
      expect(card(healOnly, 2)?.slice(2)).toEqual(["Choose Cem to heal them, or Nobody."]);
      // Her own name is the victim's, so it is named once.
      expect(card(poisonOnly, 2)?.slice(2)).toEqual(["Choose a player other than yourself to poison, or Nobody."]);

      expect(card(both, 0)).toEqual([
        "The wolves chose no one tonight.",
        "Potions left: healing, poison",
        "Choose a player other than yourself to poison, or Nobody.",
      ]);
      expect(card(healOnly, 0)?.slice(2)).toEqual(["No potion can be used tonight; choose anyone or Nobody."]);
      expect(card(poisonOnly, 0)?.slice(2)).toEqual(["Choose a player other than yourself to poison, or Nobody."]);
    });

    it("has every line translated, with the names filled in", () => {
      for (const potions of [both, healOnly, poisonOnly]) {
        for (const wolfPick of [4, 2, 0]) {
          const lines = card(potions, wolfPick, tr)!;
          expect(lines).toHaveLength(3);
          for (const line of lines) expect(line).not.toMatch(/[{}]/);
          expect(lines).not.toEqual(card(potions, wolfPick, en));
        }
      }
    });
  });

  it("shows the result on the second card: the seer's answer, or that the choice is saved", () => {
    expect(W.visitResult(choosingAt(night1(basic), 0), en)).toBeNull();
    const saved = step(choosingAt(night1(basic), 0), { type: "choose", target: 2 });
    expect(W.cardText(saved, en)).toEqual({ heading: "Night 1", role: "villager", lines: ["Your choice is saved."] });
    const seen = step(choosingAt(night1(basic), 2), { type: "choose", target: 4 });
    expect(W.cardText(seen, en)?.lines).toEqual(["Eda: Not a wolf"]);
  });
});

interface NarratorChoices {
  victim: number;
  seen?: number;
  protect?: number;
  heal?: boolean;
  poison?: number;
}

// The narrator reads the night line by line and taps what the table points at, until the
// morning or until the line `stop` is up.
function narratorNight(state: GameState, c: NarratorChoices, stop?: W.NarratorLine): GameState {
  let s = state;
  for (let guard = 0; s.phase === "night"; guard++) {
    if (guard > 10) throw new Error("the night did not end");
    const line = W.narratorLine(s);
    if (line === stop) return s;
    if (line === "wolves") s = step(s, { type: "choose", target: c.victim });
    if (line === "seer" && c.seen !== undefined) s = step(s, { type: "choose", target: c.seen });
    if (line === "doctor" && c.protect !== undefined) s = step(s, { type: "choose", target: c.protect });
    if (line === "witch" && c.heal) s = step(s, { type: "heal" });
    if (line === "witch" && c.poison !== undefined) s = step(s, { type: "choose", target: c.poison });
    s = step(s, { type: "next", rng: zero });
  }
  return s;
}

describe("night: narrator", () => {
  // Ann wolf, Bob seer, Cem doctor, Dan witch, Eda and Fay villagers, Gil hunter.
  const roles: Role[] = ["wolf", "seer", "doctor", "witch", "villager", "villager", "hunter"];
  const start = () => night1(roles, { night: "narrator" });

  it("walks the lines one at a time and needs the wolves' victim before going on", () => {
    let s = start();
    expect(W.narratorLine(s)).toBe("sleep");
    expect(W.visitTask(s)).toBeNull();
    s = step(s, { type: "next", rng: zero });
    expect(W.narratorLine(s)).toBe("wolves");
    expect(W.canGoOn(s)).toBe(false);
    expect(W.canPick(s, 0)).toBe(false);
    s = step(s, { type: "choose", target: 4 });
    s = step(s, { type: "choose", target: 5 });
    expect(s.night?.victim).toBe(5);
    s = step(s, { type: "next", rng: zero });
    expect(W.narratorLine(s)).toBe("seer");
  });

  it("shows the narrator the seer's pick and needs the doctor's", () => {
    let s = narratorNight(start(), { victim: 4 }, "seer");
    expect(W.canGoOn(s)).toBe(false);
    expect(W.canPick(s, 1)).toBe(false);
    s = step(s, { type: "choose", target: 0 });
    expect(s.roles[s.night!.seen!]).toBe("wolf");
    s = step(s, { type: "next", rng: zero });
    expect(W.narratorLine(s)).toBe("doctor");
    expect(W.canGoOn(s)).toBe(false);
    expect(W.canPick(s, 2)).toBe(true);
  });

  it("resolves the night the narrator entered", () => {
    const s = narratorNight(start(), { victim: 4, seen: 0, protect: 4, poison: 5 });
    expect(s.phase).toBe("morning");
    expect(s.removal?.removed).toEqual([5]);
    expect(s.lastProtected).toBe(4);
    expect(s.potions).toEqual({ heal: true, poison: false });
  });

  it("lets the narrator heal the witch but not poison her", () => {
    let s = narratorNight(start(), { victim: 3, seen: 0, protect: 4 }, "witch");
    expect([W.canHeal(s), W.canPick(s, 3), W.canGoOn(s)]).toEqual([true, false, true]);
    s = narratorNight(step(s, { type: "heal" }), { victim: 3 });
    expect(s.removal?.removed).toEqual([]);
    expect(s.potions).toEqual({ heal: false, poison: true });
  });

  it("uses at most one potion a night: Heal and a poison pick replace each other", () => {
    let s = narratorNight(start(), { victim: 4, seen: 0, protect: 2 }, "witch");
    s = step(step(s, { type: "heal" }), { type: "choose", target: 5 });
    expect([s.night?.heal, s.night?.poison]).toEqual([false, 5]);
    s = step(s, { type: "heal" });
    expect([s.night?.heal, s.night?.poison]).toEqual([true, null]);
    s = narratorNight(s, { victim: 4 });
    expect([s.removal?.removed, s.potions]).toEqual([[], { heal: false, poison: true }]);
  });

  it("ignores a bounced second tap on Heal or on the poisoned player", () => {
    const witch = narratorNight(start(), { victim: 4, seen: 0, protect: 2 }, "witch");
    const at = witch.lastActionAt + 1000;
    const healed = W.gameReducer(witch, { type: "heal", at });
    expect(healed.night?.heal).toBe(true);
    expect(W.gameReducer(healed, { type: "heal", at: at + W.TAP_GUARD_MS - 1 }).night?.heal).toBe(true);
    expect(W.gameReducer(healed, { type: "heal", at: at + W.TAP_GUARD_MS }).night?.heal).toBe(false);
    const poisoned = W.gameReducer(witch, { type: "choose", target: 5, at });
    expect(poisoned.night?.poison).toBe(5);
    expect(W.gameReducer(poisoned, { type: "choose", target: 5, at: at + W.TAP_GUARD_MS - 1 }).night?.poison).toBe(5);
    expect(W.gameReducer(poisoned, { type: "choose", target: 5, at: at + W.TAP_GUARD_MS }).night?.poison).toBeNull();
  });

  it("lets Next follow the wolves', the seer's and the doctor's pick at once", () => {
    let s = step(start(), { type: "next", rng: zero });
    for (const [line, target] of [["wolves", 4], ["seer", 0], ["doctor", 2]] as const) {
      expect(W.narratorLine(s)).toBe(line);
      const at = s.lastActionAt + 1000;
      const picked = W.gameReducer(s, { type: "choose", target, at });
      s = W.gameReducer(picked, { type: "next", rng: zero, at: at + 1 });
    }
    expect(W.narratorLine(s)).toBe("witch");
  });

  it("reads the lines of removed roles, marked, and goes on without a choice", () => {
    const out = dealAll({ ...dealt(roles, { night: "narrator" }), alive: [true, false, true, false, true, true, true] });
    let s = narratorNight(out, { victim: 4 }, "seer");
    expect([W.lineRemoved(s), W.canPick(s, 0), W.canGoOn(s)]).toEqual([true, false, true]);
    s = step(s, { type: "next", rng: zero });
    expect([W.narratorLine(s), W.lineRemoved(s)]).toEqual(["doctor", false]);
    s = narratorNight(s, { victim: 4, protect: 5 }, "witch");
    expect([W.lineRemoved(s), W.canHeal(s), W.canGoOn(s)]).toEqual([true, false, true]);
  });

  it("reads the witch's line when she has no potion left, with nothing to choose", () => {
    const s = narratorNight({ ...start(), potions: { heal: false, poison: false } }, { victim: 4, seen: 0, protect: 2 }, "witch");
    expect([W.lineRemoved(s), W.canHeal(s), W.canPick(s, 4), W.canGoOn(s)]).toEqual([false, false, false, true]);
  });
});

const toDay = (s: GameState) => step(s, { type: "continue" });
const voteOut = (s: GameState, target: number | null) => step(step(s, { type: "vote" }), { type: "voteOut", target });

describe("morning, day and vote", () => {
  it("goes to the day after the morning, with the timer running from then", () => {
    const s = toDay(passNight(night1(basic, { timerMinutes: 3 }), { picks: { 1: 4 } }));
    expect([s.phase, s.dayStep]).toEqual(["day", "talk"]);
    expect(s.dayEndsAt).toBe(s.lastActionAt + 3 * 60_000);
    const back = step(step(s, { type: "vote" }), { type: "talk" });
    expect([back.dayStep, back.dayEndsAt]).toEqual(["talk", s.dayEndsAt]);
  });

  it("removes nobody on a Nobody vote and starts the next night one seat later", () => {
    let s = voteOut(toDay(passNight(night1(basic), { picks: { 1: 4 } })), null);
    expect([s.dayStep, s.removal]).toEqual(["result", { removed: [], hunter: null, shot: null }]);
    s = step(s, { type: "continue" });
    expect(s.phase).toBe("night");
    expect(s.night).toMatchObject({ number: 2, order: [1, 2, 3, 0], visit: 0, stage: "card", victim: null });
  });

  it("removes the voted-out player, who must still be in the game", () => {
    const day = toDay(passNight(night1(basic), { picks: { 1: 4 } }));
    expect(voteOut(day, 4).dayStep).toBe("vote");
    const s = voteOut(day, 0);
    expect(s.removal?.removed).toEqual([0]);
    expect(s.alive).toEqual([false, true, true, true, false]);
  });

  it("ends with the village's win when the last wolf is voted out", () => {
    const s = step(voteOut(toDay(passNight(night1(basic), { picks: { 1: 4 } })), 1), { type: "continue" });
    expect([s.phase, s.winner]).toEqual(["end", "village"]);
  });

  it("ends with the wolves' win after the night that makes them as many as the others", () => {
    const roles: Role[] = ["wolf", "villager", "villager", "seer", "villager"];
    let s = step(voteOut(toDay(passNight(night1(roles), { picks: { 0: 1 } })), 2), { type: "continue" });
    s = step(passNight(s, { picks: { 0: 3 } }), { type: "continue" });
    expect([s.phase, s.winner]).toEqual(["end", "wolves"]);
  });

  // Ann wolf, Bob hunter, Cem villager, Dan seer, Eda villager, Fay wolf, Gil and Hal villagers.
  const hunterRoles: Role[] = ["wolf", "hunter", "villager", "seer", "villager", "wolf", "villager", "villager"];

  it("makes a hunter removed at night shoot before the day", () => {
    let s = passNight(night1(hunterRoles), { picks: { 0: 1, 5: 1 } });
    expect(s.removal).toEqual({ removed: [1], hunter: 1, shot: null });
    expect(W.pendingShot(s)).toBe(true);
    expect(step(s, { type: "continue" }).phase).toBe("morning");
    expect(step(s, { type: "shoot", target: 1 }).removal?.shot).toBeNull();
    s = step(s, { type: "shoot", target: 5 });
    expect([s.removal?.shot, s.alive[5], W.pendingShot(s)]).toEqual([5, false, false]);
    expect(step(s, { type: "continue" }).phase).toBe("day");
  });

  it("makes a voted-out hunter shoot, then starts the next night", () => {
    let s = voteOut(toDay(passNight(night1(hunterRoles), { picks: { 0: 2, 5: 2 } })), 1);
    expect(s.removal).toEqual({ removed: [1], hunter: 1, shot: null });
    expect(step(s, { type: "continue" }).dayStep).toBe("result");
    s = step(step(s, { type: "shoot", target: 4 }), { type: "continue" });
    expect([s.phase, s.night?.number]).toEqual(["night", 2]);
    expect(s.alive).toEqual([true, false, false, true, false, true, true, true]);
  });

  it("lets a hunter's shot end the game", () => {
    let s = passNight(night1(["wolf", "hunter", "villager", "villager", "seer"]), { picks: { 0: 1 } });
    s = step(step(s, { type: "shoot", target: 0 }), { type: "continue" });
    expect([s.phase, s.winner]).toEqual(["end", "village"]);
  });

  it("shoots before the win check, so a shot can take the wolves' win away", () => {
    let s = passNight(night1(["wolf", "wolf", "hunter", "villager", "seer"]), { picks: { 0: 2, 1: 2 } });
    expect(W.winner(s.roles, s.alive)).toBe("wolves");
    s = step(step(s, { type: "shoot", target: 0 }), { type: "continue" });
    expect(s.phase).toBe("day");
  });

  it("asks for no shot once no wolf is left", () => {
    let s = passNight(night1(["wolf", "hunter", "witch", "villager", "villager"]), { picks: { 0: 1 }, witch: 0 });
    expect(s.removal).toEqual({ removed: [0, 1], hunter: null, shot: null });
    s = step(s, { type: "continue" });
    expect([s.phase, s.winner]).toEqual(["end", "village"]);
  });

  it("deals again from the This game screen after Play again, keeping the setup", () => {
    const over = step(voteOut(toDay(passNight(night1(basic), { picks: { 1: 4 } })), 1), { type: "continue" });
    const again = step(over, { type: "playAgain" });
    expect(again.phase).toBe("rules");
    expect(again.setup).toEqual(over.setup);
    expect(step(again, { type: "deal", rng: zero }).phase).toBe("deal");
  });
});

describe("visit order across nights", () => {
  it("starts each night one living player later, so no one starts two nights running", () => {
    // Bob is out from the start; every night the doctor saves the wolves' victim.
    const roles: Role[] = ["villager", "villager", "wolf", "doctor", "seer", "villager"];
    let s = dealAll({ ...dealt(roles), alive: [true, false, true, true, true, true] });
    const starts: number[] = [];
    for (const target of [0, 4, 0, 4]) {
      starts.push(s.night!.order[0]);
      s = passNight(s, { picks: { 2: target, 3: target } });
      expect(s.removal?.removed).toEqual([]);
      s = step(voteOut(toDay(s), null), { type: "continue" });
    }
    expect(starts).toEqual([0, 2, 3, 4]);
  });
});

describe("every visit takes the same steps", () => {
  // Ann and Bob wolves, Cem seer, Dan doctor, Eda witch, Fay villager, Gil hunter.
  const roles: Role[] = ["wolf", "wolf", "seer", "doctor", "witch", "villager", "hunter"];

  // Plays one visit with its five taps (hold, Continue, pick, hold, Continue), noting after each
  // tap what the screens offer, and whether the phone then moved on.
  function trace(state: GameState, target: number | null): [string, GameState, W.Rejection | null] {
    const { lap, visit } = state.night!;
    let s = state;
    const seen: string[] = [];
    const note = () => seen.push(`${s.night!.stage}|held:${s.revealed}|next:${W.canGoOn(s)}|options:${W.pickOptions(s).length}`);
    note();
    const taps: Act[] = [{ type: "reveal" }, { type: "next", rng: zero }, { type: "choose", target }, { type: "reveal" }];
    for (const tap of taps) {
      s = step(s, tap);
      note();
    }
    const rejected = s.night!.rejected;
    s = step(s, { type: "next", rng: zero });
    const movedOn = s.phase !== "night" || s.night!.lap !== lap || s.night!.visit !== visit;
    return [`${seen.join(" ")} moved:${movedOn}`, s, rejected];
  }

  // A pick the rules allow, or one they do not, for whoever holds the phone. The villager and the
  // hunter have no pick the rules forbid.
  function pickFor(s: GameState, disallowed: boolean): number | null {
    const seat = s.night!.order[s.night!.visit];
    const role = s.roles[seat];
    if (s.night!.lap === "witch") return role === "witch" ? (disallowed ? seat : s.night!.victim) : null;
    if (role === "wolf") return disallowed ? 1 - seat : 6;
    if (role === "seer") return disallowed ? seat : 0;
    if (role === "doctor") return disallowed ? 5 : 6;
    return 0;
  }

  it("is the same for every role on both laps, whether the pick is allowed or not", () => {
    const traces: string[] = [];
    const rejected: Record<string, W.Rejection[]> = { allowed: [], disallowed: [] };
    for (const disallowed of [false, true]) {
      let s: GameState = { ...night1(roles), lastProtected: 5 };
      for (let guard = 0; s.phase === "night"; guard++) {
        if (guard > 20) throw new Error("the night did not end");
        const [visit, after, why] = trace(s, pickFor(s, disallowed));
        traces.push(visit);
        if (why) rejected[disallowed ? "disallowed" : "allowed"].push(why);
        s = after;
      }
    }
    expect(rejected).toEqual({ allowed: [], disallowed: ["wolf", "wolf", "self", "repeat", "poisonSelf"] });
    expect(traces).toHaveLength(28);
    for (const visit of traces) expect(visit).toBe(traces[0]);
    expect(traces[0]).toBe(
      "card|held:false|next:false|options:7 card|held:true|next:true|options:7 choose|held:true|next:false|options:7 " +
        "result|held:false|next:false|options:7 result|held:true|next:true|options:7 moved:true"
    );
  });
});
