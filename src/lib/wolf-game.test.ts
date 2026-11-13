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
