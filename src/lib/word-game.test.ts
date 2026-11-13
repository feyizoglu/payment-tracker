import { describe, it, expect } from "vitest";
import { translationsFor } from "@/lib/i18n";
import { CATEGORY_EMOJI, CATEGORY_LABEL_KEYS, PLAYER_COLORS } from "@/lib/imposter";
import {
  WORD_CATEGORIES,
  WORD_CATEGORY_CHOICES,
  WORD_CATEGORY_EMOJI,
  WORD_CATEGORY_LABEL_KEYS,
  WORD_DECK_MIN,
  WORD_DIFFICULTY_KEYS,
  WORD_MAX_TEAM,
  WORD_MODE_KEYS,
  WORD_RESULT_KEYS,
  WORD_SETUP_ERROR_KEYS,
  WORD_SETUP_STORAGE_KEY,
  WORD_TAP_GUARD_MS,
  buildDeck,
  currentTeam,
  defaultTeamNames,
  defaultWordSetup,
  describer,
  initialWordState,
  parseSavedSeen,
  parseSavedWordSetup,
  shuffleTeams,
  signedPoints,
  teamColor,
  turnPoints,
  validateWordSetup,
  winner,
  wordGameReducer,
  wordSeenKey,
  wordStepErrors,
  type Rng,
  type WordCard,
  type WordCategory,
  type WordGameState,
  type WordLevel,
  type WordResult,
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

const T0 = 1_800_000_000_000;
let now = T0;
const tick = (ms = 1000) => (now += ms);

const SIX = source({ animals: cardsOf("animals", "easy", 6) });
const MANY = source({ animals: cardsOf("animals", "easy", 100) });

function start(setup: WordSetup = setupWith(), words: WordSource = SIX, seen: string[] = []): WordGameState {
  now = T0;
  return wordGameReducer(initialWordState(setup), { type: "start", setup, lang: "tr", words, seen, rng: keepOrder, at: now });
}
const begin = (s: WordGameState) => wordGameReducer(s, { type: "begin", at: tick() });
const answer = (s: WordGameState, result: WordResult) =>
  wordGameReducer(s, { type: "answer", result, rng: keepOrder, at: tick() });
const timeUp = (s: WordGameState) => wordGameReducer(s, { type: "timeUp", at: (now = Math.max(now, s.endsAt)) });
const next = (s: WordGameState) => wordGameReducer(s, { type: "next", at: tick() });
const turn = (s: WordGameState, results: WordResult[] = []) => next(timeUp(results.reduce(answer, begin(s))));

describe("wordGameReducer start", () => {
  it("starts at the first hand-over with trimmed names, the words' language and no points", () => {
    const s = start(
      setupWith({
        teams: [
          { name: " Red ", players: [" Ann", "Bob "] },
          { name: "Blue", players: ["Cem", "Dan"] },
        ],
      })
    );
    expect(s.phase).toBe("handoff");
    expect(s.setup.teams[0]).toEqual({ name: "Red", players: ["Ann", "Bob"] });
    expect(s.lang).toBe("tr");
    expect(s.scores).toEqual([0, 0]);
    expect(currentTeam(s)).toBe(0);
    expect(describer(s)).toBe("Ann");
    expect(ids(s.deck)).toEqual(ids(SIX.animals));
  });

  it("ignores an invalid setup", () => {
    const setup = setupWith({ teams: teams(["Ann"], ["Cem", "Dan"]) });
    const before = initialWordState(setup);
    const action = { type: "start", setup, lang: "tr", words: SIX, seen: [], rng: keepOrder, at: T0 } as const;
    expect(wordGameReducer(before, action)).toBe(before);
  });

  it("keeps the seen list it was given, without the choice's words when it ran low", () => {
    expect(start(setupWith(), MANY, ["animals-1", "food-9"]).seen).toEqual(["animals-1", "food-9"]);
    expect(start(setupWith(), SIX, ["animals-1", "food-9"]).seen).toEqual(["food-9"]);
  });

  it("ends at once with a note when the choice has no words", () => {
    const s = start(setupWith({ category: "food" }));
    expect(s.phase).toBe("end");
    expect(s.outOfWords).toBe(true);
  });
});

describe("wordGameReducer turn", () => {
  it("shows the first word on Start, marks it seen and starts the clock", () => {
    const s = begin(start());
    expect(s.phase).toBe("play");
    expect(s.card?.id).toBe("animals-1");
    expect(s.seen).toEqual(["animals-1"]);
    expect(s.endsAt).toBe(now + 60_000);
    expect(s.passesLeft).toBe(3);
    expect(s.results).toEqual([]);
  });

  it("scores Correct +1, Pass 0 and Foul -1 for the team on turn and moves on each time", () => {
    let s = begin(start());
    s = answer(s, "foul");
    expect(s.scores).toEqual([-1, 0]);
    s = answer(s, "correct");
    s = answer(s, "pass");
    s = answer(s, "correct");
    expect(s.scores).toEqual([1, 0]);
    expect(s.results.map((r) => [r.card.id, r.result])).toEqual([
      ["animals-1", "foul"],
      ["animals-2", "correct"],
      ["animals-3", "pass"],
      ["animals-4", "correct"],
    ]);
    expect(s.card?.id).toBe("animals-5");
    expect(s.seen).toEqual(["animals-1", "animals-2", "animals-3", "animals-4", "animals-5"]);
    expect(turnPoints(s.results)).toBe(1);
  });

  it("counts the passes down and refuses a pass when none are left", () => {
    let s = begin(start(setupWith({ passLimit: 3 })));
    for (let i = 0; i < 3; i++) s = answer(s, "pass");
    expect(s.passesLeft).toBe(0);
    expect(answer(s, "pass")).toBe(s);
  });

  it("refuses every pass with a limit of 0 and never runs out when unlimited", () => {
    const none = begin(start(setupWith({ passLimit: 0 })));
    expect(answer(none, "pass")).toBe(none);
    let s = begin(start(setupWith({ passLimit: null }), MANY));
    for (let i = 0; i < 10; i++) s = answer(s, "pass");
    expect(s.passesLeft).toBeNull();
    expect(s.results).toHaveLength(10);
  });

  it("gives every turn its passes back", () => {
    let s = begin(start());
    s = answer(s, "pass");
    expect(begin(next(timeUp(s))).passesLeft).toBe(3);
  });

  it("ignores a second tap within the tap guard", () => {
    const s = begin(start());
    const first = wordGameReducer(s, { type: "answer", result: "correct", rng: keepOrder, at: now + 1000 });
    const at = now + 1000 + WORD_TAP_GUARD_MS;
    expect(wordGameReducer(first, { type: "answer", result: "correct", rng: keepOrder, at: at - 1 })).toBe(first);
    expect(wordGameReducer(first, { type: "answer", result: "correct", rng: keepOrder, at }).scores).toEqual([2, 0]);
  });

  it("does not let a double tap on Start answer the first word", () => {
    const s = begin(start());
    expect(wordGameReducer(s, { type: "answer", result: "correct", rng: keepOrder, at: now + 50 })).toBe(s);
    expect(wordGameReducer(start(), { type: "begin", at: T0 + 50 }).phase).toBe("handoff");
  });

  it("ends the turn at the clock: the word on screen does not count and goes to the bottom of the deck", () => {
    let s = answer(begin(start()), "correct");
    expect(s.card?.id).toBe("animals-2");
    expect(wordGameReducer(s, { type: "timeUp", at: s.endsAt - 1 })).toBe(s);
    expect(wordGameReducer(s, { type: "answer", result: "correct", rng: keepOrder, at: s.endsAt })).toBe(s);
    s = wordGameReducer(s, { type: "timeUp", at: s.endsAt });
    expect(s.phase).toBe("summary");
    expect(s.card).toBeNull();
    expect(s.results.map((r) => r.card.id)).toEqual(["animals-1"]);
    expect(ids(s.deck)).toEqual(["animals-3", "animals-4", "animals-5", "animals-6", "animals-2"]);
    expect(s.seen).toContain("animals-2");
    expect(s.scores).toEqual([1, 0]);
  });

  it("takes the time-up right after a tap, and guards the summary's Next from that tap", () => {
    let s = begin(start());
    s = wordGameReducer(s, { type: "answer", result: "correct", rng: keepOrder, at: s.endsAt - 100 });
    s = wordGameReducer(s, { type: "timeUp", at: s.endsAt });
    expect(s.phase).toBe("summary");
    expect(wordGameReducer(s, { type: "next", at: s.endsAt + 100 })).toBe(s);
    expect(wordGameReducer(s, { type: "next", at: s.endsAt + WORD_TAP_GUARD_MS }).phase).toBe("handoff");
  });
});

describe("wordGameReducer turn order and end of the game", () => {
  it("alternates the teams from team 1 and rotates each team's describer in list order", () => {
    let s = start(setupWith({ teams: teams(["Ann", "Bob", "Eve"], ["Cem", "Dan"]), rounds: 3 }), MANY);
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(`${currentTeam(s)}:${describer(s)}`);
      s = turn(s);
    }
    expect(order).toEqual(["0:Ann", "1:Cem", "0:Bob", "1:Dan", "0:Eve", "1:Cem"]);
  });

  it("gives each team rounds × the larger team's size turns and ends after team 2's last one", () => {
    let s = start(setupWith({ teams: teams(["Ann", "Bob", "Eve"], ["Cem", "Dan"]), endBy: "rounds", rounds: 1 }), MANY);
    for (let i = 0; i < 5; i++) s = turn(s, i % 2 === 0 ? ["correct"] : []);
    expect(s.phase).toBe("handoff");
    s = turn(s);
    expect(s.phase).toBe("end");
    expect(s.turnsPlayed).toBe(6);
    expect(s.scores).toEqual([3, 0]);
    expect(winner(s.scores)).toBe(0);
  });

  it("calls equal scores at the end of the rounds a draw", () => {
    let s = start(setupWith({ endBy: "rounds", rounds: 1 }), MANY);
    for (let i = 0; i < 4; i++) s = turn(s, ["correct"]);
    expect(s.phase).toBe("end");
    expect(s.scores).toEqual([2, 2]);
    expect(winner(s.scores)).toBeNull();
  });

  it("ends on a target score only after team 2 has played, and only when the scores differ", () => {
    const twenty = Array.from({ length: 20 }, (): WordResult => "correct");
    let s = start(setupWith({ endBy: "target", target: 20 }), MANY);
    s = turn(s, twenty);
    expect(s.phase).toBe("handoff");
    s = turn(s, twenty);
    expect(s.scores).toEqual([20, 20]);
    expect(s.phase).toBe("handoff");
    s = turn(s, ["correct"]);
    expect(s.phase).toBe("handoff");
    s = turn(s);
    expect(s.phase).toBe("end");
    expect(winner(s.scores)).toBe(0);
  });

  it("writes the turn's points with a sign", () => {
    expect([signedPoints(3), signedPoints(0), signedPoints(-2)]).toEqual(["+3", "0", "-2"]);
  });
});

describe("wordGameReducer running out of words", () => {
  it("shuffles the passed words back in, then ends after the turn with a note", () => {
    let s = begin(start(setupWith(), source({ animals: cardsOf("animals", "easy", 3) })));
    s = answer(s, "pass");
    s = answer(s, "correct");
    s = answer(s, "correct");
    expect(s.card?.id).toBe("animals-1");
    expect(s.passed).toEqual([]);
    s = answer(s, "correct");
    expect(s.phase).toBe("summary");
    expect(s.outOfWords).toBe(true);
    expect(s.results.map((r) => r.result)).toEqual(["pass", "correct", "correct", "correct"]);
    expect(s.scores).toEqual([3, 0]);
    s = next(s);
    expect(s.phase).toBe("end");
    expect(s.outOfWords).toBe(true);
  });
});

describe("wordGameReducer ending and replaying", () => {
  it("ends the game from the hand-over or the summary, not during a turn", () => {
    expect(wordGameReducer(start(), { type: "endGame", at: tick() }).phase).toBe("end");
    const playing = begin(start());
    expect(wordGameReducer(playing, { type: "endGame", at: tick() })).toBe(playing);
    const summary = timeUp(begin(start()));
    expect(wordGameReducer(summary, { type: "endGame", at: tick() }).phase).toBe("end");
  });

  it("plays again with the same settings, no points and none of the words already shown", () => {
    const sixty = source({ animals: cardsOf("animals", "easy", 60) });
    let s = turn(start(setupWith(), sixty), ["correct", "correct"]);
    s = wordGameReducer(s, { type: "endGame", at: tick() });
    s = wordGameReducer(s, { type: "playAgain", rng: keepOrder, at: tick() });
    expect(s.phase).toBe("handoff");
    expect(s.scores).toEqual([0, 0]);
    expect(s.turnsPlayed).toBe(0);
    expect(s.lang).toBe("tr");
    expect(s.setup.teams[0].players).toEqual(["Ann", "Bob"]);
    expect(ids(s.deck)).toEqual(ids(sixty.animals.slice(3)));
  });

  it("goes back to the setup with the played settings and keeps the time, so a double tap cannot start", () => {
    let s = wordGameReducer(start(), { type: "endGame", at: tick() });
    s = wordGameReducer(s, { type: "newGame", at: tick() });
    expect(s.phase).toBe("setup");
    expect(s.setup.teams[0].players).toEqual(["Ann", "Bob"]);
    const again = { type: "start", setup: s.setup, lang: "tr", words: SIX, seen: [], rng: keepOrder, at: now + 100 } as const;
    expect(wordGameReducer(s, again)).toBe(s);
  });
});

describe("word game labels", () => {
  const maps: Record<string, string>[] = [
    WORD_CATEGORY_LABEL_KEYS,
    WORD_DIFFICULTY_KEYS,
    WORD_RESULT_KEYS,
    WORD_SETUP_ERROR_KEYS,
    ...Object.values(WORD_MODE_KEYS),
  ];

  it.each(["en", "tr"] as const)("has every label in %s", (lang) => {
    const t = translationsFor(lang) as unknown as Record<string, string>;
    for (const map of maps) for (const key of Object.values(map)) expect(t[key], key).toBeTruthy();
  });

  it("gives every category choice a label and an emoji, reusing Imposter's for the shared ones", () => {
    expect(Object.keys(WORD_CATEGORY_LABEL_KEYS).sort()).toEqual([...WORD_CATEGORY_CHOICES].sort());
    expect(Object.keys(WORD_CATEGORY_EMOJI).sort()).toEqual([...WORD_CATEGORY_CHOICES].sort());
    expect(WORD_CATEGORY_LABEL_KEYS.animals).toBe(CATEGORY_LABEL_KEYS.animals);
    expect(WORD_CATEGORY_EMOJI.sports).toBe(CATEGORY_EMOJI.sports);
  });

  it("names the game Describe It and Anlat Bul", () => {
    expect(translationsFor("en").wordTitle).toBe("Describe It");
    expect(translationsFor("tr").wordTitle).toBe("Anlat Bul");
  });
});
