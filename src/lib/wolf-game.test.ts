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
