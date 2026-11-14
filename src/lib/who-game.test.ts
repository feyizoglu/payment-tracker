import { describe, it, expect } from "vitest";
import type { WhoCard, WhoLevel, WhoRegion } from "./who-cards";
import type { WordCard } from "./word-game";
import {
  MAX_PLAYERS,
  WHO_DECK_MIN,
  WHO_SETUP_ERROR_KEYS,
  WHO_SETUP_STORAGE_KEY,
  WHO_SUMMARY_LOCK_MS,
  WHO_TAP_GUARD_MS,
  buildWhoDeck,
  defaultWhoSetup,
  initialWhoState,
  nameSize,
  parseSavedWhoSeen,
  parseSavedWhoSetup,
  sideName,
  totalTurns,
  turnPoints,
  whoGuesser,
  whoPool,
  whoReducer,
  whoRound,
  whoScores,
  whoSeenKey,
  whoSide,
  whoStepErrors,
  whoTimeLeft,
  whoSetupInLang,
  whoWinners,
  validateWhoSetup,
  type WhoAction,
  type WhoSetup,
  type WhoSources,
  type WhoState,
} from "./who-game";
import { translationsFor } from "./i18n";

const TEAM_NAMES = ["Team 1", "Team 2"] as const;
const EN = "en-US";
const TR = "tr-TR";
const T0 = 1_800_000_000_000;
const zero = () => 0;

function card(id: string, region: WhoRegion, level: WhoLevel): WhoCard {
  return { id, name: { tr: `TR ${id}`, en: `EN ${id}` }, hint: { tr: `ipucu ${id}`, en: `hint ${id}` }, region, level };
}

function many(prefix: string, n: number, region: WhoRegion, level: WhoLevel): WhoCard[] {
  return Array.from({ length: n }, (_, i) => card(`${prefix}-${i + 1}`, region, level));
}

function words(lang: string, category: string, n: number, level: WhoLevel = "easy"): WordCard[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${category}-${i + 1}`,
    word: `${lang} ${category} ${i + 1}`,
    forbidden: ["a", "b", "c", "d"],
    level: i % 2 === 0 ? level : "hard",
  }));
}

const sources: WhoSources = {
  people: [
    ...many("p-tr", 20, "tr", "easy"),
    ...many("p-trh", 10, "tr", "hard"),
    ...many("p-w", 40, "world", "easy"),
    ...many("p-wh", 20, "world", "hard"),
  ],
  characters: [...many("c-w", 30, "world", "easy"), ...many("c-tr", 5, "tr", "hard")],
  things: {
    en: { animals: words("en", "animals", 10), jobs: words("en", "jobs", 6), objects: words("en", "objects", 4) },
    tr: { animals: words("tr", "animals", 8), jobs: words("tr", "jobs", 2), objects: words("tr", "objects", 2) },
  },
};

const solo: WhoSetup = { ...defaultWhoSetup("en", TEAM_NAMES), players: ["Ann", "Bob", "Cem"], region: "mixed", rounds: 1 };
const teams: WhoSetup = {
  ...solo,
  mode: "teams",
  teams: [
    { name: "Red", players: ["Ann", "Bob"] },
    { name: "Blue", players: ["Cem", "Dan", "Eda"] },
  ],
  rounds: 2,
};

function run(state: WhoState, ...actions: WhoAction[]): WhoState {
  return actions.reduce(whoReducer, state);
}

function started(setup: WhoSetup = solo, seen: string[] = [], lang: "en" | "tr" = "en"): WhoState {
  return run(initialWhoState(setup), { type: "start", setup, lang, sources, seen, rng: zero, at: T0 });
}

/** Handoff → turn, one second after `state`'s last action. */
function begin(state: WhoState, at = state.lastActionAt + 1000): WhoState {
  return whoReducer(state, { type: "begin", rng: zero, at });
}

const answer = (result: "got" | "pass", at: number): WhoAction => ({ type: "answer", result, rng: zero, at });

describe("Who Am I? setup", () => {
  it("defaults to people and characters, mixed level, 60 s and 2 rounds, mixed region in Turkish and world in English", () => {
    const en = defaultWhoSetup("en", TEAM_NAMES);
    expect(en).toEqual({
      mode: "solo",
      players: [],
      teams: [
        { name: "Team 1", players: [] },
        { name: "Team 2", players: [] },
      ],
      kinds: ["people", "characters"],
      region: "world",
      level: "mixed",
      turnSeconds: 60,
      rounds: 2,
    });
    expect(defaultWhoSetup("tr", TEAM_NAMES).region).toBe("mixed");
  });

  it("names its storage keys, the seen list per language", () => {
    expect(WHO_SETUP_STORAGE_KEY).toBe("who_setup");
    expect(whoSeenKey("tr")).toBe("who_seen_tr");
    expect(whoSeenKey("en")).toBe("who_seen_en");
  });

  it("plays solo with 2 to 12 players", () => {
    expect(validateWhoSetup({ ...solo, players: ["Ann"] }, EN, 100)).toEqual(["tooFewPlayers"]);
    expect(validateWhoSetup({ ...solo, players: ["Ann", "Bob"] }, EN, 100)).toEqual([]);
    const twelve = Array.from({ length: MAX_PLAYERS }, (_, i) => `P${i}`);
    expect(validateWhoSetup({ ...solo, players: twelve }, EN, 100)).toEqual([]);
    expect(validateWhoSetup({ ...solo, players: [...twelve, "X"] }, EN, 100)).toEqual(["tooManyPlayers"]);
  });

  it("needs a different name for every solo player, compared with the app language's rules", () => {
    expect(validateWhoSetup({ ...solo, players: ["Ann", " "] }, EN, 100)).toEqual(["blankName"]);
    expect(validateWhoSetup({ ...solo, players: ["Ann", " ann "] }, EN, 100)).toEqual(["duplicateName"]);
    const names = { ...solo, players: ["Işık", "ışık"] };
    expect(validateWhoSetup(names, EN, 100)).toEqual([]);
    expect(validateWhoSetup(names, TR, 100)).toEqual(["duplicateName"]);
  });

  it("plays two teams of 2 to 8 with different team names, ignoring the solo list", () => {
    expect(validateWhoSetup({ ...teams, players: [] }, EN, 100)).toEqual([]);
    const small = { ...teams, teams: [{ name: "Red", players: ["Ann"] }, teams.teams[1]] as WhoSetup["teams"] };
    expect(validateWhoSetup(small, EN, 100)).toEqual(["teamSize"]);
    const big = { ...teams, teams: [teams.teams[0], { name: "Blue", players: Array.from({ length: 9 }, (_, i) => `B${i}`) }] as WhoSetup["teams"] };
    expect(validateWhoSetup(big, EN, 100)).toEqual(["teamSize"]);
    const same = { ...teams, teams: [teams.teams[0], { ...teams.teams[1], name: " red " }] as WhoSetup["teams"] };
    expect(validateWhoSetup(same, EN, 100)).toEqual(["sameTeamName"]);
    const blank = { ...teams, teams: [teams.teams[0], { ...teams.teams[1], name: "" }] as WhoSetup["teams"] };
    expect(validateWhoSetup(blank, EN, 100)).toEqual(["blankTeamName"]);
    const twice = { ...teams, teams: [teams.teams[0], { ...teams.teams[1], players: ["ann", "Dan"] }] as WhoSetup["teams"] };
    expect(validateWhoSetup(twice, EN, 100)).toEqual(["duplicateName"]);
    const empty = { ...teams, teams: [teams.teams[0], { ...teams.teams[1], players: ["Cem", ""] }] as WhoSetup["teams"] };
    expect(validateWhoSetup(empty, EN, 100)).toEqual(["blankName"]);
  });

  it("needs at least one kind, and a pool of at least 50 cards", () => {
    expect(validateWhoSetup({ ...solo, kinds: [] }, EN, 0)).toEqual(["noKinds"]);
    expect(validateWhoSetup(solo, EN, WHO_DECK_MIN - 1)).toEqual(["smallPool"]);
    expect(validateWhoSetup(solo, EN, WHO_DECK_MIN)).toEqual([]);
    expect(WHO_DECK_MIN).toBe(50);
  });

  it("needs a turn length of 30, 60 or 90 s and 1 to 3 rounds", () => {
    expect(validateWhoSetup({ ...solo, turnSeconds: 45 }, EN, 100)).toEqual(["rules"]);
    expect(validateWhoSetup({ ...solo, rounds: 4 }, EN, 100)).toEqual(["rules"]);
    expect(validateWhoSetup({ ...solo, turnSeconds: 90, rounds: 3 }, EN, 100)).toEqual([]);
  });

  it("gives each step only the errors it can fix", () => {
    const bad = { ...solo, players: ["Ann"], kinds: [], turnSeconds: 5 };
    expect(whoStepErrors(bad, "players", EN, 0)).toEqual(["tooFewPlayers"]);
    expect(whoStepErrors(bad, "cards", EN, 0)).toEqual(["noKinds"]);
    expect(whoStepErrors(bad, "rules", EN, 0)).toEqual(["rules"]);
    expect(whoStepErrors(solo, "cards", EN, 10)).toEqual(["smallPool"]);
  });

  it("has a string for every error", () => {
    const t = translationsFor("en");
    for (const key of Object.values(WHO_SETUP_ERROR_KEYS)) expect(t[key]).toBeTruthy();
    expect(translationsFor("tr").whoErrTooFew).toBe("En az 2 oyuncu ekle");
  });
});

describe("parseSavedWhoSetup", () => {
  const fallback = (lang: "en" | "tr") => defaultWhoSetup(lang, TEAM_NAMES);

  it("falls back to the language's defaults for nothing, garbage or a wrong shape", () => {
    expect(parseSavedWhoSetup(null, "en", TEAM_NAMES)).toEqual(fallback("en"));
    expect(parseSavedWhoSetup("{oops", "tr", TEAM_NAMES)).toEqual(fallback("tr"));
    expect(parseSavedWhoSetup("[1,2]", "en", TEAM_NAMES)).toEqual(fallback("en"));
    expect(parseSavedWhoSetup("null", "en", TEAM_NAMES)).toEqual(fallback("en"));
  });

  it("restores a saved setup as it was", () => {
    const saved: WhoSetup = { ...teams, kinds: ["things"], region: "tr", level: "hard", turnSeconds: 90, rounds: 3 };
    expect(parseSavedWhoSetup(JSON.stringify(saved), "en", TEAM_NAMES)).toEqual(saved);
  });

  it("keeps each valid field on its own", () => {
    const raw = JSON.stringify({
      mode: "duo",
      players: ["Ann", 3, "Bob"],
      teams: [{ name: "Red", players: ["Ann", null] }, "x"],
      kinds: ["things", "aliens", "people", "things"],
      region: "mars",
      level: "hard",
      turnSeconds: 45,
      rounds: 2,
    });
    expect(parseSavedWhoSetup(raw, "tr", TEAM_NAMES)).toEqual({
      ...fallback("tr"),
      players: ["Ann", "Bob"],
      teams: [
        { name: "Red", players: ["Ann"] },
        { name: "Team 2", players: [] },
      ],
      kinds: ["people", "things"],
      level: "hard",
      rounds: 2,
    });
  });

  it("keeps an empty kind list, as the setup shows it as an error", () => {
    expect(parseSavedWhoSetup(JSON.stringify({ kinds: [] }), "en", TEAM_NAMES).kinds).toEqual([]);
    expect(parseSavedWhoSetup(JSON.stringify({ kinds: "people" }), "en", TEAM_NAMES).kinds).toEqual(["people", "characters"]);
  });

  it("cuts lists that are too long", () => {
    const raw = JSON.stringify({ players: Array.from({ length: 20 }, (_, i) => `P${i}`) });
    expect(parseSavedWhoSetup(raw, "en", TEAM_NAMES).players).toHaveLength(MAX_PLAYERS);
  });

  it("reads a seen list fail-soft and without repeats", () => {
    expect(parseSavedWhoSeen(null)).toEqual([]);
    expect(parseSavedWhoSeen("nope")).toEqual([]);
    expect(parseSavedWhoSeen('{"a":1}')).toEqual([]);
    expect(parseSavedWhoSeen('["a", 2, "b", "a"]')).toEqual(["a", "b"]);
  });
});

describe("whoSetupInLang", () => {
  const tr = ["Takım 1", "Takım 2"] as const;

  it("moves the default team names and the default region to the new language", () => {
    expect(whoSetupInLang(defaultWhoSetup("en", TEAM_NAMES), "tr", tr, false)).toEqual(defaultWhoSetup("tr", tr));
    expect(whoSetupInLang(defaultWhoSetup("tr", tr), "en", TEAM_NAMES, false)).toEqual(defaultWhoSetup("en", TEAM_NAMES));
  });

  it("keeps a chosen region, renamed teams and everything else", () => {
    const own: WhoSetup = {
      ...defaultWhoSetup("en", TEAM_NAMES),
      players: ["Ann"],
      region: "world",
      teams: [
        { name: "Reds", players: ["Ann"] },
        { name: "Team 2", players: ["Bob"] },
      ],
      kinds: ["things"],
    };
    expect(whoSetupInLang(own, "tr", tr, true)).toEqual({
      ...own,
      teams: [
        { name: "Reds", players: ["Ann"] },
        { name: "Takım 2", players: ["Bob"] },
      ],
    });
  });
});

describe("whoPool", () => {
  const ids = (cards: { id: string }[]) => cards.map((c) => c.id);
  const choice = (patch: Partial<WhoSetup>) => ({ ...solo, ...patch });

  it("takes people and characters from the region and level chosen", () => {
    const tr = whoPool(choice({ kinds: ["people"], region: "tr", level: "easy" }), sources, "en");
    expect(ids(tr)).toEqual(ids(many("p-tr", 20, "tr", "easy")));
    const world = whoPool(choice({ kinds: ["characters"], region: "world", level: "mixed" }), sources, "en");
    expect(ids(world)).toEqual(ids(many("c-w", 30, "world", "easy")));
    expect(whoPool(choice({ kinds: ["people", "characters"], region: "mixed", level: "mixed" }), sources, "en")).toHaveLength(125);
    expect(whoPool(choice({ kinds: ["people"], region: "mixed", level: "hard" }), sources, "en")).toHaveLength(30);
  });

  it("shows the name and hint in the game's language", () => {
    const [first] = whoPool(choice({ kinds: ["people"], region: "tr", level: "easy" }), sources, "tr");
    expect(first).toEqual({ id: "p-tr-1", name: "TR p-tr-1", hint: "ipucu p-tr-1" });
    expect(whoPool(choice({ kinds: ["people"], region: "tr", level: "easy" }), sources, "en")[0]).toEqual({
      id: "p-tr-1",
      name: "EN p-tr-1",
      hint: "hint p-tr-1",
    });
  });

  it("takes things from the passed lists in the game's language, by level only, hinted with their category", () => {
    const en = whoPool(choice({ kinds: ["things"], region: "tr", level: "mixed" }), sources, "en");
    expect(en).toHaveLength(20);
    expect(en[0]).toEqual({ id: "things:animals-1", name: "en animals 1", hint: translationsFor("en").imposterCategoryAnimals });
    expect(en.find((c) => c.id === "things:jobs-1")!.hint).toBe(translationsFor("en").imposterCategoryJobs);
    expect(en.find((c) => c.id === "things:objects-1")!.hint).toBe(translationsFor("en").imposterCategoryObjects);
    const tr = whoPool(choice({ kinds: ["things"], level: "easy" }), sources, "tr");
    expect(tr.map((c) => c.name)).toEqual(["tr animals 1", "tr animals 3", "tr animals 5", "tr animals 7", "tr jobs 1", "tr objects 1"]);
    expect(tr[0].hint).toBe("Hayvanlar");
  });

  it("is empty with no kinds", () => {
    expect(whoPool(choice({ kinds: [] }), sources, "en")).toEqual([]);
  });
});

describe("buildWhoDeck", () => {
  const pool = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, name: `N${i}`, hint: "h" }));

  it("deals the unseen cards first and keeps the seen list while 50 or more are unseen", () => {
    const seen = ["c0", "c1", "c2", "other"];
    const { deck, seen: next } = buildWhoDeck(pool, seen, zero);
    expect(deck).toHaveLength(60);
    expect(new Set(deck.slice(0, 57).map((c) => c.id)).has("c0")).toBe(false);
    expect(deck.slice(57).map((c) => c.id).sort()).toEqual(["c0", "c1", "c2"]);
    expect(next).toEqual(seen);
  });

  it("forgets the pool's part of the seen list when fewer than 50 are unseen", () => {
    const seen = [...pool.slice(0, 11).map((c) => c.id), "other"];
    const { deck, seen: next } = buildWhoDeck(pool, seen, zero);
    expect(deck.slice(0, 49).every((c) => !seen.includes(c.id))).toBe(true);
    expect(next).toEqual(["other"]);
  });

  it("shuffles with the injected rng", () => {
    const a = buildWhoDeck(pool, [], () => 0.5).deck.map((c) => c.id);
    const b = buildWhoDeck(pool, [], () => 0.5).deck.map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(pool.map((c) => c.id));
  });
});

describe("Who Am I? game: start", () => {
  it("refuses an invalid setup or a pool under 50 cards", () => {
    expect(started({ ...solo, players: ["Ann"] }).phase).toBe("setup");
    expect(started({ ...solo, kinds: ["things"] }).phase).toBe("setup");
    expect(started({ ...solo, kinds: ["characters"], region: "world" }).phase).toBe("setup");
    expect(started({ ...solo, kinds: ["people"], region: "world" }).phase).toBe("handoff");
  });

  it("deals in the game's language with trimmed names, the first player first", () => {
    const state = started({ ...solo, players: [" Ann ", "Bob"] }, [], "tr");
    expect(state).toMatchObject({ phase: "handoff", lang: "tr", turnsPlayed: 0, scores: [0, 0] });
    expect(state.setup.players).toEqual(["Ann", "Bob"]);
    expect(state.pool).toHaveLength(125);
    expect(state.deck[0].name.startsWith("TR ")).toBe(true);
    expect(whoGuesser(state)).toBe("Ann");
  });

  it("starts with the device's seen list, dealing unseen cards first", () => {
    const seen = ["p-tr-1", "p-tr-2"];
    const state = started(solo, seen);
    expect(state.seen).toEqual(seen);
    expect(state.deck.slice(0, 123).some((c) => seen.includes(c.id))).toBe(false);
  });

  it("ignores a second tap on Start", () => {
    const state = started();
    expect(whoReducer(state, { type: "start", setup: solo, lang: "en", sources, seen: [], rng: zero, at: T0 + 10 })).toBe(state);
  });
});

describe("Who Am I? game: a turn", () => {
  it("shows the first card and runs the turn's clock from Start", () => {
    const state = begin(started());
    expect(state.phase).toBe("turn");
    expect(state.card).not.toBeNull();
    expect(state.seen).toEqual([state.card!.id]);
    expect(state.turnMs).toBe(60_000);
    expect(whoTimeLeft(state, state.lastActionAt + 15_500)).toBe(44_500);
  });

  it("keeps the handoff for a tap within 400 ms", () => {
    const state = started();
    expect(begin(state, T0 + WHO_TAP_GUARD_MS - 1)).toBe(state);
    expect(begin(state, T0 + WHO_TAP_GUARD_MS).phase).toBe("turn");
  });

  it("scores Got it, not Pass, and shows the next card at once", () => {
    let state = begin(started());
    const at = state.lastActionAt;
    const first = state.card!;
    state = whoReducer(state, answer("got", at + 1000));
    const second = state.card!;
    expect(second.id).not.toBe(first.id);
    state = whoReducer(state, answer("pass", at + 2000));
    expect(state.results).toEqual([
      { card: first, result: "got" },
      { card: second, result: "pass" },
    ]);
    expect(state.seen).toEqual([first.id, second.id, state.card!.id]);
    expect(turnPoints(state.results)).toBe(1);
  });

  it("ignores a tap within 400 ms of the last one", () => {
    let state = begin(started());
    const at = state.lastActionAt;
    state = whoReducer(state, answer("got", at + 1000));
    expect(whoReducer(state, answer("got", at + 1000 + WHO_TAP_GUARD_MS - 1))).toBe(state);
    expect(whoReducer(state, answer("got", at + 1000 + WHO_TAP_GUARD_MS)).results).toHaveLength(2);
  });

  it("ends the turn only when its on-screen time has run out, the card on screen counting as passed", () => {
    let state = begin(started());
    const at = state.lastActionAt;
    state = whoReducer(state, answer("got", at + 5000));
    const onScreen = state.card!;
    expect(whoReducer(state, { type: "tick", at: at + 59_999 })).toBe(state);
    state = whoReducer(state, { type: "tick", at: at + 60_000 });
    expect(state.phase).toBe("summary");
    expect(state.card).toBeNull();
    expect(state.results.at(-1)).toEqual({ card: onScreen, result: "pass" });
    expect(state.lastActionAt).toBe(at + 60_000);
    expect(whoTimeLeft(state, at + 70_000)).toBe(0);
  });

  it("ends the turn on a tap at or after its end instead of scoring it", () => {
    let state = begin(started());
    const at = state.lastActionAt;
    const onScreen = state.card!;
    state = whoReducer(state, answer("got", at + 60_000));
    expect(state.phase).toBe("summary");
    expect(state.results).toEqual([{ card: onScreen, result: "pass" }]);
  });

  it("leaves a late tap within 400 ms to the next tick", () => {
    let state = begin(started());
    const at = state.lastActionAt;
    state = whoReducer(state, answer("got", at + 59_800));
    expect(whoReducer(state, answer("got", at + 60_100))).toBe(state);
    expect(whoReducer(state, { type: "tick", at: at + 60_100 }).phase).toBe("summary");
  });

  it("does not count time off screen", () => {
    let state = begin(started());
    const at = state.lastActionAt;
    state = run(state, { type: "pause", at: at + 10_000 }, { type: "pause", at: at + 20_000 });
    expect(whoTimeLeft(state, at + 500_000)).toBe(50_000);
    expect(whoReducer(state, { type: "tick", at: at + 500_000 })).toBe(state);
    state = run(state, { type: "resume", at: at + 500_000 }, { type: "resume", at: at + 501_000 });
    expect(whoReducer(state, { type: "tick", at: at + 549_999 }).phase).toBe("turn");
    expect(whoReducer(state, { type: "tick", at: at + 550_000 }).phase).toBe("summary");
  });

  it("lets the clock's actions through right after a tap, without guarding the next tap", () => {
    let state = begin(started());
    const at = state.lastActionAt;
    state = run(state, answer("got", at + 1000), { type: "pause", at: at + 1001 }, { type: "resume", at: at + 1002 });
    expect(state.runningSince).toBe(at + 1002);
    expect(state.lastActionAt).toBe(at + 1000);
  });

  it("refills the deck from the whole pool when it runs out, never with the card just shown", () => {
    let state = begin(started({ ...solo, kinds: ["people"], region: "world", level: "mixed", turnSeconds: 90 }));
    expect(state.pool).toHaveLength(60);
    let at = state.lastActionAt;
    for (let i = 0; i < 59; i++) state = whoReducer(state, answer("pass", (at += 500)));
    const last = state.card!;
    expect(state.deck).toHaveLength(0);
    state = whoReducer(state, answer("pass", (at += 500)));
    expect(state.card).not.toBeNull();
    expect(state.card!.id).not.toBe(last.id);
    expect(state.deck).toHaveLength(59);
    expect(state.deck.at(-1)!.id).toBe(last.id);
  });
});

describe("Who Am I? game: summary and order", () => {
  function playTurn(state: WhoState, results: ("got" | "pass")[]): WhoState {
    let next = begin(state);
    let at = next.lastActionAt;
    for (const r of results) next = whoReducer(next, answer(r, (at += 1000)));
    return whoReducer(next, { type: "tick", at: next.lastActionAt + next.turnMs });
  }
  const next = (state: WhoState) => whoReducer(state, { type: "next", at: state.lastActionAt + WHO_SUMMARY_LOCK_MS });

  it("flips a card's mark and counts the score from the marks", () => {
    let state = playTurn(started(), ["got", "pass"]);
    expect(whoScores(state)).toEqual([1, 0, 0]);
    state = whoReducer(state, { type: "flip", index: 1, at: state.lastActionAt + WHO_SUMMARY_LOCK_MS });
    expect(state.results.map((r) => r.result)).toEqual(["got", "got", "pass"]);
    expect(whoScores(state)).toEqual([2, 0, 0]);
    state = whoReducer(state, { type: "flip", index: 0, at: state.lastActionAt + 1000 });
    expect(whoScores(state)).toEqual([1, 0, 0]);
    expect(whoReducer(state, { type: "flip", index: 9, at: state.lastActionAt + 1000 })).toBe(state);
    state = next(state);
    expect(state.scores).toEqual([1, 0, 0]);
    expect(whoScores(state)).toEqual([1, 0, 0]);
  });

  it("locks the summary for 1.5 s after the turn ends, so a blind tap cannot flip a card or skip it", () => {
    expect(WHO_SUMMARY_LOCK_MS).toBe(1500);
    let state = begin(started());
    const end = state.lastActionAt + state.turnMs;
    state = whoReducer(state, { type: "tick", at: end });
    expect(state.endedAt).toBe(end);
    for (const at of [end, end + WHO_TAP_GUARD_MS, end + WHO_SUMMARY_LOCK_MS - 1]) {
      expect(whoReducer(state, { type: "flip", index: 0, at })).toBe(state);
      expect(whoReducer(state, { type: "next", at })).toBe(state);
    }
    expect(whoReducer(state, { type: "flip", index: 0, at: end + WHO_SUMMARY_LOCK_MS }).results[0].result).toBe("got");
    expect(whoReducer(state, { type: "next", at: end + WHO_SUMMARY_LOCK_MS }).phase).toBe("handoff");
  });

  it("locks the summary from a late tap that ended the turn, too", () => {
    let state = begin(started());
    const end = state.lastActionAt + state.turnMs;
    state = whoReducer(state, answer("got", end + 50));
    expect(state).toMatchObject({ phase: "summary", endedAt: end + 50 });
    expect(whoReducer(state, { type: "next", at: end + 50 + WHO_SUMMARY_LOCK_MS - 1 })).toBe(state);
    expect(whoReducer(state, { type: "next", at: end + 50 + WHO_SUMMARY_LOCK_MS }).phase).toBe("handoff");
  });

  it("keeps the tap guard between flips once the lock is over", () => {
    let state = begin(started());
    const end = state.lastActionAt + state.turnMs;
    state = whoReducer(state, { type: "tick", at: end });
    state = whoReducer(state, { type: "flip", index: 0, at: end + 2000 });
    expect(whoReducer(state, { type: "flip", index: 0, at: end + 2000 + WHO_TAP_GUARD_MS - 1 })).toBe(state);
    expect(whoReducer(state, { type: "next", at: end + 2000 + WHO_TAP_GUARD_MS }).phase).toBe("handoff");
  });

  it("gives every solo player one turn per round, then ends", () => {
    let state = started({ ...solo, rounds: 2 });
    expect(totalTurns(state.setup)).toBe(6);
    const order: string[] = [];
    const rounds: number[] = [];
    while (state.phase === "handoff") {
      order.push(whoGuesser(state));
      rounds.push(whoRound(state));
      state = next(playTurn(state, ["got"]));
    }
    expect(order).toEqual(["Ann", "Bob", "Cem", "Ann", "Bob", "Cem"]);
    expect(rounds).toEqual([1, 1, 1, 2, 2, 2]);
    expect(state.phase).toBe("end");
    expect(state.scores).toEqual([2, 2, 2]);
  });

  it("gives every team one turn per round and rotates its guesser", () => {
    let state = started(teams);
    expect(totalTurns(state.setup)).toBe(4);
    const order: [number, string][] = [];
    let i = 0;
    while (state.phase === "handoff") {
      order.push([whoSide(state), whoGuesser(state)]);
      state = next(playTurn(state, i++ === 0 ? ["got", "got"] : ["got"]));
    }
    expect(order).toEqual([
      [0, "Ann"],
      [1, "Cem"],
      [0, "Bob"],
      [1, "Dan"],
    ]);
    expect(state.phase).toBe("end");
    expect(state.scores).toEqual([3, 2]);
    expect(whoWinners(state.scores)).toEqual([0]);
  });

  it("names every top scorer, so more than one means a tie", () => {
    expect(whoWinners([1, 3, 3])).toEqual([1, 2]);
    expect(whoWinners([0, 0])).toEqual([0, 1]);
    expect(whoWinners([2, 5, 1])).toEqual([1]);
  });

  it("plays again with the same setup and the seen list, or goes back to the setup", () => {
    let state = next(playTurn(started({ ...solo, players: ["Ann", "Bob"], rounds: 1 }), ["got"]));
    state = next(playTurn(state, ["pass"]));
    expect(state.phase).toBe("end");
    const seen = state.seen;
    const again = whoReducer(state, { type: "playAgain", rng: zero, at: state.lastActionAt + 1000 });
    expect(again).toMatchObject({ phase: "handoff", turnsPlayed: 0, scores: [0, 0], setup: state.setup, seen });
    expect(again.deck.slice(0, again.deck.length - seen.length).some((c) => seen.includes(c.id))).toBe(false);
    expect(whoReducer(state, { type: "playAgain", rng: zero, at: state.lastActionAt + 1 })).toBe(state);
    const fresh = whoReducer(state, { type: "newGame", at: state.lastActionAt + 1000 });
    expect(fresh).toMatchObject({ phase: "setup", setup: state.setup, lastActionAt: state.lastActionAt + 1000 });
  });

  it("ignores actions that do not belong to the phase", () => {
    const state = started();
    expect(whoReducer(state, answer("got", T0 + 5000))).toBe(state);
    expect(whoReducer(state, { type: "tick", at: T0 + 500_000 })).toBe(state);
    expect(whoReducer(state, { type: "next", at: T0 + 5000 })).toBe(state);
    expect(whoReducer(state, { type: "flip", index: 0, at: T0 + 5000 })).toBe(state);
    expect(whoReducer(state, { type: "newGame", at: T0 + 5000 })).toBe(state);
    expect(whoReducer(initialWhoState(solo), { type: "begin", rng: zero, at: T0 })).toEqual(initialWhoState(solo));
  });
});

describe("nameSize", () => {
  it("steps the name down as it gets longer or has a longer word", () => {
    expect(nameSize("Messi")).toBe("xl");
    expect(nameSize("Marie Curie")).toBe("lg");
    expect(nameSize("Rumpelstiltskin")).toBe("md");
    expect(nameSize("Leonardo da Vinci")).toBe("lg");
    expect(nameSize("Wolfgang Amadeus Mozart")).toBe("md");
    expect(nameSize("Mustafa Kemal Atatürk Kız Lisesi Müdürü")).toBe("sm");
  });
});

describe("sideName", () => {
  const setup: WhoSetup = {
    ...defaultWhoSetup("en", TEAM_NAMES),
    players: ["Ann", "Bob", "Cem"],
    teams: [
      { name: "Red", players: ["Dan", "Eda"] },
      { name: "Blue", players: ["Fay", "Gul"] },
    ],
  };

  it("names the player in solo", () => {
    expect(sideName({ ...setup, mode: "solo" }, 1)).toBe("Bob");
  });

  it("names the team in teams", () => {
    expect(sideName({ ...setup, mode: "teams" }, 1)).toBe("Blue");
  });
});
