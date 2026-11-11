import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETUP,
  IMPOSTER_WORDS,
  applyScore,
  dealRound,
  formatCountdown,
  gameReducer,
  initialGameState,
  maxImposters,
  parseSavedSetup,
  pickEntry,
  remainingSeconds,
  tallyVotes,
  validateSetup,
  type GameState,
  type ImposterSetup,
} from "@/lib/imposter";

const zero = () => 0;
// Returns the given values in order, then repeats the last one.
function seq(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const setup = (over: Partial<ImposterSetup> = {}): ImposterSetup => ({
  ...DEFAULT_SETUP,
  players: ["Ayşe", "Mehmet", "Can", "Deniz"],
  ...over,
});

describe("maxImposters", () => {
  it("keeps imposters a minority and caps at 3", () => {
    expect(maxImposters(2)).toBe(0);
    expect(maxImposters(3)).toBe(1);
    expect(maxImposters(4)).toBe(1);
    expect(maxImposters(5)).toBe(2);
    expect(maxImposters(7)).toBe(3);
    expect(maxImposters(12)).toBe(3);
  });
});

describe("validateSetup", () => {
  it("accepts a valid setup", () => {
    expect(validateSetup(setup())).toEqual([]);
  });

  it("flags too few and too many players", () => {
    expect(validateSetup(setup({ players: ["A", "B"] }))).toEqual(["tooFewPlayers"]);
    const thirteen = Array.from({ length: 13 }, (_, i) => `P${i}`);
    expect(validateSetup(setup({ players: thirteen }))).toContain("tooManyPlayers");
  });

  it("flags blank and duplicate names (trimmed, case-insensitive)", () => {
    expect(validateSetup(setup({ players: ["A", " ", "B"] }))).toContain("blankName");
    expect(validateSetup(setup({ players: ["Ali", "ali ", "B"] }))).toContain("duplicateName");
  });

  it("flags an imposter count above the limit", () => {
    expect(validateSetup(setup({ imposterCount: 2 }))).toEqual(["imposterCount"]);
    expect(validateSetup(setup({ imposterCount: 0 }))).toEqual(["imposterCount"]);
  });

  it("flags a scoreboard without voting", () => {
    expect(validateSetup(setup({ scoreboard: true, voting: false }))).toEqual(["scoreboardNeedsVoting"]);
  });
});

describe("pickEntry", () => {
  it("picks from the chosen category and records it as used", () => {
    const picked = pickEntry("food", [], zero);
    expect(picked).toEqual({ id: "food:0", category: "food", index: 0, used: ["food:0"] });
  });

  it("skips used entries", () => {
    expect(pickEntry("food", ["food:0"], zero).id).toBe("food:1");
  });

  it("resets only that category's used ids once it runs out", () => {
    const allFood = IMPOSTER_WORDS.food.map((_, i) => `food:${i}`);
    const picked = pickEntry("food", ["animals:3", ...allFood], zero);
    expect(picked.id).toBe("food:0");
    expect(picked.used).toEqual(["animals:3", "food:0"]);
  });

  it("draws from every category in mixed mode", () => {
    const total = Object.values(IMPOSTER_WORDS).reduce((n, list) => n + list.length, 0);
    expect(pickEntry("mixed", [], () => 0.999999).id).toBe(`sports:${IMPOSTER_WORDS.sports.length - 1}`);
    expect(pickEntry("mixed", [], zero).id).toBe("animals:0");
    expect(total).toBeGreaterThanOrEqual(240);
  });
});

describe("dealRound", () => {
  it("gives the word to the crew and the category to the imposter in no-word mode", () => {
    const { round, used } = dealRound(setup({ category: "animals" }), "tr", [], zero);
    expect(round.word).toBe("Kedi");
    expect(round.pair).toBe("Köpek");
    expect(round.imposters).toEqual([0]);
    expect(round.cards[0]).toEqual({ kind: "imposter", category: "animals" });
    expect(round.cards.slice(1)).toEqual([
      { kind: "word", text: "Kedi" },
      { kind: "word", text: "Kedi" },
      { kind: "word", text: "Kedi" },
    ]);
    expect(round.starter).toBe(0);
    expect(used).toEqual(["animals:0"]);
  });

  it("gives the imposter the pair word in similar-word mode, in the app language", () => {
    const { round } = dealRound(setup({ category: "animals", mode: "similar-word" }), "en", [], zero);
    expect(round.cards[0]).toEqual({ kind: "word", text: "Dog" });
    expect(round.cards[1]).toEqual({ kind: "word", text: "Cat" });
  });

  it("picks the requested number of distinct imposters and a starter in range", () => {
    const five = setup({ players: ["A", "B", "C", "D", "E"], imposterCount: 2 });
    // entry, imposter swap 1, imposter swap 2, starter
    const { round } = dealRound(five, "tr", [], seq(0, 0.99, 0.99, 0.5));
    expect(round.imposters).toHaveLength(2);
    expect(new Set(round.imposters).size).toBe(2);
    expect(round.imposters.every((i) => i >= 0 && i < 5)).toBe(true);
    expect(round.cards.filter((c) => c.kind === "imposter")).toHaveLength(2);
    expect(round.starter).toBe(2);
  });
});

describe("tallyVotes", () => {
  it("accuses the single top-voted player; crew wins if they are an imposter", () => {
    expect(tallyVotes([2, 2, 0, 2], 4, [2])).toEqual({ counts: [1, 0, 3, 0], accused: 2, crewWins: true });
  });

  it("imposters win when an innocent player is accused", () => {
    expect(tallyVotes([1, 0, 1, 1], 4, [2])).toMatchObject({ accused: 1, crewWins: false });
  });

  it("imposters win on a tie", () => {
    expect(tallyVotes([1, 0, 1, 0], 4, [2])).toMatchObject({ accused: null, crewWins: false });
  });
});

describe("applyScore", () => {
  it("gives every innocent +1 when the crew wins", () => {
    expect(applyScore([0, 0, 0, 0], [2], true)).toEqual([1, 1, 0, 1]);
  });

  it("gives every imposter +2 when the imposters win", () => {
    expect(applyScore([1, 1, 0, 1], [0, 2], false)).toEqual([3, 1, 2, 1]);
  });
});

describe("gameReducer", () => {
  const started = (over: Partial<ImposterSetup> = {}): GameState =>
    gameReducer(initialGameState(), { type: "start", setup: setup({ category: "animals", ...over }), lang: "tr", rng: zero });

  function dealAll(state: GameState): GameState {
    let s = state;
    for (let i = 0; i < s.setup.players.length; i++) {
      s = gameReducer(s, { type: "reveal" });
      s = gameReducer(s, { type: "next" });
    }
    return s;
  }

  it("ignores start while the setup is invalid", () => {
    const s0 = initialGameState();
    expect(gameReducer(s0, { type: "start", setup: setup({ players: ["A"] }), lang: "tr", rng: zero })).toBe(s0);
  });

  it("starts dealing with trimmed names, zero scores and the first player", () => {
    const s = gameReducer(initialGameState(), {
      type: "start",
      setup: setup({ players: [" Ayşe ", "Mehmet", "Can"] }),
      lang: "tr",
      rng: zero,
    });
    expect(s.phase).toBe("deal");
    expect(s.setup.players).toEqual(["Ayşe", "Mehmet", "Can"]);
    expect(s.scores).toEqual([0, 0, 0]);
    expect(s.turn).toBe(0);
    expect(s.revealed).toBe(false);
    expect(s.used).toHaveLength(1);
  });

  it("only passes the phone on after the card was shown", () => {
    const s = started();
    expect(gameReducer(s, { type: "next" })).toBe(s);
    const shown = gameReducer(s, { type: "reveal" });
    expect(gameReducer(shown, { type: "next" })).toMatchObject({ turn: 1, revealed: false, phase: "deal" });
  });

  it("moves to discussion after the last card", () => {
    expect(dealAll(started()).phase).toBe("discuss");
  });

  it("goes straight to the result without voting", () => {
    const s = gameReducer(dealAll(started()), { type: "finishDiscussion" });
    expect(s).toMatchObject({ phase: "result", outcome: null });
  });

  it("collects one secret vote per player, rejects self-votes, then scores", () => {
    // rng 0 makes player 0 the only imposter.
    let s = gameReducer(dealAll(started({ voting: true, scoreboard: true })), { type: "finishDiscussion" });
    expect(s.phase).toBe("vote");
    s = gameReducer(s, { type: "reveal" });
    expect(gameReducer(s, { type: "vote", target: 0 })).toBe(s); // player 0 voting for self
    s = gameReducer(s, { type: "vote", target: 1 });
    for (let voter = 1; voter < 4; voter++) {
      s = gameReducer(s, { type: "reveal" });
      s = gameReducer(s, { type: "vote", target: 0 });
    }
    expect(s.phase).toBe("result");
    expect(s.votes).toEqual([1, 0, 0, 0]);
    expect(s.outcome).toEqual({ accused: 0, crewWins: true });
    expect(s.scores).toEqual([0, 1, 1, 1]);
  });

  it("keeps players and scores for the next round and avoids the same word", () => {
    let s = gameReducer(dealAll(started({ voting: true, scoreboard: true })), { type: "finishDiscussion" });
    for (let voter = 0; voter < 4; voter++) {
      s = gameReducer(s, { type: "reveal" });
      s = gameReducer(s, { type: "vote", target: voter === 0 ? 1 : 0 });
    }
    const firstWord = s.round!.entryId;
    s = gameReducer(s, { type: "nextRound", lang: "tr", rng: zero });
    expect(s.phase).toBe("deal");
    expect(s.scores).toEqual([0, 1, 1, 1]);
    expect(s.round!.entryId).not.toBe(firstWord);
    expect(s.outcome).toBeNull();
  });

  it("ends back at setup, clearing scores but keeping the setup and used words", () => {
    const s = gameReducer(started(), { type: "end" });
    expect(s.phase).toBe("setup");
    expect(s.scores).toEqual([]);
    expect(s.setup.players).toEqual(["Ayşe", "Mehmet", "Can", "Deniz"]);
    expect(s.used).toHaveLength(1);
  });
});

describe("parseSavedSetup", () => {
  it("returns the defaults for missing or broken data", () => {
    expect(parseSavedSetup(null)).toEqual(DEFAULT_SETUP);
    expect(parseSavedSetup("{not json")).toEqual(DEFAULT_SETUP);
    expect(parseSavedSetup("42")).toEqual(DEFAULT_SETUP);
  });

  it("keeps valid fields and replaces invalid ones", () => {
    const raw = JSON.stringify({
      players: ["Ayşe", 7, "Can"],
      mode: "similar-word",
      category: "space",
      imposterCount: 9,
      timerMinutes: 5,
      voting: true,
      scoreboard: true,
    });
    expect(parseSavedSetup(raw)).toEqual({
      players: ["Ayşe", "Can"],
      mode: "similar-word",
      category: "mixed",
      imposterCount: 1,
      timerMinutes: 5,
      voting: true,
      scoreboard: true,
    });
  });

  it("drops the scoreboard when voting is off", () => {
    expect(parseSavedSetup(JSON.stringify({ voting: false, scoreboard: true })).scoreboard).toBe(false);
  });
});

describe("countdown helpers", () => {
  it("rounds remaining time up to whole seconds and never goes negative", () => {
    expect(remainingSeconds(10_000, 0)).toBe(10);
    expect(remainingSeconds(10_000, 9_001)).toBe(1);
    expect(remainingSeconds(10_000, 12_000)).toBe(0);
  });

  it("formats m:ss", () => {
    expect(formatCountdown(600)).toBe("10:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(0)).toBe("0:00");
  });
});
