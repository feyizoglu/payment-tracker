import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETUP,
  FUSE_SECONDS,
  MAX_PLAYERS,
  POTATO_CATEGORIES,
  POTATO_FUSES,
  POTATO_LETTERS,
  POTATO_NEXT_LOCK_MS,
  POTATO_TAP_GUARD_MS,
  SETUP_STORAGE_KEY,
  drawFuse,
  fuseStage,
  initialPotatoState,
  letterTasks,
  nextLiving,
  parseSavedSetup,
  pickTask,
  potatoPool,
  potatoReducer,
  stepErrors,
  taskText,
  validateSetup,
  winner,
  type PotatoAction,
  type PotatoPool,
  type PotatoPrompt,
  type PotatoSetup,
  type PotatoState,
  type PotatoTask,
} from "./hot-potato";

const T0 = 1_800_000_000_000;
const zero = () => 0;
/** Returns the values in turn, then starts over. */
function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

const prompts: PotatoPrompt[] = [
  { id: "en-1", text: "Something round" },
  { id: "en-2", text: "Something cold" },
  { id: "en-3", text: "Something you can open" },
];
const pool: PotatoPool = { lang: "en", letters: { animals: "ST", food: "B" }, prompts };
const players = (n: number) => ["Ann", "Bob", "Cem", "Dan", "Eda", "Fay", "Gil", "Hal", "Ivy", "Jon", "Kim", "Lea", "Max"].slice(0, n);
const setup: PotatoSetup = { players: [" Ann ", "Bob", "Cem", "Dan"], lives: 2, fuse: "short", tasks: "mixed" };

function run(state: PotatoState, ...actions: PotatoAction[]): PotatoState {
  return actions.reduce(potatoReducer, state);
}

/** A started game, on the ready screen; Math.random 0 seats Ann first. */
function ready(s: PotatoSetup = setup, at = T0): PotatoState {
  return potatoReducer(initialPotatoState(), { type: "start", setup: s, pool, rng: zero, at });
}

/** The round lit at `at`: a short fuse with rng 0 is 10 s. */
function playing(s: PotatoSetup = setup, at = T0 + 1000): PotatoState {
  return potatoReducer(ready(s), { type: "light", rng: zero, at });
}

describe("validateSetup", () => {
  const valid = (n: number): PotatoSetup => ({ ...DEFAULT_SETUP, players: players(n) });

  it("takes 3 to 12 named players", () => {
    expect(validateSetup(valid(3), "en-US")).toEqual([]);
    expect(validateSetup(valid(12), "en-US")).toEqual([]);
    expect(validateSetup(valid(2), "en-US")).toEqual(["tooFewPlayers"]);
    expect(validateSetup(valid(13), "en-US")).toEqual(["tooManyPlayers"]);
    expect(MAX_PLAYERS).toBe(12);
  });

  it("needs a name for every player", () => {
    expect(validateSetup({ ...DEFAULT_SETUP, players: ["Ann", "  ", "Cem"] }, "en-US")).toEqual(["blankName"]);
  });

  it("compares names lowercased with the app language's locale", () => {
    const names = { ...DEFAULT_SETUP, players: ["Işık", "ışık", "Can"] };
    expect(validateSetup(names, "tr-TR")).toEqual(["duplicateName"]);
    expect(validateSetup(names, "en-US")).toEqual([]);
    expect(validateSetup({ ...DEFAULT_SETUP, players: ["Ann", " ann", "Cem"] }, "en-US")).toEqual(["duplicateName"]);
  });

  it("takes 1 to 5 lives", () => {
    for (const lives of [1, 5]) expect(validateSetup({ ...valid(3), lives }, "en-US")).toEqual([]);
    for (const lives of [0, 6, 2.5]) expect(validateSetup({ ...valid(3), lives }, "en-US")).toEqual(["lives"]);
  });

  it("gives each step only the errors it can fix", () => {
    const bad = { ...DEFAULT_SETUP, players: ["Ann"], lives: 0 };
    expect(stepErrors(bad, "players", "en-US")).toEqual(["tooFewPlayers"]);
    expect(stepErrors(bad, "rules", "en-US")).toEqual(["lives"]);
  });
});

describe("parseSavedSetup", () => {
  it("starts from the defaults: no players, 3 lives, a normal fuse, mixed tasks", () => {
    expect(DEFAULT_SETUP).toEqual({ players: [], lives: 3, fuse: "normal", tasks: "mixed" });
    expect(SETUP_STORAGE_KEY).toBe("potato_setup");
  });

  it("falls back to the defaults for nothing, garbage or the wrong shape", () => {
    for (const raw of [null, "", "{", "[]", "42", "null"]) expect(parseSavedSetup(raw)).toEqual(DEFAULT_SETUP);
  });

  it("keeps each valid field on its own", () => {
    const raw = JSON.stringify({ players: ["Ann", 3, "Bob"], lives: 9, fuse: "long", tasks: "nope" });
    expect(parseSavedSetup(raw)).toEqual({ players: ["Ann", "Bob"], lives: 3, fuse: "long", tasks: "mixed" });
    expect(parseSavedSetup(JSON.stringify({ lives: 1, tasks: "prompts" }))).toEqual({
      ...DEFAULT_SETUP,
      lives: 1,
      tasks: "prompts",
    });
  });

  it("keeps at most 12 players and reads back what was saved", () => {
    expect(parseSavedSetup(JSON.stringify({ players: players(13) })).players).toEqual(players(12));
    expect(parseSavedSetup(JSON.stringify(setup))).toEqual(setup);
  });
});

describe("drawFuse", () => {
  it("draws within each fuse's range", () => {
    expect(FUSE_SECONDS).toEqual({ short: [10, 30], normal: [20, 60], long: [40, 90] });
    for (const fuse of POTATO_FUSES) {
      const [min, max] = FUSE_SECONDS[fuse];
      expect(drawFuse(fuse, () => 0)).toBe(min * 1000);
      expect(drawFuse(fuse, () => 0.999999)).toBe(max * 1000);
      const mid = drawFuse(fuse, () => 0.5);
      expect(mid).toBeGreaterThan(min * 1000);
      expect(mid).toBeLessThan(max * 1000);
    }
  });
});

describe("nextLiving", () => {
  it("goes round the seats, skipping the players who are out", () => {
    const lives = [1, 0, 2, 0];
    expect(nextLiving(lives, 0)).toBe(2);
    expect(nextLiving(lives, 2)).toBe(0);
    expect(nextLiving(lives, 1)).toBe(2);
    expect(nextLiving(lives, 3)).toBe(0);
  });
});

describe("pickTask", () => {
  it("builds letter tasks from the pool's letters, category by category", () => {
    expect(letterTasks(pool)).toEqual([
      { kind: "letter", id: "en:animals:S", category: "animals", letter: "S" },
      { kind: "letter", id: "en:animals:T", category: "animals", letter: "T" },
      { kind: "letter", id: "en:food:B", category: "food", letter: "B" },
    ]);
  });

  it("takes the letters of the game's language from POTATO_LETTERS", () => {
    const tr = potatoPool("tr", []);
    expect(tr.letters).toBe(POTATO_LETTERS.tr);
    const all = letterTasks(tr);
    expect(all.length).toBe(POTATO_CATEGORIES.reduce((n, c) => n + [...POTATO_LETTERS.tr[c]].length, 0));
    let used: string[] = [];
    for (let i = 0; i < all.length; i++) {
      const picked = pickTask(tr, "letters", used, Math.random)!;
      expect(picked.task.kind).toBe("letter");
      if (picked.task.kind !== "letter") return;
      expect([...POTATO_LETTERS.tr[picked.task.category]]).toContain(picked.task.letter);
      used = picked.used;
    }
    expect(new Set(used).size).toBe(all.length);
  });

  it("draws only the chosen kind", () => {
    expect(pickTask(pool, "letters", [], zero)!.task.kind).toBe("letter");
    expect(pickTask(pool, "prompts", [], zero)!.task).toEqual({ kind: "prompt", id: "en-1", text: "Something round" });
  });

  it("draws each kind with equal chance in a mixed game", () => {
    expect(pickTask(pool, "mixed", [], seq(0.49, 0))!.task.kind).toBe("letter");
    expect(pickTask(pool, "mixed", [], seq(0.5, 0))!.task.kind).toBe("prompt");
  });

  it("does not repeat a task until its kind is used up, then starts that kind over alone", () => {
    let used = ["other-1"];
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const picked = pickTask(pool, "prompts", used, zero)!;
      seen.push(picked.task.id);
      used = picked.used;
    }
    expect(seen.sort()).toEqual(["en-1", "en-2", "en-3"]);
    const again = pickTask(pool, "prompts", [...used, "en:animals:S"], zero)!;
    expect(again.task.id).toBe("en-1");
    expect(again.used).toEqual(["other-1", "en:animals:S", "en-1"]);
  });

  it("falls back to the other kind when one has no tasks, and finds none in an empty pool", () => {
    const noPrompts: PotatoPool = { ...pool, prompts: [] };
    const noLetters: PotatoPool = { ...pool, letters: {} };
    expect(pickTask(noPrompts, "mixed", [], seq(0.9, 0))!.task.kind).toBe("letter");
    expect(pickTask(noLetters, "mixed", [], seq(0.1, 0))!.task.kind).toBe("prompt");
    expect(pickTask(noPrompts, "prompts", [], zero)).toBeNull();
    expect(pickTask({ ...noLetters, prompts: [] }, "mixed", [], zero)).toBeNull();
  });
});

describe("potatoReducer: start and the ready screen", () => {
  it("refuses a setup that is not valid in the pool's language", () => {
    const bad = { ...setup, players: ["Işık", "ışık", "Can"] };
    const trPool = { ...pool, lang: "tr" as const };
    expect(potatoReducer(initialPotatoState(), { type: "start", setup: bad, pool: trPool, rng: zero, at: T0 }).phase).toBe("setup");
    expect(potatoReducer(initialPotatoState(), { type: "start", setup: bad, pool, rng: zero, at: T0 }).phase).toBe("ready");
  });

  it("refuses a pool with no task for the chosen kind", () => {
    const s = potatoReducer(initialPotatoState(), {
      type: "start",
      setup: { ...setup, tasks: "prompts" },
      pool: { ...pool, prompts: [] },
      rng: zero,
      at: T0,
    });
    expect(s.phase).toBe("setup");
  });

  it("trims the names, gives everyone their lives and draws who starts", () => {
    const s = ready();
    expect(s.phase).toBe("ready");
    expect(s.setup.players).toEqual(["Ann", "Bob", "Cem", "Dan"]);
    expect(s.lives).toEqual([2, 2, 2, 2]);
    expect(s.holder).toBe(0);
    expect(s.task).toBeNull();
    expect(s.pool).toBe(pool);
    expect(potatoReducer(initialPotatoState(), { type: "start", setup, pool, rng: () => 0.99, at: T0 }).holder).toBe(3);
  });

  it("lights the fuse and shows the task on Start", () => {
    const s = playing();
    expect(s.phase).toBe("playing");
    expect(s.task).not.toBeNull();
    expect(s.used).toEqual([s.task!.id]);
    expect(s.fuseMs).toBe(10_000);
    expect(s.burntMs).toBe(0);
    expect(s.litAt).toBe(T0 + 1000);
    expect(s.holder).toBe(0);
  });

  it("draws the fuse from the setup's range", () => {
    const long = potatoReducer(ready({ ...setup, fuse: "long" }), { type: "light", rng: () => 0.999999, at: T0 + 1000 });
    expect(long.fuseMs).toBe(90_000);
  });

  it("ignores a Start within the tap guard of the last tap", () => {
    const s = ready();
    expect(potatoReducer(s, { type: "light", rng: zero, at: T0 + POTATO_TAP_GUARD_MS - 1 })).toBe(s);
    expect(potatoReducer(s, { type: "light", rng: zero, at: T0 + POTATO_TAP_GUARD_MS }).phase).toBe("playing");
  });
});

describe("potatoReducer: passing", () => {
  const lit = T0 + 1000;

  it("passes the phone to the next player in seat order", () => {
    let s = playing();
    const holders: number[] = [];
    for (let i = 1; i <= 5; i++) {
      s = potatoReducer(s, { type: "pass", at: lit + i * 1000 });
      holders.push(s.holder);
    }
    expect(holders).toEqual([1, 2, 3, 0, 1]);
    expect(s.phase).toBe("playing");
  });

  it("skips the players who are out", () => {
    const s = { ...playing(), lives: [2, 0, 2, 0] };
    expect(run(s, { type: "pass", at: lit + 1000 }).holder).toBe(2);
    expect(run(s, { type: "pass", at: lit + 1000 }, { type: "pass", at: lit + 2000 }).holder).toBe(0);
  });

  it("ignores a Pass within 250 ms of the last tap", () => {
    const s = potatoReducer(playing(), { type: "pass", at: lit + 1000 });
    expect(POTATO_TAP_GUARD_MS).toBe(250);
    expect(potatoReducer(s, { type: "pass", at: lit + 1249 })).toBe(s);
    expect(potatoReducer(s, { type: "pass", at: lit + 1250 }).holder).toBe(2);
  });

  it("keeps the same task for the whole round", () => {
    const s = playing();
    expect(run(s, { type: "pass", at: lit + 1000 }, { type: "pass", at: lit + 2000 }).task).toBe(s.task);
  });
});

describe("potatoReducer: the fuse", () => {
  const lit = T0 + 1000;

  it("bangs only once the fuse has run out, on the holder", () => {
    const s = potatoReducer(playing(), { type: "pass", at: lit + 2000 });
    expect(potatoReducer(s, { type: "tick", at: lit + 9_999 })).toBe(s);
    const bang = potatoReducer(s, { type: "tick", at: lit + 10_000 });
    expect(bang.phase).toBe("bang");
    expect(bang.holder).toBe(1);
    expect(bang.lives).toEqual([2, 1, 2, 2]);
    expect(bang.bangAt).toBe(lit + 10_000);
    expect(bang.outOrder).toEqual([]);
  });

  it("is not tap-guarded and does not restart the guard", () => {
    const s = potatoReducer(playing(), { type: "pass", at: lit + 9_900 });
    const bang = potatoReducer(s, { type: "tick", at: lit + 10_000 });
    expect(bang.phase).toBe("bang");
    expect(bang.lastActionAt).toBe(lit + 9_900);
  });

  it("bangs on the holder when a Pass comes at or after the fuse's end", () => {
    const s = potatoReducer(playing(), { type: "pass", at: lit + 2000 });
    const late = potatoReducer(s, { type: "pass", at: lit + 10_000 });
    expect(late.phase).toBe("bang");
    expect(late.holder).toBe(1);
    expect(late.lives).toEqual([2, 1, 2, 2]);
    expect(late.bangAt).toBe(lit + 10_000);
  });

  it("leaves a late Pass inside the tap guard to the next tick, which bangs on the same holder", () => {
    const s = potatoReducer(playing(), { type: "pass", at: lit + 9_900 });
    expect(potatoReducer(s, { type: "pass", at: lit + 10_050 })).toBe(s);
    expect(potatoReducer(s, { type: "tick", at: lit + 10_100 }).holder).toBe(1);
  });

  it("counts only the time the game is on screen", () => {
    const s = run(playing(), { type: "pause", at: lit + 3000 });
    expect(s.litAt).toBeNull();
    expect(s.burntMs).toBe(3000);
    expect(potatoReducer(s, { type: "tick", at: lit + 60_000 })).toBe(s);
    expect(potatoReducer(s, { type: "pass", at: lit + 60_000 }).phase).toBe("playing");
    const back = potatoReducer(s, { type: "resume", at: lit + 100_000 });
    expect(back.litAt).toBe(lit + 100_000);
    expect(potatoReducer(back, { type: "tick", at: lit + 106_999 }).phase).toBe("playing");
    expect(potatoReducer(back, { type: "tick", at: lit + 107_000 }).phase).toBe("bang");
  });

  it("takes a second pause or resume in a row as nothing", () => {
    const paused = potatoReducer(playing(), { type: "pause", at: lit + 3000 });
    expect(potatoReducer(paused, { type: "pause", at: lit + 5000 })).toBe(paused);
    const resumed = potatoReducer(paused, { type: "resume", at: lit + 8000 });
    expect(potatoReducer(resumed, { type: "resume", at: lit + 9000 })).toBe(resumed);
  });

  it("pauses and resumes right after a tap, without touching the tap guard", () => {
    const s = potatoReducer(playing(), { type: "pass", at: lit + 2000 });
    const paused = potatoReducer(s, { type: "pause", at: lit + 2010 });
    expect(paused.litAt).toBeNull();
    expect(paused.lastActionAt).toBe(lit + 2000);
    const resumed = potatoReducer(paused, { type: "resume", at: lit + 2020 });
    expect(resumed.litAt).toBe(lit + 2020);
    expect(resumed.lastActionAt).toBe(lit + 2000);
  });

  it("ignores the clock outside a round", () => {
    const s = ready();
    for (const type of ["tick", "pause", "resume"] as const) expect(potatoReducer(s, { type, at: T0 + 50_000 })).toBe(s);
  });
});

describe("potatoReducer: after the bang", () => {
  const lit = T0 + 1000;
  const bangAt = lit + 10_000;
  const banged = (s: PotatoSetup = setup) => potatoReducer(playing(s), { type: "tick", at: bangAt });

  it("keeps Next locked for 1.5 s after the bang", () => {
    const s = banged();
    expect(POTATO_NEXT_LOCK_MS).toBe(1500);
    expect(potatoReducer(s, { type: "next", at: bangAt + 1499 })).toBe(s);
    expect(potatoReducer(s, { type: "next", at: bangAt + 1500 }).phase).toBe("ready");
  });

  it("locks Next after a bang from a late Pass too", () => {
    const s = potatoReducer(playing(), { type: "pass", at: bangAt });
    expect(potatoReducer(s, { type: "next", at: bangAt + 1000 })).toBe(s);
    expect(potatoReducer(s, { type: "next", at: bangAt + 1500 }).phase).toBe("ready");
  });

  it("starts the next round with the living player after the one who exploded", () => {
    const s = run({ ...playing(), holder: 2 }, { type: "tick", at: bangAt }, { type: "next", at: bangAt + 2000 });
    expect(s.phase).toBe("ready");
    expect(s.holder).toBe(3);
    expect(s.task).toBeNull();
    const skipping = run({ ...playing(), holder: 2, lives: [2, 2, 2, 0] }, { type: "tick", at: bangAt }, { type: "next", at: bangAt + 2000 });
    expect(skipping.holder).toBe(0);
  });

  it("takes a player with no life left out of the game", () => {
    const s = banged({ ...setup, lives: 1 });
    expect(s.lives).toEqual([0, 1, 1, 1]);
    expect(s.outOrder).toEqual([0]);
    const next = run(s, { type: "next", at: bangAt + 2000 }, { type: "light", rng: zero, at: bangAt + 3000 });
    expect(next.holder).toBe(1);
    expect(run(next, { type: "pass", at: bangAt + 4000 }, { type: "pass", at: bangAt + 5000 }, { type: "pass", at: bangAt + 6000 }).holder).toBe(1);
  });

  it("ends with the last player left as the winner and the order the others went out in", () => {
    let s = ready({ ...setup, players: ["Ann", "Bob", "Cem"], lives: 1 });
    let at = T0;
    const round = () => {
      s = run(s, { type: "light", rng: zero, at: (at += 1000) });
      s = run(s, { type: "tick", at: (at += 10_000) });
      s = run(s, { type: "next", at: (at += 2000) });
    };
    round();
    expect(s.phase).toBe("ready");
    round();
    expect(s.phase).toBe("end");
    expect(winner(s)).toBe(2);
    expect(s.outOrder).toEqual([0, 1]);
    expect(winner(ready())).toBeNull();
  });

  it("does not repeat a task within a game", () => {
    // One letter task, one ready-made, in turn: every task of the pool once.
    const kinds = seq(0.1, 0, 0, 0.9, 0, 0);
    let s = ready({ ...setup, lives: 5 });
    let at = T0;
    const tasks: string[] = [];
    for (let i = 0; i < 6; i++) {
      s = run(s, { type: "light", rng: kinds, at: (at += 1000) });
      tasks.push(s.task!.id);
      s = run(s, { type: "tick", at: (at += s.fuseMs) }, { type: "next", at: (at += 2000) });
    }
    expect(tasks.sort()).toEqual(["en-1", "en-2", "en-3", "en:animals:S", "en:animals:T", "en:food:B"]);
  });
});

describe("potatoReducer: Play again and New game", () => {
  function ended(): PotatoState {
    let s = ready({ ...setup, players: ["Ann", "Bob", "Cem"], lives: 1 });
    let at = T0;
    for (let i = 0; i < 2; i++) {
      s = run(s, { type: "light", rng: zero, at: (at += 1000) }, { type: "tick", at: (at += 10_000) }, { type: "next", at: (at += 2000) });
    }
    return s;
  }

  it("plays again with the same players and rules and keeps the used tasks", () => {
    const end = ended();
    expect(end.phase).toBe("end");
    const again = potatoReducer(end, { type: "playAgain", rng: () => 0.5, at: end.lastActionAt + 1000 });
    expect(again.phase).toBe("ready");
    expect(again.setup).toBe(end.setup);
    expect(again.lives).toEqual([1, 1, 1]);
    expect(again.outOrder).toEqual([]);
    expect(again.used).toEqual(end.used);
    expect(again.holder).toBe(1);
    const lit = potatoReducer(again, { type: "light", rng: zero, at: end.lastActionAt + 2000 });
    expect(end.used).not.toContain(lit.task!.id);
  });

  it("goes back to the setup on New game and keeps the used tasks and the tap time", () => {
    const end = ended();
    const at = end.lastActionAt + 1000;
    const s = potatoReducer(end, { type: "newGame", at });
    expect(s.phase).toBe("setup");
    expect(s.setup).toBe(end.setup);
    expect(s.used).toEqual(end.used);
    expect(s.lastActionAt).toBe(at);
    expect(potatoReducer(s, { type: "start", setup, pool, rng: zero, at: at + 100 })).toBe(s);
  });

  it("ignores Play again and New game within the tap guard and outside the end", () => {
    const end = ended();
    expect(potatoReducer(end, { type: "playAgain", rng: zero, at: end.lastActionAt + 100 })).toBe(end);
    expect(potatoReducer(end, { type: "newGame", at: end.lastActionAt + 100 })).toBe(end);
    const s = ready();
    expect(potatoReducer(s, { type: "playAgain", rng: zero, at: T0 + 5000 })).toBe(s);
    expect(potatoReducer(s, { type: "newGame", at: T0 + 5000 })).toBe(s);
  });
});

describe("fuseStage", () => {
  const fuse = { fuseMs: 10_000, burntMs: 0, litAt: T0 };

  it("pulses in the last quarter and faster in the last tenth", () => {
    expect(fuseStage(fuse, T0 + 7_499)).toBe("calm");
    expect(fuseStage(fuse, T0 + 7_500)).toBe("pulse");
    expect(fuseStage(fuse, T0 + 8_999)).toBe("pulse");
    expect(fuseStage(fuse, T0 + 9_000)).toBe("fast");
  });

  it("counts only on-screen time while paused", () => {
    expect(fuseStage({ ...fuse, burntMs: 7_000, litAt: null }, T0 + 60_000)).toBe("calm");
    expect(fuseStage({ ...fuse, burntMs: 9_500, litAt: null }, T0 + 60_000)).toBe("fast");
  });
});

describe("taskText", () => {
  it("builds a letter task in the game's language", () => {
    const task: PotatoTask = { kind: "letter", id: "x", category: "animals", letter: "S" };
    expect(taskText(task, "en")).toBe("An animal starting with S");
    expect(taskText(task, "tr")).toBe("S ile başlayan bir hayvan");
    expect(taskText({ ...task, category: "body", letter: "İ" }, "tr")).toBe("İ ile başlayan bir vücut parçası");
  });

  it("names every category in both languages", () => {
    for (const lang of ["en", "tr"] as const) {
      for (const category of POTATO_CATEGORIES) {
        const text = taskText({ kind: "letter", id: "x", category, letter: "A" }, lang);
        expect(text).not.toMatch(/\{|undefined/);
      }
    }
  });

  it("shows a ready-made task as written", () => {
    expect(taskText({ kind: "prompt", id: "en-1", text: "Something round" }, "tr")).toBe("Something round");
  });
});
