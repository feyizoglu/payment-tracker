import { describe, it, expect } from "vitest";
import {
  CATEGORY_CHOICES,
  CATEGORY_EMOJI,
  GAME_THEME,
  MAX_PLAYERS,
  PLAYER_COLORS,
  SETUP_ERROR_KEYS,
  SETUP_STEPS,
  playerColor,
  stepErrors,
  type SetupError,
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

  it("tells the imposter their role and pair word when imposterKnows is on in similar-word mode", () => {
    const { round } = dealRound(
      setup({ category: "animals", mode: "similar-word", imposterKnows: true }),
      "tr",
      [],
      zero
    );
    expect(round.cards[0]).toEqual({ kind: "imposter", category: "animals", word: "Köpek" });
    expect(round.cards[1]).toEqual({ kind: "word", text: "Kedi" });
  });

  it("ignores imposterKnows in no-word mode", () => {
    const { round } = dealRound(setup({ category: "animals", imposterKnows: true }), "tr", [], zero);
    expect(round.cards[0]).toEqual({ kind: "imposter", category: "animals" });
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
    const game = started();
    const endedAt = at();
    const s = gameReducer(game, { type: "end", at: endedAt });
    expect(s.phase).toBe("setup");
    expect(s.scores).toEqual([]);
    expect(s.setup.players).toEqual(["Ayşe", "Mehmet", "Can", "Deniz"]);
    expect(s.used).toHaveLength(1);
    expect(s.lastActionAt).toBe(endedAt);
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

    it("accepts an action when the clock moved back after the last one", () => {
      const s = dealing();
      expect(gameReducer(s, { type: "reveal", at: T - 60_000 })).toMatchObject({
        revealed: true,
        lastActionAt: T - 60_000,
      });
      expect(gameReducer(s, { type: "end", at: T - 1 }).phase).toBe("setup");
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

    const startAt = (state: GameState, when: number) =>
      gameReducer(state, { type: "start", setup: setup({ category: "animals" }), lang: "tr", rng: zero, at: when });

    it("ignores a start right after the game was ended", () => {
      const endedAt = T + 1000;
      const ended = gameReducer(dealing(), { type: "end", at: endedAt });
      expect(ended.phase).toBe("setup");
      expect(startAt(ended, endedAt)).toBe(ended);
      expect(startAt(ended, endedAt + 100)).toBe(ended);
      expect(startAt(ended, endedAt + TAP_GUARD_MS - 1)).toBe(ended);
    });

    it("starts a new game once the tap guard after the end has passed", () => {
      const endedAt = T + 1000;
      const ended = gameReducer(dealing(), { type: "end", at: endedAt });
      expect(startAt(ended, endedAt + TAP_GUARD_MS)).toMatchObject({
        phase: "deal",
        turn: 0,
        lastActionAt: endedAt + TAP_GUARD_MS,
      });
      expect(startAt(ended, endedAt + 60_000).phase).toBe("deal");
    });

    it("starts the very first game whatever the time of day", () => {
      for (const when of [TAP_GUARD_MS, 1_800_000_000_000, 1_800_000_000_000 + TAP_GUARD_MS - 1]) {
        expect(startAt(initialGameState(), when)).toMatchObject({ phase: "deal", lastActionAt: when });
      }
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
      imposterKnows: true,
    });
    expect(parseSavedSetup(raw)).toEqual({
      players: ["Ayşe", "Can"],
      mode: "similar-word",
      category: "mixed",
      imposterCount: 1,
      timerMinutes: 5,
      voting: true,
      scoreboard: true,
      imposterKnows: true,
    });
  });

  it("defaults imposterKnows to off", () => {
    expect(DEFAULT_SETUP.imposterKnows).toBe(false);
    expect(parseSavedSetup(JSON.stringify({ imposterKnows: "yes" })).imposterKnows).toBe(false);
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

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("player colours", () => {
  it("has a distinct colour for every seat", () => {
    expect(PLAYER_COLORS).toHaveLength(MAX_PLAYERS);
    expect(new Set(PLAYER_COLORS).size).toBe(PLAYER_COLORS.length);
    for (const c of PLAYER_COLORS) expect(c).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("gives each seat its colour and wraps after the last one", () => {
    expect(playerColor(0)).toBe(PLAYER_COLORS[0]);
    expect(playerColor(11)).toBe(PLAYER_COLORS[11]);
    expect(playerColor(12)).toBe(PLAYER_COLORS[0]);
  });

  it("keeps dark text readable on every player colour and light text on the game background", () => {
    for (const c of PLAYER_COLORS) expect(contrast(c, GAME_THEME.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(GAME_THEME.text, GAME_THEME.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(GAME_THEME.muted, GAME_THEME.bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("category emoji", () => {
  it("has one distinct emoji per category choice", () => {
    expect(Object.keys(CATEGORY_EMOJI).sort()).toEqual([...CATEGORY_CHOICES].sort());
    for (const c of CATEGORY_CHOICES) expect(CATEGORY_EMOJI[c]).toBeTruthy();
    expect(new Set(Object.values(CATEGORY_EMOJI)).size).toBe(CATEGORY_CHOICES.length);
  });
});

describe("stepErrors", () => {
  it("returns nothing on any step for a valid setup", () => {
    for (const step of SETUP_STEPS) expect(stepErrors(setup(), step)).toEqual([]);
  });

  it("puts player errors on the players step", () => {
    expect(stepErrors(setup({ players: ["Ayşe", "ayşe", ""] }), "players")).toEqual(["blankName", "duplicateName"]);
    expect(stepErrors(setup({ players: ["A"] }), "players")).toEqual(["tooFewPlayers"]);
    const thirteen = Array.from({ length: 13 }, (_, i) => `P${i}`);
    expect(stepErrors(setup({ players: thirteen }), "players")).toEqual(["tooManyPlayers"]);
  });

  it("puts imposter count and scoreboard errors on the rules step", () => {
    const s = setup({ imposterCount: 3, scoreboard: true, voting: false });
    expect(stepErrors(s, "rules")).toEqual(["imposterCount", "scoreboardNeedsVoting"]);
    expect(stepErrors(s, "players")).toEqual([]);
  });

  it("has no errors of its own on the category step", () => {
    expect(stepErrors(setup({ players: [], imposterCount: 9, scoreboard: true }), "category")).toEqual([]);
  });

  it("assigns every setup error to exactly one step", () => {
    const few = setup({ players: [""], imposterCount: 9, scoreboard: true });
    const many = setup({ players: Array.from({ length: 13 }, (_, i) => (i < 2 ? "Same" : `P${i}`)) });
    const seen = new Set<SetupError>();
    for (const s of [few, many]) {
      const perStep = SETUP_STEPS.flatMap((step) => stepErrors(s, step));
      expect([...perStep].sort()).toEqual([...validateSetup(s)].sort());
      perStep.forEach((e) => seen.add(e));
    }
    expect([...seen].sort()).toEqual(Object.keys(SETUP_ERROR_KEYS).sort());
  });
});

describe("hold to see and the tap guard", () => {
  // No reducer change is needed for this; it pins the behaviour the hold card relies on.
  it("does not count a press inside the tap guard as seen, and counts the next one", () => {
    const dealt = gameReducer(initialGameState(), { type: "start", setup: setup(), lang: "en", rng: zero, at: 1000 });
    const early = gameReducer(dealt, { type: "reveal", at: 1000 + TAP_GUARD_MS - 1 });
    expect(early.revealed).toBe(false);
    const later = gameReducer(early, { type: "reveal", at: 1000 + TAP_GUARD_MS });
    expect(later.revealed).toBe(true);
  });
});
