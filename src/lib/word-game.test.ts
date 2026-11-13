import { describe, it, expect } from "vitest";
import { PLAYER_COLORS } from "@/lib/imposter";
import {
  WORD_CATEGORIES,
  WORD_DECK_MIN,
  WORD_MAX_TEAM,
  WORD_SETUP_STORAGE_KEY,
  buildDeck,
  defaultTeamNames,
  defaultWordSetup,
  parseSavedSeen,
  parseSavedWordSetup,
  shuffleTeams,
  teamColor,
  validateWordSetup,
  wordSeenKey,
  wordStepErrors,
  type Rng,
  type WordCard,
  type WordCategory,
  type WordLevel,
  type WordSetup,
  type WordSource,
  type WordTeam,
} from "@/lib/word-game";

const NAMES = ["Red", "Blue"] as const;

function teams(a: string[], b: string[]): [WordTeam, WordTeam] {
  return [
    { name: "Red", players: a },
    { name: "Blue", players: b },
  ];
}

function setupWith(patch: Partial<WordSetup> = {}): WordSetup {
  return { ...defaultWordSetup(NAMES), teams: teams(["Ann", "Bob"], ["Cem", "Dan"]), ...patch };
}

describe("word game setup", () => {
  it("starts from two empty teams with the given names and the default rules", () => {
    expect(defaultWordSetup(NAMES)).toEqual({
      teams: [
        { name: "Red", players: [] },
        { name: "Blue", players: [] },
      ],
      category: "mixed",
      difficulty: "mixed",
      mode: "free",
      turnSeconds: 60,
      passLimit: 3,
      endBy: "rounds",
      rounds: 2,
      target: 30,
    });
  });

  it("fills the default team names from the translated template", () => {
    expect(defaultTeamNames("Team {n}")).toEqual(["Team 1", "Team 2"]);
    expect(defaultTeamNames("Takım {n}")).toEqual(["Takım 1", "Takım 2"]);
  });

  it("colours team 1 and team 2 with the first and seventh player colours", () => {
    expect(teamColor(0)).toBe(PLAYER_COLORS[0]);
    expect(teamColor(1)).toBe(PLAYER_COLORS[6]);
  });

  it("stores the settings and one seen list per language under their own keys", () => {
    expect(WORD_SETUP_STORAGE_KEY).toBe("word_game_setup");
    expect(wordSeenKey("tr")).toBe("word_game_seen_tr");
    expect(wordSeenKey("en")).toBe("word_game_seen_en");
  });
});

describe("validateWordSetup", () => {
  it("accepts two teams of 2 to 8 named players", () => {
    expect(validateWordSetup(setupWith())).toEqual([]);
    const eight = Array.from({ length: 8 }, (_, i) => `P${i}`);
    const eightMore = Array.from({ length: 8 }, (_, i) => `Q${i}`);
    expect(validateWordSetup(setupWith({ teams: teams(eight, eightMore) }))).toEqual([]);
  });

  it("needs 2 to 8 players in each team", () => {
    expect(validateWordSetup(setupWith({ teams: teams(["Ann"], ["Cem", "Dan"]) }))).toEqual(["teamSize"]);
    const nine = Array.from({ length: 9 }, (_, i) => `P${i}`);
    expect(validateWordSetup(setupWith({ teams: teams(["Ann", "Bob"], nine) }))).toEqual(["teamSize"]);
  });

  it("needs a name for every player, used once across both teams", () => {
    expect(validateWordSetup(setupWith({ teams: teams(["Ann", " "], ["Cem", "Dan"]) }))).toEqual(["blankName"]);
    expect(validateWordSetup(setupWith({ teams: teams(["Ann", "Bob"], [" ann ", "Dan"]) }))).toEqual(["duplicateName"]);
  });

  it("needs two different team names", () => {
    const named = (a: string, b: string) =>
      setupWith({
        teams: [
          { name: a, players: ["Ann", "Bob"] },
          { name: b, players: ["Cem", "Dan"] },
        ],
      });
    expect(validateWordSetup(named(" ", "Blue"))).toEqual(["blankTeamName"]);
    expect(validateWordSetup(named("Red", " red "))).toEqual(["sameTeamName"]);
  });

  it("puts every error on the teams step", () => {
    const broken = setupWith({ teams: teams(["Ann"], ["Ann", ""]) });
    expect(validateWordSetup(broken)).toEqual(["teamSize", "blankName", "duplicateName"]);
    expect(wordStepErrors(broken, "teams")).toEqual(validateWordSetup(broken));
    expect(wordStepErrors(broken, "words")).toEqual([]);
    expect(wordStepErrors(broken, "rules")).toEqual([]);
  });
});

describe("shuffleTeams", () => {
  it("spreads every entered name over the two teams as evenly as possible", () => {
    const shuffled = shuffleTeams(setupWith({ teams: teams(["Ann", "Bob", "Cem", " "], ["Dan", " Eve "]) }), () => 0);
    const [a, b] = shuffled.teams;
    expect(a.players).toHaveLength(3);
    expect(b.players).toHaveLength(2);
    expect([...a.players, ...b.players].sort()).toEqual(["Ann", "Bob", "Cem", "Dan", "Eve"]);
    expect([a.name, b.name]).toEqual(["Red", "Blue"]);
  });

  it("uses the random source for the order", () => {
    const setup = setupWith();
    const players = (s: WordSetup) => s.teams.map((team) => team.players);
    expect(players(shuffleTeams(setup, () => 0.999999))).toEqual([
      ["Ann", "Bob"],
      ["Cem", "Dan"],
    ]);
    expect(players(shuffleTeams(setup, () => 0))).not.toEqual([
      ["Ann", "Bob"],
      ["Cem", "Dan"],
    ]);
  });
});

describe("parseSavedWordSetup", () => {
  it("reads back saved settings", () => {
    const saved: WordSetup = {
      ...setupWith(),
      category: "idioms",
      difficulty: "hard",
      mode: "mime",
      turnSeconds: 90,
      passLimit: null,
      endBy: "target",
      rounds: 3,
      target: 50,
    };
    expect(parseSavedWordSetup(JSON.stringify(saved), NAMES)).toEqual(saved);
  });

  it("falls back to the defaults for nothing, garbage or the wrong shape", () => {
    for (const raw of [null, "", "{oops", "[]", "42", "null"]) {
      expect(parseSavedWordSetup(raw, NAMES)).toEqual(defaultWordSetup(NAMES));
    }
  });

  it("keeps each valid field and replaces each invalid one", () => {
    const raw = JSON.stringify({
      teams: [{ name: "Owls", players: ["Ann", 7, "Bob"] }, "nope"],
      category: "space",
      difficulty: "hard",
      mode: "shout",
      turnSeconds: 45,
      passLimit: 5,
      endBy: "target",
      rounds: 9,
      target: 30,
    });
    expect(parseSavedWordSetup(raw, NAMES)).toEqual({
      teams: [
        { name: "Owls", players: ["Ann", "Bob"] },
        { name: "Blue", players: [] },
      ],
      category: "mixed",
      difficulty: "hard",
      mode: "free",
      turnSeconds: 60,
      passLimit: 3,
      endBy: "target",
      rounds: 2,
      target: 30,
    });
  });

  it("keeps at most 8 players per team", () => {
    const many = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const raw = JSON.stringify({ teams: [{ name: "A", players: many }, { name: "B", players: [] }] });
    expect(parseSavedWordSetup(raw, NAMES).teams[0].players).toEqual(many.slice(0, WORD_MAX_TEAM));
  });
});

describe("parseSavedSeen", () => {
  it("reads a list of ids once each", () => {
    expect(parseSavedSeen(JSON.stringify(["animals-1", "food-2", "animals-1"]))).toEqual(["animals-1", "food-2"]);
  });

  it("drops anything that is not an id list", () => {
    expect(parseSavedSeen(JSON.stringify(["animals-1", 3, null]))).toEqual(["animals-1"]);
    for (const raw of [null, "", "{oops", "{}", '"animals-1"']) expect(parseSavedSeen(raw)).toEqual([]);
  });
});

const keepOrder: Rng = () => 0.999999;

function cardsOf(category: WordCategory, level: WordLevel, count: number, from = 1): WordCard[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${category}-${from + i}`,
    word: `${category} ${from + i}`,
    forbidden: ["w", "x", "y", "z"],
    level,
  }));
}

function source(lists: Partial<Record<WordCategory, WordCard[]>>): WordSource {
  return Object.fromEntries(WORD_CATEGORIES.map((c) => [c, lists[c] ?? []])) as unknown as WordSource;
}

const ids = (cards: readonly WordCard[]) => cards.map((c) => c.id);

describe("buildDeck", () => {
  const animals = cardsOf("animals", "easy", 60);
  const words = source({
    animals: [...animals, ...cardsOf("animals", "hard", 60, 61)],
    food: cardsOf("food", "easy", 60),
  });

  it("deals the unseen words of the chosen category and difficulty", () => {
    const { deck, seen } = buildDeck(words, "animals", "easy", ["animals-1", "animals-2", "food-1"], keepOrder);
    expect(ids(deck)).toEqual(ids(animals.slice(2)));
    expect(seen).toEqual(["animals-1", "animals-2", "food-1"]);
  });

  it("takes every category for Mixed and both levels for Mixed difficulty", () => {
    expect(buildDeck(words, "mixed", "easy", [], keepOrder).deck).toHaveLength(120);
    expect(buildDeck(words, "animals", "mixed", [], keepOrder).deck).toHaveLength(120);
    expect(buildDeck(words, "animals", "hard", [], keepOrder).deck.every((c) => c.level === "hard")).toBe(true);
  });

  it(`clears the seen list of that choice when fewer than ${WORD_DECK_MIN} of its words are unseen`, () => {
    const seen = [...ids(animals.slice(0, 11)), "food-1", "animals-61"];
    const built = buildDeck(words, "animals", "easy", seen, keepOrder);
    expect(ids(built.deck)).toEqual(ids(animals));
    expect(built.seen).toEqual(["food-1", "animals-61"]);
  });

  it("shuffles with the random source", () => {
    const { deck } = buildDeck(words, "animals", "easy", [], () => 0);
    expect(ids(deck)).not.toEqual(ids(animals));
    expect([...ids(deck)].sort()).toEqual([...ids(animals)].sort());
  });
});
