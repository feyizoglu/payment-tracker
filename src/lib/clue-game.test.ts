import { describe, it, expect } from "vitest";
import { WORD_CATEGORIES, type WordCard, type WordCategory, type WordLevel } from "./word-game";
import {
  CLUE_ANSWER_KEYS,
  CLUE_CATEGORIES,
  CLUE_ERROR_KEYS,
  CLUE_LEVEL_KEYS,
  CLUE_MAX_LENGTH,
  CLUE_MAX_PLAYERS,
  CLUE_OUTCOME_KEYS,
  CLUE_RATING_KEYS,
  CLUE_SETUP_ERROR_KEYS,
  CLUE_SETUP_STORAGE_KEY,
  CLUE_STRIKE_KEYS,
  CLUE_TAP_GUARD_MS,
  autoStrikes,
  buildClueDeck,
  clueGiverSeat,
  clueGiverSeats,
  clueGuesser,
  clueGuesserSeat,
  clueKey,
  cluePool,
  clueRating,
  clueReducer,
  clueScore,
  clueStrikeReason,
  clueSeenKey,
  clueStepErrors,
  clueWord,
  defaultClueSetup,
  initialClueState,
  parseSavedClueSeen,
  parseSavedClueSetup,
  survivingClues,
  validateClue,
  validateClueSetup,
  type ClueAction,
  type ClueSetup,
  type ClueState,
  type WordSource,
} from "./clue-game";
import { translationsFor } from "./i18n";

const EN = "en-US";
const TR = "tr-TR";
const T0 = 1_800_000_000_000;
const zero = () => 0;

function card(category: WordCategory, n: number, word: string, level: WordLevel): WordCard {
  return { id: `${category}-${n}`, word, level, forbidden: ["a", "b", "c", "d"] };
}

function source(lists: Partial<Record<WordCategory, WordCard[]>>): WordSource {
  return Object.fromEntries(WORD_CATEGORIES.map((c) => [c, lists[c] ?? []])) as unknown as WordSource;
}

const ANIMALS = ["Cat", "Dog", "Cow", "Horse", "Pig", "Sheep", "Goat", "Duck", "Rabbit", "Mouse"];
const FOOD = ["Bread", "Cheese", "Apple", "Soup", "Pizza"];
const WORDS = source({
  animals: ANIMALS.map((w, i) => card("animals", i + 1, w, "easy")),
  food: FOOD.map((w, i) => card("food", i + 1, w, "hard")),
  idioms: [card("idioms", 1, "Piece of cake", "easy"), card("idioms", 2, "Break a leg", "hard")],
});
const ALL_IDS = [...ANIMALS.map((_, i) => `animals-${i + 1}`), ...FOOD.map((_, i) => `food-${i + 1}`)];

const three: ClueSetup = { players: ["Ann", "Bob", "Cem"], deckSize: 8, level: "mixed" };

type Act = { [K in ClueAction["type"]]: Omit<Extract<ClueAction, { type: K }>, "at"> }[ClueAction["type"]];

let now = T0;
/** Dispatches with the clock moved on by `wait` ms. */
function act(state: ClueState, action: Act, wait = 1000): ClueState {
  now += wait;
  return clueReducer(state, { ...action, at: now } as ClueAction);
}

function started(setup: ClueSetup = three, seen: string[] = [], words: WordSource = WORDS): ClueState {
  now = T0;
  return act(initialClueState(defaultClueSetup()), { type: "start", setup, lang: "en", words, seen, rng: zero });
}

/** Every clue giver of the round, in turn, shows the word and writes their clue. */
function giveClues(state: ClueState, clues: readonly string[]): ClueState {
  let s = state;
  for (const text of clues) {
    s = act(s, { type: "reveal" });
    s = act(s, { type: "submit", text });
  }
  return s;
}

/** From the round's handoff to its result. */
function playRound(state: ClueState, clues: readonly string[], outcome: "got" | "missed" | "passed"): ClueState {
  let s = act(state, { type: "begin" });
  s = giveClues(s, clues);
  s = act(s, { type: "reveal" });
  s = act(s, { type: "toGuess" });
  s = act(s, { type: "reveal" });
  return act(s, { type: "answer", outcome });
}

describe("setup", () => {
  it("defaults to no players, 13 words and mixed levels", () => {
    expect(defaultClueSetup()).toEqual({ players: [], deckSize: 13, level: "mixed" });
    expect(CLUE_SETUP_STORAGE_KEY).toBe("clue_setup");
    expect(clueSeenKey("tr")).toBe("clue_seen_tr");
    expect(clueSeenKey("en")).toBe("clue_seen_en");
  });

  it("deals from every Describe It category but idioms", () => {
    expect(CLUE_CATEGORIES).toEqual(WORD_CATEGORIES.filter((c) => c !== "idioms"));
  });

  it("accepts 3 to 10 players", () => {
    expect(validateClueSetup({ ...three, players: ["Ann", "Bob"] }, EN)).toEqual(["tooFewPlayers"]);
    expect(validateClueSetup(three, EN)).toEqual([]);
    const ten = Array.from({ length: CLUE_MAX_PLAYERS }, (_, i) => `P${i}`);
    expect(validateClueSetup({ ...three, players: ten }, EN)).toEqual([]);
    expect(validateClueSetup({ ...three, players: [...ten, "P10"] }, EN)).toEqual(["tooManyPlayers"]);
  });

  it("needs a name for everyone, each different with the language's rules", () => {
    expect(validateClueSetup({ ...three, players: ["Ann", " ", "Cem"] }, EN)).toEqual(["blankName"]);
    expect(validateClueSetup({ ...three, players: ["Ann", "ann ", "Cem"] }, EN)).toEqual(["duplicateName"]);
    expect(validateClueSetup({ ...three, players: ["IŞIK", "ışık", "Cem"] }, TR)).toEqual(["duplicateName"]);
    expect(validateClueSetup({ ...three, players: ["IŞIK", "ışık", "Cem"] }, EN)).toEqual([]);
  });

  it("refuses a deck size or level out of its choices", () => {
    expect(validateClueSetup({ ...three, deckSize: 9 }, EN)).toEqual(["rules"]);
    expect(validateClueSetup({ ...three, level: "medium" as never }, EN)).toEqual(["rules"]);
  });

  it("splits the errors by the wizard step that fixes them", () => {
    const bad = { ...three, players: ["Ann"], deckSize: 7 };
    expect(clueStepErrors(bad, "players", EN)).toEqual(["tooFewPlayers"]);
    expect(clueStepErrors(bad, "rules", EN)).toEqual(["rules"]);
  });

  it("has a string for every error in both languages", () => {
    for (const lang of ["en", "tr"] as const) {
      const t = translationsFor(lang);
      for (const key of Object.values(CLUE_SETUP_ERROR_KEYS)) expect(t[key]).toBeTruthy();
    }
    expect(translationsFor("en").clueErrTooMany).toBe("At most 10 players");
  });
});

describe("parseSavedClueSetup", () => {
  it("falls back to the defaults for nothing, garbage or a wrong shape", () => {
    expect(parseSavedClueSetup(null)).toEqual(defaultClueSetup());
    expect(parseSavedClueSetup("{oops")).toEqual(defaultClueSetup());
    expect(parseSavedClueSetup("[1,2]")).toEqual(defaultClueSetup());
    expect(parseSavedClueSetup("null")).toEqual(defaultClueSetup());
  });

  it("keeps each valid field on its own", () => {
    expect(parseSavedClueSetup(JSON.stringify(three))).toEqual(three);
    expect(parseSavedClueSetup(JSON.stringify({ players: ["Ann", 3, "Bob"], deckSize: 9, level: "hard" }))).toEqual({
      players: ["Ann", "Bob"],
      deckSize: 13,
      level: "hard",
    });
    expect(parseSavedClueSetup(JSON.stringify({ players: "Ann", deckSize: 20, level: "x" }))).toEqual({
      players: [],
      deckSize: 20,
      level: "mixed",
    });
  });

  it("keeps at most 10 names", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `P${i}`);
    expect(parseSavedClueSetup(JSON.stringify({ players: twelve })).players).toEqual(twelve.slice(0, 10));
  });

  it("reads a seen list fail-soft", () => {
    expect(parseSavedClueSeen(JSON.stringify(["a", 1, "b", "a"]))).toEqual(["a", "b"]);
    expect(parseSavedClueSeen("nope")).toEqual([]);
    expect(parseSavedClueSeen(null)).toEqual([]);
  });
});

describe("pool and deck", () => {
  it("takes every category but idioms, filtered by level", () => {
    expect(cluePool(WORDS, "mixed").map((c) => c.id)).toEqual(ALL_IDS);
    expect(cluePool(WORDS, "easy").map((c) => c.word)).toEqual(ANIMALS);
    expect(cluePool(WORDS, "hard").map((c) => c.word)).toEqual(FOOD);
  });

  it("deals the deck size from the unseen words and keeps the seen list", () => {
    const seen = ["animals-1", "animals-2", "other-1"];
    const { deck, seen: next } = buildClueDeck(WORDS, "mixed", 8, seen, zero);
    expect(deck).toHaveLength(8);
    expect(deck.some((c) => seen.includes(c.id))).toBe(false);
    expect(next).toEqual(seen);
  });

  it("deals seen words last and forgets the pool's seen words when fewer than the deck size are unseen", () => {
    const seen = [...ANIMALS.slice(0, 8).map((_, i) => `animals-${i + 1}`), "food-1", "other-1"];
    const { deck, seen: next } = buildClueDeck(WORDS, "easy", 8, seen, zero);
    expect(deck).toHaveLength(8);
    expect(deck.slice(0, 2).map((c) => c.id).sort()).toEqual(["animals-10", "animals-9"]);
    expect(next).toEqual(["food-1", "other-1"]);
  });

  it("keeps the seen list when exactly the deck size is unseen", () => {
    const seen = ANIMALS.slice(0, 2).map((_, i) => `animals-${i + 1}`);
    expect(buildClueDeck(WORDS, "easy", 8, seen, zero).seen).toEqual(seen);
  });

  it("deals a shorter deck from a pool smaller than the deck size", () => {
    expect(buildClueDeck(WORDS, "hard", 8, [], zero).deck).toHaveLength(5);
    expect(buildClueDeck(source({}), "mixed", 8, [], zero).deck).toEqual([]);
  });

  it("shuffles with the given random source", () => {
    const a = buildClueDeck(WORDS, "mixed", 8, [], zero).deck.map((c) => c.id);
    const b = buildClueDeck(WORDS, "mixed", 8, [], () => 0.99).deck.map((c) => c.id);
    expect(a).not.toEqual(b);
  });
});

describe("validateClue", () => {
  it("takes one word, trimmed", () => {
    expect(validateClue("Moon")).toBeNull();
    expect(validateClue("  Moon  ")).toBeNull();
    expect(validateClue("rock'n'roll")).toBeNull();
    expect(validateClue("42")).toBeNull();
  });

  it("refuses nothing, spaces inside, more than 24 characters and no letter or digit", () => {
    expect(validateClue("")).toBe("empty");
    expect(validateClue("   ")).toBe("empty");
    expect(validateClue("full moon")).toBe("space");
    expect(validateClue("full\tmoon")).toBe("space");
    expect(validateClue("a".repeat(CLUE_MAX_LENGTH))).toBeNull();
    expect(validateClue("a".repeat(CLUE_MAX_LENGTH + 1))).toBe("long");
    expect(validateClue("ç".repeat(CLUE_MAX_LENGTH))).toBeNull();
    expect(validateClue("?!")).toBe("noLetter");
    expect(validateClue("🌙")).toBe("noLetter");
  });
});

describe("clueKey", () => {
  it("ignores case, accents and punctuation", () => {
    expect(clueKey("Café!", EN)).toBe("cafe");
    expect(clueKey("rock'n'roll", EN)).toBe("rocknroll");
    expect(clueKey("Çiçek", TR)).toBe("cicek");
    expect(clueKey("ÖĞÜŞ", TR)).toBe("ogus");
  });

  it("lowercases with the language's locale: Turkish İ and I, dotted or not, are one letter", () => {
    expect(clueKey("İSTANBUL", TR)).toBe("istanbul");
    expect(clueKey("IŞIK", TR)).toBe(clueKey("ışık", TR));
    expect(clueKey("IŞIK", TR)).toBe("isik");
    expect(clueKey("İstanbul", EN)).toBe("istanbul");
  });

  it("gives the same keys on an engine without String.prototype.normalize", () => {
    const normalize = Object.getOwnPropertyDescriptor(String.prototype, "normalize");
    let keys: string[];
    try {
      delete (String.prototype as { normalize?: unknown }).normalize;
      keys = ["Café!", "Çiçek", "IŞIK", "İSTANBUL", "Ñandú"].map((w) => clueKey(w, TR));
    } finally {
      if (normalize) Object.defineProperty(String.prototype, "normalize", normalize);
    }
    expect(keys).toEqual(["cafe", "cicek", "isik", "istanbul", "nandu"]);
  });
});

describe("autoStrikes", () => {
  it("strikes every clue that matches another", () => {
    expect(autoStrikes("Moon", ["Night", "night!", "Star", "Sky"], EN)).toEqual(["duplicate", "duplicate", null, null]);
    const clues = ["Gece", "GECE", "gecé", "Yıldız"];
    expect(autoStrikes("Ay", clues, TR)).toEqual(["duplicate", "duplicate", "duplicate", null]);
  });

  it("strikes a clue that contains the word or is contained in it, when the part inside has 4 letters or more", () => {
    expect(autoStrikes("Moon", ["Moonlight", "Honeymoon", "Night"], EN)).toEqual(["word", "word", null]);
    expect(autoStrikes("Sunflower", ["flower", "Yellow"], EN)).toEqual(["word", null]);
    expect(autoStrikes("Ice cream", ["icecream", "Cream", "Cone"], EN)).toEqual(["word", "word", null]);
    expect(autoStrikes("Kedi", ["kedicik", "Miyav"], TR)).toEqual(["word", null]);
    expect(autoStrikes("Kedicik", ["kedi"], TR)).toEqual(["word"]);
  });

  it("leaves a shorter part inside to the table", () => {
    expect(autoStrikes("Ay", ["uzay", "Gece"], TR)).toEqual([null, null]);
    expect(autoStrikes("Ear", ["hear", "Listen"], EN)).toEqual([null, null]);
    expect(autoStrikes("Sunflower", ["Sun", "Yellow"], EN)).toEqual([null, null]);
    expect(autoStrikes("Uzay", ["ay"], TR)).toEqual([null]);
  });

  it("strikes a clue that is the word itself, however short", () => {
    expect(autoStrikes("Ay", ["AY", "Gece"], TR)).toEqual(["word", null]);
    expect(autoStrikes("Ear", ["ear!", "Listen"], EN)).toEqual(["word", null]);
  });

  it("strikes short duplicates however short", () => {
    expect(autoStrikes("Moon", ["Up", "up", "Sky"], EN)).toEqual(["duplicate", "duplicate", null]);
  });

  it("matches the word with the language's rules", () => {
    expect(autoStrikes("Işık", ["ISIKLAR", "Lamba"], TR)).toEqual(["word", null]);
  });

  it("strikes nothing when every clue is its own", () => {
    expect(autoStrikes("Moon", ["Night", "Sky", "Round"], EN)).toEqual([null, null, null]);
  });
});

describe("clueReducer: start", () => {
  it("deals the words and hands the phone over for the first round", () => {
    const s = started();
    expect(s.phase).toBe("handoff");
    expect(s.lang).toBe("en");
    expect(s.deck).toHaveLength(8);
    expect(s.round).toBe(0);
    expect(s.turns).toBe(0);
    expect(s.results).toEqual([]);
    expect(clueGuesser(s)).toBe("Ann");
  });

  it("trims the names and refuses an invalid setup", () => {
    expect(started({ ...three, players: [" Ann ", "Bob", "Cem "] }).setup.players).toEqual(["Ann", "Bob", "Cem"]);
    expect(started({ ...three, players: ["Ann", "Bob"] }).phase).toBe("setup");
  });

  it("refuses to start with no words to deal", () => {
    expect(started(three, [], source({ idioms: [card("idioms", 1, "Piece of cake", "easy")] })).phase).toBe("setup");
  });

  it("plays a shorter game from a small pool", () => {
    expect(started({ ...three, level: "hard" }).deck).toHaveLength(5);
  });

  it("keeps the deck's seen list, reset when too few words were unseen", () => {
    expect(started(three, ["animals-1"]).seen).toEqual(["animals-1"]);
    expect(started({ ...three, level: "hard" }, ["food-1"]).seen).toEqual([]);
  });
});

describe("clueReducer: a round", () => {
  it("rotates the guesser and asks the others for clues in seat order after them", () => {
    const s = started({ ...three, players: ["Ann", "Bob", "Cem", "Dan"] });
    expect(clueGuesserSeat(s)).toBe(0);
    expect(clueGiverSeats(s)).toEqual([1, 2, 3]);
    const second = act(playRound(s, ["a1", "b1", "c1"], "got"), { type: "next" });
    expect(clueGuesser(second)).toBe("Bob");
    expect(clueGiverSeats(second)).toEqual([2, 3, 0]);
    const third = act(playRound(second, ["a2", "b2", "c2"], "got"), { type: "next" });
    const fourth = act(playRound(third, ["a3", "b3", "c3"], "got"), { type: "next" });
    expect(clueGuesser(fourth)).toBe("Dan");
    expect(clueGiverSeats(fourth)).toEqual([0, 1, 2]);
  });

  it("marks the word seen when its round starts", () => {
    const s = act(started(), { type: "begin" });
    expect(s.phase).toBe("clue");
    expect(s.seen).toEqual([clueWord(s)!.id]);
    expect(s.giver).toBe(0);
    expect(s.revealed).toBe(false);
    expect(clueGiverSeat(s)).toBe(1);
  });

  it("takes a clue only after the giver showed the word, and only a valid one", () => {
    let s = act(started(), { type: "begin" });
    expect(act(s, { type: "submit", text: "Night" })).toEqual(s);
    s = act(s, { type: "reveal" });
    expect(s.revealed).toBe(true);
    expect(act(s, { type: "submit", text: "full moon" })).toEqual(s);
    expect(act(s, { type: "submit", text: "" })).toEqual(s);
    s = act(s, { type: "submit", text: "  Night " });
    expect(s.clues).toEqual([{ giver: "Bob", text: "Night", auto: null, struck: false }]);
    expect(s.giver).toBe(1);
    expect(s.revealed).toBe(false);
    expect(clueGiverSeat(s)).toBe(2);
  });

  it("goes to the check hidden after the last clue, the automatic strikes applied", () => {
    const s0 = act(started(), { type: "begin" });
    const word = clueWord(s0)!.word;
    const s = giveClues(s0, [word.toLowerCase(), "Nice"]);
    expect(s.phase).toBe("check");
    expect(s.revealed).toBe(false);
    expect(s.clues).toEqual([
      { giver: "Bob", text: word.toLowerCase(), auto: "word", struck: true },
      { giver: "Cem", text: "Nice", auto: null, struck: false },
    ]);
  });

  it("strikes a clue typed with Turkish letters and the same clue typed without them", () => {
    now = T0;
    const tr = act(initialClueState(defaultClueSetup()), {
      type: "start",
      setup: three,
      lang: "tr",
      words: WORDS,
      seen: [],
      rng: zero,
    });
    const s = giveClues(act(tr, { type: "begin" }), ["IŞIK", "isik"]);
    expect(s.clues.map((c) => c.auto)).toEqual(["duplicate", "duplicate"]);
  });

  it("strikes and restores any clue once the check is shown", () => {
    let s = giveClues(act(started(), { type: "begin" }), ["Night", "Night"]);
    expect(act(s, { type: "strike", index: 0 })).toEqual(s);
    s = act(s, { type: "reveal" });
    s = act(s, { type: "strike", index: 0 });
    expect(s.clues.map((c) => c.struck)).toEqual([false, true]);
    s = act(s, { type: "strike", index: 0 });
    expect(s.clues.map((c) => c.struck)).toEqual([true, true]);
    expect(s.clues.map((c) => c.auto)).toEqual(["duplicate", "duplicate"]);
    expect(act(s, { type: "strike", index: 5 })).toEqual(s);
  });

  it("takes quick strikes on the check one after another, without holding up its buttons", () => {
    const four = started({ ...three, players: ["Ann", "Bob", "Cem", "Dan"] });
    const shown = act(giveClues(act(four, { type: "begin" }), ["Night", "Sky", "Moon"]), { type: "reveal" });
    const tap = (s: ClueState, action: Act, at: number) => clueReducer(s, { ...action, at } as ClueAction);
    const t0 = shown.lastActionAt + 1000;
    let s = tap(shown, { type: "strike", index: 0 }, t0);
    s = tap(s, { type: "strike", index: 1 }, t0 + 100);
    expect(s.clues.map((c) => c.struck)).toEqual([true, true, false]);
    expect(s.lastActionAt).toBe(shown.lastActionAt);
    const handed = tap(s, { type: "toGuess" }, t0 + 200);
    expect(handed.phase).toBe("guess");
    expect(survivingClues(handed.clues)).toEqual(["Moon"]);
  });

  it("still ignores a strike right after Show the clues, so a double tap strikes nothing", () => {
    const hidden = giveClues(act(started(), { type: "begin" }), ["Night", "Sky"]);
    const shown = clueReducer(hidden, { type: "reveal", at: hidden.lastActionAt + 1000 });
    expect(clueReducer(shown, { type: "strike", index: 0, at: shown.lastActionAt + 100 })).toEqual(shown);
    const later = clueReducer(shown, { type: "strike", index: 0, at: shown.lastActionAt + CLUE_TAP_GUARD_MS });
    expect(later.clues[0].struck).toBe(true);
  });

  it("hands the surviving clues to the guesser behind a gate", () => {
    let s = giveClues(act(started(), { type: "begin" }), ["Night", "Sky"]);
    expect(act(s, { type: "toGuess" })).toEqual(s);
    s = act(s, { type: "reveal" });
    s = act(s, { type: "strike", index: 1 });
    s = act(s, { type: "toGuess" });
    expect(s.phase).toBe("guess");
    expect(s.revealed).toBe(false);
    expect(survivingClues(s.clues)).toEqual(["Night"]);
    expect(act(s, { type: "answer", outcome: "got" })).toEqual(s);
    s = act(s, { type: "reveal" });
    s = act(s, { type: "answer", outcome: "got" });
    expect(s.phase).toBe("result");
    expect(s.results).toEqual([{ word: clueWord(s), guesser: "Ann", outcome: "got", clues: s.clues }]);
  });

  it("scores Got it 1 and Missed or Pass 0", () => {
    let s = playRound(started(), ["Night", "Sky"], "got");
    s = playRound(act(s, { type: "next" }), ["Night", "Sky"], "missed");
    s = playRound(act(s, { type: "next" }), ["Night", "Sky"], "passed");
    expect(s.results.map((r) => r.outcome)).toEqual(["got", "missed", "passed"]);
    expect(clueScore(s.results)).toBe(1);
  });

  it("lets a round with no clue left only be passed", () => {
    let s = giveClues(act(started(), { type: "begin" }), ["Night", "night"]);
    s = act(act(act(s, { type: "reveal" }), { type: "toGuess" }), { type: "reveal" });
    expect(survivingClues(s.clues)).toEqual([]);
    expect(act(s, { type: "answer", outcome: "got" })).toEqual(s);
    expect(act(s, { type: "answer", outcome: "missed" })).toEqual(s);
    expect(act(s, { type: "answer", outcome: "passed" }).phase).toBe("result");
  });

  it("lets a restored clue be guessed again", () => {
    let s = giveClues(act(started(), { type: "begin" }), ["Night", "night"]);
    s = act(act(s, { type: "reveal" }), { type: "strike", index: 0 });
    s = act(act(s, { type: "toGuess" }), { type: "reveal" });
    expect(survivingClues(s.clues)).toEqual(["Night"]);
    expect(act(s, { type: "answer", outcome: "got" }).phase).toBe("result");
  });

  it("ignores a tap within 400 ms of the last one", () => {
    const s = act(started(), { type: "begin" });
    const at = (ms: number) => s.lastActionAt + ms;
    expect(clueReducer(s, { type: "reveal", at: at(CLUE_TAP_GUARD_MS - 1) })).toEqual(s);
    const shown = clueReducer(s, { type: "reveal", at: at(CLUE_TAP_GUARD_MS) });
    expect(shown.revealed).toBe(true);
    const done = act(shown, { type: "submit", text: "Night" });
    // Done, then a second tap where "Show the word" now sits: the next giver's word stays hidden.
    expect(clueReducer(done, { type: "reveal", at: done.lastActionAt + 100 })).toEqual(done);
    expect(act(started(), { type: "begin" }, 10).phase).toBe("handoff");
  });

  it("moves to the next round's handoff, then to the end after the last word", () => {
    let s = started({ ...three, level: "hard" });
    for (let round = 0; round < 5; round++) {
      s = playRound(s, ["Night", "Sky"], "got");
      expect(s.phase).toBe("result");
      s = act(s, { type: "next" });
    }
    expect(s.phase).toBe("end");
    expect(s.turns).toBe(5);
    expect(s.results).toHaveLength(5);
    expect(new Set(s.results.map((r) => r.word.id)).size).toBe(5);
    expect(s.seen.slice().sort()).toEqual(FOOD.map((_, i) => `food-${i + 1}`).sort());
  });

  it("ignores actions in the wrong phase", () => {
    const s = started();
    for (const a of [
      { type: "reveal" },
      { type: "submit", text: "x" },
      { type: "strike", index: 0 },
      { type: "toGuess" },
      { type: "answer", outcome: "passed" },
      { type: "next" },
      { type: "playAgain", rng: zero },
      { type: "newGame" },
    ] as Act[]) {
      expect(act(s, a)).toEqual(s);
    }
    expect(act(s, { type: "start", setup: three, lang: "en", words: WORDS, seen: [], rng: zero })).toEqual(s);
  });
});

describe("clueReducer: the end", () => {
  function finished(): ClueState {
    let s = started({ ...three, level: "hard" });
    for (let round = 0; round < 5; round++) {
      s = act(playRound(s, ["Night", "Sky"], round < 3 ? "got" : "missed"), { type: "next" });
    }
    return s;
  }

  it("plays again with the same setup, new words and the guesser rotation carried on", () => {
    const end = finished();
    const again = act(end, { type: "playAgain", rng: zero });
    expect(again.phase).toBe("handoff");
    expect(again.setup).toEqual(end.setup);
    expect(again.results).toEqual([]);
    expect(again.round).toBe(0);
    expect(again.turns).toBe(5);
    expect(clueGuesser(again)).toBe("Cem");
    // All five hard words were seen: the seen list starts over for them.
    expect(again.seen).toEqual([]);
    expect(again.deck).toHaveLength(5);
  });

  it("deals the unseen words first on Play again", () => {
    let s = started();
    for (let round = 0; round < 8; round++) s = act(playRound(s, ["Night", "Sky"], "got"), { type: "next" });
    const first = new Set(s.deck.map((c) => c.id));
    const again = act(s, { type: "playAgain", rng: zero });
    expect(again.deck.slice(0, 7).some((c) => first.has(c.id))).toBe(false);
    expect(again.seen).toEqual([]);
  });

  it("goes back to the setup on New game, the rotation reset", () => {
    const end = finished();
    const fresh = act(end, { type: "newGame" });
    expect(fresh.phase).toBe("setup");
    expect(fresh.setup).toEqual(end.setup);
    expect(fresh.turns).toBe(0);
    expect(fresh.lastActionAt).toBe(now);
    const tooSoon = act(fresh, { type: "start", setup: three, lang: "en", words: WORDS, seen: [], rng: zero }, 100);
    expect(tooSoon.phase).toBe("setup");
  });
});

describe("clueStrikeReason", () => {
  it("names why a clue is struck, by the rules or by the table, and nothing for a kept clue", () => {
    expect(clueStrikeReason({ auto: "duplicate", struck: true })).toBe("duplicate");
    expect(clueStrikeReason({ auto: "word", struck: true })).toBe("word");
    expect(clueStrikeReason({ auto: null, struck: true })).toBe("manual");
    expect(clueStrikeReason({ auto: "duplicate", struck: false })).toBeNull();
    expect(clueStrikeReason({ auto: null, struck: false })).toBeNull();
  });
});

describe("score and rating", () => {
  it("rates the share of words guessed", () => {
    expect(clueRating(13, 13)).toBe("clueRatingAll");
    expect(clueRating(10, 13)).toBe("clueRatingGreat");
    expect(clueRating(9, 13)).toBe("clueRatingGood");
    expect(clueRating(7, 13)).toBe("clueRatingGood");
    expect(clueRating(6, 13)).toBe("clueRatingSome");
    expect(clueRating(4, 13)).toBe("clueRatingSome");
    expect(clueRating(3, 13)).toBe("clueRatingFew");
    expect(clueRating(0, 13)).toBe("clueRatingFew");
    expect(clueRating(6, 8)).toBe("clueRatingGreat");
    expect(clueRating(2, 8)).toBe("clueRatingSome");
    expect(clueRating(0, 0)).toBe("clueRatingFew");
  });

  it("uses the reviewed Turkish wording, names without case endings", () => {
    const tr = translationsFor("tr");
    expect(tr.clueStruckManual).toBe("Elle silindi");
    expect(tr.clueToGuess).toBe("{name} ipuçlarını görsün");
    expect(tr.clueGuesses).toBe("Bu turda {name} tahmin ediyor");
  });

  it("has every rating, outcome and strike string in both languages", () => {
    for (const lang of ["en", "tr"] as const) {
      const t = translationsFor(lang);
      const keys = [
        ...CLUE_RATING_KEYS,
        ...Object.values(CLUE_OUTCOME_KEYS),
        ...Object.values(CLUE_ANSWER_KEYS),
        ...Object.values(CLUE_STRIKE_KEYS),
        ...Object.values(CLUE_ERROR_KEYS),
        ...Object.values(CLUE_LEVEL_KEYS),
      ];
      for (const key of keys) expect(t[key]).toBeTruthy();
    }
  });
});
