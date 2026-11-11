import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETUP,
  IMPOSTER_WORDS,
  applyScore,
  dealRound,
  maxImposters,
  pickEntry,
  tallyVotes,
  validateSetup,
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
