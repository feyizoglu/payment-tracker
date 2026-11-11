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
  TAP_GUARD_MS,
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
  // Each action lands a full second after the previous one, well clear of the tap guard.
  let now = 0;
  const at = () => (now += 1000);

  const started = (over: Partial<ImposterSetup> = {}): GameState =>
    gameReducer(initialGameState(), {
      type: "start",
      setup: setup({ category: "animals", ...over }),
      lang: "tr",
      rng: zero,
      at: at(),
    });

  function dealAll(state: GameState): GameState {
    let s = state;
    for (let i = 0; i < s.setup.players.length; i++) {
      s = gameReducer(s, { type: "reveal", at: at() });
      s = gameReducer(s, { type: "next", at: at() });
    }
    return s;
  }

  const voting = (over: Partial<ImposterSetup> = {}): GameState =>
    gameReducer(dealAll(started({ voting: true, scoreboard: true, ...over })), { type: "finishDiscussion", at: at() });

  function castVotes(state: GameState, targets: number[]): GameState {
    let s = state;
    for (const target of targets) {
      s = gameReducer(s, { type: "reveal", at: at() });
      s = gameReducer(s, { type: "vote", target, at: at() });
    }
    return s;
  }

  it("starts with no action recorded", () => {
    expect(initialGameState().lastActionAt).toBe(0);
  });

  it("ignores start while the setup is invalid", () => {
    const s0 = initialGameState();
    expect(gameReducer(s0, { type: "start", setup: setup({ players: ["A"] }), lang: "tr", rng: zero, at: at() })).toBe(s0);
  });

  it("starts dealing with trimmed names, zero scores and the first player", () => {
    const startedAt = at();
    const s = gameReducer(initialGameState(), {
      type: "start",
      setup: setup({ players: [" Ayşe ", "Mehmet", "Can"] }),
      lang: "tr",
      rng: zero,
      at: startedAt,
    });
    expect(s.phase).toBe("deal");
    expect(s.setup.players).toEqual(["Ayşe", "Mehmet", "Can"]);
    expect(s.scores).toEqual([0, 0, 0]);
    expect(s.turn).toBe(0);
    expect(s.revealed).toBe(false);
    expect(s.used).toHaveLength(1);
    expect(s.lastActionAt).toBe(startedAt);
  });

  it("only passes the phone on after the card was shown", () => {
    const s = started();
    expect(gameReducer(s, { type: "next", at: at() })).toBe(s);
    const shown = gameReducer(s, { type: "reveal", at: at() });
    expect(gameReducer(shown, { type: "next", at: at() })).toMatchObject({ turn: 1, revealed: false, phase: "deal" });
  });

  it("moves to discussion after the last card", () => {
    expect(dealAll(started()).phase).toBe("discuss");
  });

  it("goes straight to the result without voting", () => {
    const s = gameReducer(dealAll(started()), { type: "finishDiscussion", at: at() });
    expect(s).toMatchObject({ phase: "result", outcome: null });
  });

  it("collects one secret vote per player, rejects self-votes, then scores", () => {
    // rng 0 makes player 0 the only imposter.
    let s = voting();
    expect(s.phase).toBe("vote");
    s = gameReducer(s, { type: "reveal", at: at() });
    expect(gameReducer(s, { type: "vote", target: 0, at: at() })).toBe(s); // player 0 voting for self
    s = gameReducer(s, { type: "vote", target: 1, at: at() });
    s = castVotes(s, [0, 0, 0]);
    expect(s.phase).toBe("result");
    expect(s.votes).toEqual([1, 0, 0, 0]);
    expect(s.outcome).toEqual({ accused: 0, crewWins: true });
    expect(s.scores).toEqual([0, 1, 1, 1]);
  });

  it("gives the imposters the win when an innocent player is accused", () => {
    // Player 0 is the imposter; players 0, 2 and 3 accuse player 1.
    const s = castVotes(voting(), [1, 0, 1, 1]);
    expect(s.phase).toBe("result");
    expect(s.outcome).toEqual({ accused: 1, crewWins: false });
    expect(s.scores).toEqual([2, 0, 0, 0]);
  });

  it("accuses nobody on a tie", () => {
    const s = castVotes(voting(), [1, 0, 1, 0]);
    expect(s.outcome).toEqual({ accused: null, crewWins: false });
  });

  it("ignores a vote before the ballot is revealed", () => {
    const s = voting();
    expect(gameReducer(s, { type: "vote", target: 1, at: at() })).toBe(s);
  });

  it("ignores a vote for a player who does not exist", () => {
    const s = gameReducer(voting(), { type: "reveal", at: at() });
    expect(gameReducer(s, { type: "vote", target: 4, at: at() })).toBe(s);
    expect(gameReducer(s, { type: "vote", target: -1, at: at() })).toBe(s);
    expect(gameReducer(s, { type: "vote", target: 1.5, at: at() })).toBe(s);
  });

  it("keeps players and scores for the next round and avoids the same word", () => {
    let s = castVotes(voting(), [1, 0, 0, 0]);
    const firstWord = s.round!.entryId;
    s = gameReducer(s, { type: "nextRound", lang: "tr", rng: zero, at: at() });
    expect(s.phase).toBe("deal");
    expect(s.scores).toEqual([0, 1, 1, 1]);
    expect(s.round!.entryId).not.toBe(firstWord);
    expect(s.outcome).toBeNull();
  });

  it("ends back at setup, clearing scores but keeping the setup and used words", () => {
    const s = gameReducer(started(), { type: "end", at: at() });
    expect(s.phase).toBe("setup");
    expect(s.scores).toEqual([]);
    expect(s.setup.players).toEqual(["Ayşe", "Mehmet", "Can", "Deniz"]);
    expect(s.used).toHaveLength(1);
    expect(s.lastActionAt).toBe(0);
  });

  describe("tap guard", () => {
    const T = 10_000;
    const dealing = () =>
      gameReducer(initialGameState(), {
        type: "start",
        setup: setup({ category: "animals" }),
        lang: "tr",
        rng: zero,
        at: T,
      });

    it("ignores a next right after the card was shown", () => {
      const shown = gameReducer(dealing(), { type: "reveal", at: T + 1000 });
      expect(shown.lastActionAt).toBe(T + 1000);
      expect(gameReducer(shown, { type: "next", at: T + 1100 })).toBe(shown);
      expect(gameReducer(shown, { type: "next", at: T + 1000 + TAP_GUARD_MS - 1 })).toBe(shown);
      expect(gameReducer(shown, { type: "next", at: T + 1000 + TAP_GUARD_MS })).toMatchObject({
        turn: 1,
        revealed: false,
        lastActionAt: T + 1000 + TAP_GUARD_MS,
      });
    });

    it("ignores a reveal right after the phone was passed on", () => {
      const shown = gameReducer(dealing(), { type: "reveal", at: T + 1000 });
      const passed = gameReducer(shown, { type: "next", at: T + 2000 });
      expect(gameReducer(passed, { type: "reveal", at: T + 2100 })).toBe(passed);
      expect(gameReducer(passed, { type: "reveal", at: T + 2000 + TAP_GUARD_MS })).toMatchObject({
        turn: 1,
        revealed: true,
        lastActionAt: T + 2000 + TAP_GUARD_MS,
      });
    });

    it("ignores a reveal right after the game starts", () => {
      const s = dealing();
      expect(gameReducer(s, { type: "reveal", at: T + 100 })).toBe(s);
    });

    it("ignores a vote right after the ballot was opened", () => {
      const vote = voting();
      const openedAt = at();
      const ballot = gameReducer(vote, { type: "reveal", at: openedAt });
      expect(gameReducer(ballot, { type: "vote", target: 1, at: openedAt + 100 })).toBe(ballot);
      expect(gameReducer(ballot, { type: "vote", target: 1, at: openedAt + TAP_GUARD_MS })).toMatchObject({
        votes: [1],
        turn: 1,
        lastActionAt: openedAt + TAP_GUARD_MS,
      });
    });

    it("records finishDiscussion and nextRound so the following reveal is guarded too", () => {
      const discuss = dealAll(started({ voting: true }));
      const finishedAt = at();
      const ballot = gameReducer(discuss, { type: "finishDiscussion", at: finishedAt });
      expect(ballot.lastActionAt).toBe(finishedAt);
      expect(gameReducer(ballot, { type: "reveal", at: finishedAt + 100 })).toBe(ballot);

      const result = castVotes(ballot, [1, 0, 0, 0]);
      const nextAt = at();
      const next = gameReducer(result, { type: "nextRound", lang: "tr", rng: zero, at: nextAt });
      expect(next.lastActionAt).toBe(nextAt);
      expect(gameReducer(next, { type: "reveal", at: nextAt + 100 })).toBe(next);
    });

    it("ignores finishing the discussion right after the last card was passed on", () => {
      const s = started();
      let dealt = s;
      for (let i = 0; i < 4; i++) {
        dealt = gameReducer(dealt, { type: "reveal", at: at() });
        dealt = gameReducer(dealt, { type: "next", at: at() });
      }
      const lastNextAt = dealt.lastActionAt;
      expect(dealt.phase).toBe("discuss");
      expect(gameReducer(dealt, { type: "finishDiscussion", at: lastNextAt + 100 })).toBe(dealt);
      expect(gameReducer(dealt, { type: "finishDiscussion", at: lastNextAt + TAP_GUARD_MS }).phase).toBe("result");
    });

    it("ignores next round and end right after the last vote", () => {
      const result = castVotes(voting(), [1, 0, 0, 0]);
      const votedAt = result.lastActionAt;
      expect(result.phase).toBe("result");
      expect(gameReducer(result, { type: "nextRound", lang: "tr", rng: zero, at: votedAt + 100 })).toBe(result);
      expect(gameReducer(result, { type: "end", at: votedAt + 100 })).toBe(result);
      expect(gameReducer(result, { type: "nextRound", lang: "tr", rng: zero, at: votedAt + TAP_GUARD_MS }).phase).toBe("deal");
      expect(gameReducer(result, { type: "end", at: votedAt + TAP_GUARD_MS }).phase).toBe("setup");
    });
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
