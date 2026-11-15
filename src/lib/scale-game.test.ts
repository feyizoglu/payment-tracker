import { describe, it, expect } from "vitest";
import {
  SCALE_NEEDLE_START,
  SCALE_OUTCOME_KEYS,
  SCALE_REVEAL_LOCK_MS,
  SCALE_SETUP_ERROR_KEYS,
  SCALE_SETUP_STEPS,
  SCALE_TAP_GUARD_MS,
  defaultScaleSetup,
  drawScaleTarget,
  initialScaleState,
  needleAt,
  parseSavedScaleSetup,
  scaleClueGiver,
  scaleDistance,
  scaleDistanceKey,
  scaleOutcome,
  scalePoints,
  parseSavedScaleSeen,
  scaleReducer,
  scaleSeenKey,
  scaleSetupInLang,
  scaleStepErrors,
  scaleTeam,
  scaleTurn,
  scaleWinner,
  scaleZones,
  validateScaleSetup,
  type ScaleAction,
  type ScalePair,
  type ScaleSetup,
  type ScaleState,
} from "@/lib/scale-game";
import { translationsFor } from "@/lib/i18n";

const TEAMS = ["Team 1", "Team 2"] as const;
const PAIRS: ScalePair[] = [
  { id: "en-1", left: "Cold", right: "Hot" },
  { id: "en-2", left: "Cheap", right: "Expensive" },
  { id: "en-3", left: "Boring", right: "Exciting" },
];
const valid: ScaleSetup = {
  teams: [
    { name: "Red", players: ["Ann", "Bob"] },
    { name: "Blue", players: ["Cem", "Dan", "Eda"] },
  ],
  turns: 4,
};
const zero = () => 0;
const T0 = 1_800_000_000_000;

/** Applies actions one after another, each `wait` ms after the last. */
function run(state: ScaleState, actions: ((at: number) => ScaleAction)[], wait = 1000): ScaleState {
  let at = state.lastActionAt;
  return actions.reduce((s, action) => {
    at += wait;
    return scaleReducer(s, action(at));
  }, state);
}

const start =
  (setup: ScaleSetup = valid, pairs: readonly ScalePair[] = PAIRS, seen: readonly string[] = [], lang: "en" | "tr" = "en") =>
  (at: number): ScaleAction => ({ type: "start", setup, lang, pairs, seen, at });
const show =
  (rng = zero) =>
  (at: number): ScaleAction => ({ type: "show", rng, at });
const hide = (at: number): ScaleAction => ({ type: "hide", at });
const move =
  (needle: number) =>
  (at: number): ScaleAction => ({ type: "move", needle, at });
const lock = (at: number): ScaleAction => ({ type: "lock", at });
const next = (at: number): ScaleAction => ({ type: "next", at });
const playAgain = (at: number): ScaleAction => ({ type: "playAgain", at });
const newGame = (at: number): ScaleAction => ({ type: "newGame", at });

const fresh = () => ({ ...initialScaleState(defaultScaleSetup(TEAMS)), lastActionAt: T0 });
const started = (setup?: ScaleSetup, pairs?: readonly ScalePair[], seen?: readonly string[]) =>
  run(fresh(), [start(setup, pairs, seen)]);
/** One whole turn with the needle on `needle`, ending on the reveal. */
const turn = (needle = 50, rng = zero) => [show(rng), hide, move(needle), lock, lock];
const finish = (state: ScaleState) => run(state, [next], SCALE_REVEAL_LOCK_MS);

describe("Scale setup", () => {
  it("defaults to two empty named teams and six turns each", () => {
    expect(defaultScaleSetup(TEAMS)).toEqual({
      teams: [
        { name: "Team 1", players: [] },
        { name: "Team 2", players: [] },
      ],
      turns: 6,
    });
  });

  it("accepts two teams of 2 to 8 players and the turn choices", () => {
    expect(validateScaleSetup(valid, "en-US")).toEqual([]);
    for (const turns of [4, 6, 8]) expect(validateScaleSetup({ ...valid, turns }, "en-US")).toEqual([]);
    const eight = Array.from({ length: 8 }, (_, i) => `P${i}`);
    expect(validateScaleSetup({ ...valid, teams: [{ name: "A", players: eight }, valid.teams[1]] }, "en-US")).toEqual([]);
  });

  it("refuses teams of fewer than 2 or more than 8 players", () => {
    const one = { ...valid, teams: [{ name: "A", players: ["Ann"] }, valid.teams[1]] as ScaleSetup["teams"] };
    const nine = Array.from({ length: 9 }, (_, i) => `P${i}`);
    const big = { ...valid, teams: [valid.teams[0], { name: "B", players: nine }] as ScaleSetup["teams"] };
    expect(validateScaleSetup(one, "en-US")).toEqual(["teamSize"]);
    expect(validateScaleSetup(big, "en-US")).toEqual(["teamSize"]);
  });

  it("refuses blank names and the same name twice, compared in the app's language", () => {
    const blank = { ...valid, teams: [{ name: "A", players: ["Ann", "  "] }, valid.teams[1]] as ScaleSetup["teams"] };
    expect(validateScaleSetup(blank, "en-US")).toEqual(["blankName"]);
    const twice = { ...valid, teams: [{ name: "A", players: ["IRMAK", "Bob"] }, { name: "B", players: ["ırmak", "Cem"] }] as ScaleSetup["teams"] };
    expect(validateScaleSetup(twice, "tr-TR")).toEqual(["duplicateName"]);
    expect(validateScaleSetup(twice, "en-US")).toEqual([]);
  });

  it("refuses a blank team name and two teams with the same name", () => {
    const blank = { ...valid, teams: [{ ...valid.teams[0], name: " " }, valid.teams[1]] as ScaleSetup["teams"] };
    expect(validateScaleSetup(blank, "en-US")).toEqual(["blankTeamName"]);
    const same = { ...valid, teams: [{ ...valid.teams[0], name: "Blue " }, valid.teams[1]] as ScaleSetup["teams"] };
    expect(validateScaleSetup(same, "en-US")).toEqual(["sameTeamName"]);
  });

  it("refuses a number of turns that is not a choice", () => {
    expect(validateScaleSetup({ ...valid, turns: 5 }, "en-US")).toEqual(["rules"]);
  });

  it("gives each step only the errors it can fix", () => {
    expect(SCALE_SETUP_STEPS).toEqual(["teams", "rules"]);
    const bad = { ...valid, turns: 3, teams: [{ name: "A", players: [] }, valid.teams[1]] as ScaleSetup["teams"] };
    expect(scaleStepErrors(bad, "teams", "en-US")).toEqual(["teamSize"]);
    expect(scaleStepErrors(bad, "rules", "en-US")).toEqual(["rules"]);
  });

  it("restores a saved setup and falls back field by field", () => {
    const fallback = defaultScaleSetup(TEAMS);
    expect(parseSavedScaleSetup(JSON.stringify(valid), TEAMS)).toEqual(valid);
    expect(parseSavedScaleSetup(null, TEAMS)).toEqual(fallback);
    expect(parseSavedScaleSetup("{oops", TEAMS)).toEqual(fallback);
    expect(parseSavedScaleSetup("[1,2]", TEAMS)).toEqual(fallback);
    expect(parseSavedScaleSetup(JSON.stringify({ turns: 5 }), TEAMS)).toEqual(fallback);
    expect(parseSavedScaleSetup(JSON.stringify({ turns: 8, teams: "x" }), TEAMS)).toEqual({ ...fallback, turns: 8 });
    const odd = { teams: [{ name: 3, players: ["Ann", 4, "Bob"] }, null] };
    expect(parseSavedScaleSetup(JSON.stringify(odd), TEAMS)).toEqual({
      ...fallback,
      teams: [{ name: "Team 1", players: ["Ann", "Bob"] }, fallback.teams[1]],
    });
    const many = { teams: [{ name: "A", players: Array.from({ length: 12 }, (_, i) => `P${i}`) }] };
    expect(parseSavedScaleSetup(JSON.stringify(many), TEAMS).teams[0].players).toHaveLength(8);
  });

  it("moves default team names to another language and keeps the ones typed", () => {
    const tr = ["Takım 1", "Takım 2"] as const;
    expect(scaleSetupInLang(defaultScaleSetup(TEAMS), tr)).toEqual(defaultScaleSetup(tr));
    const own = { ...valid, teams: [{ name: "Reds", players: [] }, { name: "Team 2", players: ["Ann"] }] as ScaleSetup["teams"] };
    expect(scaleSetupInLang(own, tr).teams).toEqual([
      { name: "Reds", players: [] },
      { name: "Takım 2", players: ["Ann"] },
    ]);
  });
});

describe("Scale scoring", () => {
  it("scores 4, 3, 2 or 0 by distance, edges included", () => {
    expect([0, 3, 4, 8, 9, 14, 15, 100].map(scalePoints)).toEqual([4, 4, 3, 3, 2, 2, 0, 0]);
  });

  it("describes how close a guess was by its points", () => {
    expect([4, 3, 2, 0].map(scaleOutcome)).toEqual(["spotOn", "veryClose", "close", "miss"]);
  });

  it("writes the distance in steps, one step in the singular and none as a bullseye", () => {
    expect([0, 1, 2, 50].map(scaleDistanceKey)).toEqual(["scaleBullseye", "scaleDistanceOne", "scaleDistance", "scaleDistance"]);
    const en = translationsFor("en");
    const tr = translationsFor("tr");
    expect([en.scaleBullseye, en.scaleDistanceOne, en.scaleDistance]).toEqual([
      "Bullseye!",
      "The needle was 1 step away from the target.",
      "The needle was {n} steps away from the target.",
    ]);
    expect([tr.scaleBullseye, tr.scaleDistanceOne, tr.scaleDistance]).toEqual([
      "Tam isabet!",
      "İbre hedeften 1 birim uzaktaydı.",
      "İbre hedeften {n} birim uzaktaydı.",
    ]);
    expect(en[SCALE_OUTCOME_KEYS.spotOn]).not.toBe(en.scaleBullseye);
    expect(tr[SCALE_OUTCOME_KEYS.spotOn]).not.toBe(tr.scaleBullseye);
  });

  it("draws the band's zones left to right around the target, each value inside its zone", () => {
    expect(scaleZones(50)).toEqual([
      { points: 2, from: 35.5, to: 41.5 },
      { points: 3, from: 41.5, to: 46.5 },
      { points: 4, from: 46.5, to: 53.5 },
      { points: 3, from: 53.5, to: 58.5 },
      { points: 2, from: 58.5, to: 64.5 },
    ]);
  });

  it("clips the band at the ends of the line", () => {
    expect(scaleZones(3)).toEqual([
      { points: 4, from: 0, to: 6.5 },
      { points: 3, from: 6.5, to: 11.5 },
      { points: 2, from: 11.5, to: 17.5 },
    ]);
    expect(scaleZones(97)).toEqual([
      { points: 2, from: 82.5, to: 88.5 },
      { points: 3, from: 88.5, to: 93.5 },
      { points: 4, from: 93.5, to: 100 },
    ]);
    expect(scaleZones(10)[0]).toEqual({ points: 2, from: 0, to: 1.5 });
    expect(scaleZones(7)[0]).toEqual({ points: 3, from: 0, to: 3.5 });
  });

  it("draws targets from 3 to 97", () => {
    expect(drawScaleTarget(() => 0)).toBe(3);
    expect(drawScaleTarget(() => 0.5)).toBe(50);
    expect(drawScaleTarget(() => 0.9999999)).toBe(97);
    expect(drawScaleTarget(() => 1)).toBe(97);
  });

  it("turns a position along the line into a whole needle value from 0 to 100", () => {
    expect(needleAt(0, 200)).toBe(0);
    expect(needleAt(100, 200)).toBe(50);
    expect(needleAt(101, 200)).toBe(51);
    expect(needleAt(200, 200)).toBe(100);
    expect(needleAt(-30, 200)).toBe(0);
    expect(needleAt(260, 200)).toBe(100);
    expect(needleAt(10, 0)).toBe(SCALE_NEEDLE_START);
  });

  it("has every error and outcome string in both languages", () => {
    for (const lang of ["en", "tr"] as const) {
      const t = translationsFor(lang);
      for (const key of [...Object.values(SCALE_SETUP_ERROR_KEYS), ...Object.values(SCALE_OUTCOME_KEYS)]) expect(t[key]).toBeTruthy();
    }
    expect(translationsFor("tr").scaleTitle).toBe("Ölçek");
  });

  it("calls a turn \"tur\" in Turkish, like the other games", () => {
    const tr = translationsFor("tr");
    const scale = Object.entries(tr).filter(([key]) => key.startsWith("scale"));
    expect(scale.filter(([, value]) => /(^|\s)sıra(da)?(\s|$)/i.test(value)).map(([key]) => key)).toEqual([]);
    expect(tr.scaleTurns).toBe("Takım başına tur");
    expect(tr.scaleTurnOf).toBe("Tur {n} / {total}");
  });

  it("names the winner, or a tie", () => {
    expect(scaleWinner([5, 3])).toBe(0);
    expect(scaleWinner([2, 9])).toBe(1);
    expect(scaleWinner([4, 4])).toBeNull();
  });
});

describe("Scale start", () => {
  it("starts with the first team's first player giving the clue", () => {
    const s = started();
    expect(s.phase).toBe("handoff");
    expect(scaleTeam(s)).toBe(0);
    expect(scaleClueGiver(s)).toBe("Ann");
    expect(scaleTurn(s)).toBe(1);
    expect(s.scores).toEqual([0, 0]);
    expect(s.pairs).toEqual(PAIRS);
  });

  it("trims the names it starts with", () => {
    const padded: ScaleSetup = { ...valid, teams: [{ name: " Red ", players: [" Ann", "Bob "] }, valid.teams[1]] };
    const s = started(padded);
    expect(s.setup.teams[0]).toEqual({ name: "Red", players: ["Ann", "Bob"] });
  });

  it("refuses an invalid setup, an empty pair list and a start right after the last tap", () => {
    expect(started({ ...valid, turns: 5 }).phase).toBe("setup");
    expect(started(valid, []).phase).toBe("setup");
    expect(run(fresh(), [start()], SCALE_TAP_GUARD_MS - 1).phase).toBe("setup");
    expect(run(fresh(), [start()], SCALE_TAP_GUARD_MS).phase).toBe("handoff");
  });
});

describe("Scale turn", () => {
  it("shows a pair and a hidden target to the clue giver", () => {
    const s = run(started(), [show(() => 0.5)]);
    expect(s.phase).toBe("secret");
    expect(s.pair).toEqual(PAIRS[1]);
    expect(s.target).toBe(50);
    expect(s.used).toEqual(["en-2"]);
  });

  it("opens the guess with the needle in the middle", () => {
    const s = run(started(), [show(), hide]);
    expect(s.phase).toBe("guess");
    expect(s.needle).toBe(50);
    expect(s.confirming).toBe(false);
  });

  it("moves the needle to whole values from 0 to 100", () => {
    const s = run(started(), [show(), hide]);
    expect(run(s, [move(73.4)]).needle).toBe(73);
    expect(run(s, [move(-5)]).needle).toBe(0);
    expect(run(s, [move(140)]).needle).toBe(100);
    expect(run(s, [move(Number.NaN)]).needle).toBe(50);
  });

  it("lets moves come fast without stamping the last tap, but not right after a button", () => {
    const s = run(started(), [show(), hide]);
    expect(scaleReducer(s, { type: "move", needle: 70, at: s.lastActionAt + SCALE_TAP_GUARD_MS - 1 }).needle).toBe(50);
    let moved = s;
    for (let i = 0; i < 5; i++) moved = scaleReducer(moved, { type: "move", needle: 60 + i, at: s.lastActionAt + SCALE_TAP_GUARD_MS + i });
    expect(moved.needle).toBe(64);
    expect(moved.lastActionAt).toBe(s.lastActionAt);
  });

  it("refuses moves outside the guess", () => {
    const s = run(started(), [show()]);
    expect(run(s, [move(10)])).toBe(s);
  });

  it("asks for a second tap on Lock in, and a fast second tap does not count", () => {
    const g = run(started(), [show(), hide, move(70)]);
    const asked = run(g, [lock]);
    expect(asked.phase).toBe("guess");
    expect(asked.confirming).toBe(true);
    expect(run(asked, [lock], SCALE_TAP_GUARD_MS - 1).phase).toBe("guess");
    expect(run(asked, [lock], SCALE_TAP_GUARD_MS).phase).toBe("reveal");
  });

  it("cancels the confirm when the needle moves", () => {
    const asked = run(started(), [show(), hide, lock]);
    const moved = run(asked, [move(20)]);
    expect(moved.confirming).toBe(false);
    expect(run(moved, [lock]).phase).toBe("guess");
  });

  it("adds the points to the team on turn when the needle is locked", () => {
    // rng 0: the target is 3.
    const s = run(started(), turn(10));
    expect(s.phase).toBe("reveal");
    expect(scaleDistance(s)).toBe(7);
    expect(s.scores).toEqual([3, 0]);
    expect(s.revealedAt).toBe(s.lastActionAt);
  });

  it("adds each team's points to that team", () => {
    // rng 0: the target is 3 on every turn.
    const first = finish(run(started(), turn(3)));
    expect(first.scores).toEqual([4, 0]);
    expect(run(first, turn(10)).scores).toEqual([4, 3]);
  });

  it("opens Next 1 s after the reveal", () => {
    const s = run(started(), turn());
    expect(scaleReducer(s, { type: "next", at: s.revealedAt + SCALE_REVEAL_LOCK_MS - 1 }).phase).toBe("reveal");
    expect(scaleReducer(s, { type: "next", at: s.revealedAt + SCALE_REVEAL_LOCK_MS }).phase).toBe("handoff");
  });

  it("guards every button against a tap within 400 ms of the last", () => {
    const h = started();
    expect(run(h, [show()], SCALE_TAP_GUARD_MS - 1)).toBe(h);
    const sec = run(h, [show()]);
    expect(run(sec, [hide], SCALE_TAP_GUARD_MS - 1)).toBe(sec);
    const g = run(sec, [hide]);
    expect(run(g, [lock], SCALE_TAP_GUARD_MS - 1)).toBe(g);
  });

  it("refuses each action outside its phase", () => {
    const h = started();
    for (const action of [hide, lock, next, playAgain, newGame]) expect(run(h, [action])).toBe(h);
    const sec = run(h, [show()]);
    for (const action of [show(), lock, next]) expect(run(sec, [action])).toBe(sec);
    expect(run(fresh(), [show()]).phase).toBe("setup");
  });
});

describe("Scale turn order", () => {
  it("alternates the teams and rotates each team's clue giver, wrapping around", () => {
    let s = started();
    const givers: string[] = [];
    for (let i = 0; i < 8; i++) {
      givers.push(`${scaleTeam(s)}:${scaleClueGiver(s)}:${scaleTurn(s)}`);
      s = finish(run(s, turn()));
    }
    expect(givers).toEqual(["0:Ann:1", "1:Cem:1", "0:Bob:2", "1:Dan:2", "0:Ann:3", "1:Eda:3", "0:Bob:4", "1:Cem:4"]);
    expect(s.phase).toBe("end");
  });

  it("ends after every team has played its turns", () => {
    let s = started();
    for (let i = 0; i < 7; i++) s = finish(run(s, turn()));
    expect(s.phase).toBe("handoff");
    s = run(s, turn());
    expect(s.phase).toBe("reveal");
    s = finish(s);
    expect(s.phase).toBe("end");
    expect(s.turnsPlayed).toBe(8);
  });

  it("keeps rotating the clue givers in Play again", () => {
    let s = started();
    for (let i = 0; i < 8; i++) s = finish(run(s, turn()));
    s = run(s, [playAgain]);
    expect(s.phase).toBe("handoff");
    expect(s.scores).toEqual([0, 0]);
    expect(s.turnsPlayed).toBe(0);
    expect(scaleClueGiver(s)).toBe("Ann");
    s = finish(run(s, turn()));
    expect(scaleClueGiver(s)).toBe("Dan");
  });

  it("goes back to the setup on New game, the givers starting over", () => {
    let s = started();
    for (let i = 0; i < 8; i++) s = finish(run(s, turn()));
    s = run(s, [newGame]);
    expect(s.phase).toBe("setup");
    expect(s.setup).toEqual(valid);
    expect(s.clueGivers).toEqual([0, 0]);
    s = run(s, [start()]);
    expect(scaleClueGiver(s)).toBe("Ann");
  });
});

describe("Scale pairs", () => {
  it("never repeats a pair until every pair has been played", () => {
    let s = started();
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      s = run(s, turn(50, Math.random));
      seen.push(s.pair!.id);
      s = finish(s);
    }
    expect([...seen].sort()).toEqual(["en-1", "en-2", "en-3"]);
  });

  it("starts the list over when it runs out, without dealing the pair just played", () => {
    let s = started();
    for (let i = 0; i < 3; i++) s = finish(run(s, turn()));
    expect(s.used).toEqual(["en-1", "en-2", "en-3"]);
    s = run(s, [show()]);
    expect(s.pair!.id).toBe("en-1");
    expect(s.used).toEqual(["en-1"]);
    const last = { ...s, used: ["en-3", "en-1", "en-2"], pair: PAIRS[2], phase: "handoff" as const };
    const again = run(last, [show(zero)]);
    expect(again.pair!.id).toBe("en-1");
    expect(run(last, [show(() => 0.9999)]).pair!.id).toBe("en-2");
  });

  it("deals the only pair again when the list has one", () => {
    let s = started(valid, [PAIRS[0]]);
    s = finish(run(s, turn()));
    s = run(s, [show()]);
    expect(s.pair).toEqual(PAIRS[0]);
  });

  it("carries the pairs played into Play again", () => {
    let s = started();
    for (let i = 0; i < 2; i++) s = finish(run(s, turn()));
    for (let i = 0; i < 6; i++) s = finish(run(s, turn()));
    expect(run(s, [playAgain]).used).toEqual(s.used);
  });

  it("deals the pairs the device has not played in this language first", () => {
    const s = started(valid, PAIRS, ["en-1", "en-3"]);
    expect(s.used).toEqual(["en-1", "en-3"]);
    expect(run(s, [show(() => 0.9999)]).pair!.id).toBe("en-2");
  });

  it("starts a new game from the device's list, not the last game's", () => {
    let s = started();
    for (let i = 0; i < 8; i++) s = finish(run(s, turn()));
    const back = run(s, [newGame]);
    expect(run(back, [start(valid, PAIRS, ["en-2"])]).used).toEqual(["en-2"]);
  });

  it("clears the device's list once every pair of the language has been played", () => {
    const s = run(started(valid, PAIRS, ["en-1", "en-2", "en-3"]), [show()]);
    expect(s.used).toEqual([s.pair!.id]);
  });

  it("keeps the language the game was started in", () => {
    expect(started().lang).toBe("en");
    expect(run(fresh(), [start(valid, PAIRS, [], "tr")]).lang).toBe("tr");
  });

  it("names the device's list after the language", () => {
    expect(scaleSeenKey("tr")).toBe("scale_seen_tr");
    expect(scaleSeenKey("en")).toBe("scale_seen_en");
    expect(parseSavedScaleSeen('["en-1", 3, "en-1", "en-2"]')).toEqual(["en-1", "en-2"]);
    expect(parseSavedScaleSeen("{bad")).toEqual([]);
  });
});
