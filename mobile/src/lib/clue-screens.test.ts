import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import {
  CLUE_MAX_LENGTH,
  CLUE_OUTCOME_LOOK,
  GAME_THEME,
  type ClueEntry,
  type ClueRoundResult,
  type WordCard,
} from "@ptracker/shared/clue-game";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));
const platform = vi.hoisted(() => ({ OS: "android" as "android" | "ios" }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.states)) hooks.states[i] = typeof initial === "function" ? initial() : initial;
      const set = (next: unknown) => {
        hooks.states[i] = typeof next === "function" ? next(hooks.states[i]) : next;
      };
      return [hooks.states[i], set];
    },
  };
});
vi.mock("react-native", () => ({
  Platform: platform,
  Pressable: () => null,
  Text: () => null,
  TextInput: () => null,
  View: () => null,
}));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        const templates: Record<string, string> = {
          clueRound: "word {n}/{total}",
          clueScoreSoFar: "score {n}",
          clueGuesses: "{name} guesses",
          clueDontLook: "{name}, no looking; give it to {next}",
          imposterPassTo: "pass to {name}",
          clueCheckHint: "{name}, don't look",
          clueKeptLabel: "{clue} by {name}, kept",
          clueStruckLabel: "{clue} by {name}, struck: {reason}",
          clueToGuess: "show {name}",
          clueGuessHint: "{name}, guess",
          clueEndScore: "{n} of {total}",
        };
        return templates[String(key)] ?? String(key);
      },
    }),
  }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/games/game-button", () => ({ GameButton: () => null }));

import { Pressable, TextInput } from "react-native";
import { ClueCheck } from "@/components/games/clue/clue-check";
import { ClueEnd } from "@/components/games/clue/clue-end";
import { ClueGate } from "@/components/games/clue/clue-gate";
import { ClueGuess } from "@/components/games/clue/clue-guess";
import { ClueHandoff } from "@/components/games/clue/clue-handoff";
import { ClueResult } from "@/components/games/clue/clue-result";
import { ClueWrite } from "@/components/games/clue/clue-write";
import { GameButton } from "@/components/games/game-button";
import { PassPhone } from "@/components/games/pass-phone";
import { PrimaryButton } from "@/components/ui/primary-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

// Renders the pass-the-phone screen on the way down, so what it hides can be checked.
function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  if (el.type === PassPhone) return [el, ...nodes(PassPhone(el.props as never))];
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  const el = node as Node;
  if (el.type === PassPhone) return text(PassPhone(el.props as never));
  return text(el.props.children);
}

/** Every string on screen, button labels and accessibility labels included. */
function everything(tree: Node): string {
  return [text(tree), ...nodes(tree).flatMap((n) => [n.props.label, n.props.accessibilityLabel].map((x) => String(x ?? "")))].join(" ");
}

const press = (node: Node | undefined) => (node!.props.onPress as () => void)();
const gameButtons = (tree: Node) => nodes(tree).filter((n) => n.type === GameButton);
const gameButton = (tree: Node, label: string) => gameButtons(tree).find((n) => String(n.props.label).includes(label));
const primary = (tree: Node) => nodes(tree).find((n) => n.type === PrimaryButton);
const flat = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style as Record<string, unknown>) ?? {});

const MOON: WordCard = { id: "nature-1", word: "Moon", level: "easy", forbidden: ["a", "b", "c", "d"] };

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  hooks.index = 0;
  platform.OS = "android";
});

describe("ClueHandoff (mobile)", () => {
  it("names the guesser, who takes the phone, the word's number and the score", () => {
    const onBegin = vi.fn();
    const tree = ClueHandoff({ guesser: "Ann", next: "Bob", round: 3, total: 13, score: 2, onBegin }) as Node;
    const all = everything(tree);
    expect(all).toContain("word 3/13");
    expect(all).toContain("score 2");
    expect(all).toContain("Ann guesses");
    expect(all).toContain("Ann, no looking; give it to Bob");
    press(gameButton(tree, "clueBegin"));
    expect(onBegin).toHaveBeenCalledTimes(1);
  });
});

describe("ClueWrite (mobile)", () => {
  const onReveal = vi.fn();
  const onSubmit = vi.fn();
  function render(revealed: boolean): Node {
    hooks.index = 0;
    return ClueWrite({ giver: "Bob", word: "Moon", revealed, onReveal, onSubmit }) as Node;
  }
  const input = (tree: Node) => nodes(tree).find((n) => n.type === TextInput)!;
  const type = (value: string) => (input(render(true)).props.onChangeText as (v: string) => void)(value);
  const done = (tree: Node) => gameButton(tree, "clueDone")!;
  const enter = (tree: Node) => (input(tree).props.onSubmitEditing as () => void)();
  const alert = (tree: Node) => nodes(tree).find((n) => n.props.accessibilityRole === "alert");

  it("hands the phone to the giver without the word until they show it", () => {
    const tree = render(false);
    expect(everything(tree)).toContain("pass to Bob");
    expect(everything(tree)).not.toContain("Moon");
    expect(nodes(tree).some((n) => n.type === TextInput)).toBe(false);
    press(gameButton(tree, "clueShowWord"));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("shows the word and a labelled clue field without autocomplete or autocorrect", () => {
    const tree = render(true);
    expect(text(tree)).toContain("Moon");
    expect(input(tree).props).toMatchObject({
      value: "",
      accessibilityLabel: "clueYourClue",
      autoCorrect: false,
      autoCapitalize: "none",
      autoComplete: "off",
      spellCheck: false,
      importantForAutofill: "no",
      returnKeyType: "done",
      maxLength: CLUE_MAX_LENGTH,
    });
    expect(text(tree)).toContain("clueYourClue");
    expect(text(tree)).toContain("clueClueHint");
  });

  it("turns off suggestions and autofill but keeps the normal keyboard, whose Turkish letters a password keyboard may drop", () => {
    for (const os of ["android", "ios"] as const) {
      platform.OS = os;
      const props = input(render(true)).props;
      expect(props).toMatchObject({
        autoCorrect: false,
        autoCapitalize: "none",
        autoComplete: "off",
        importantForAutofill: "no",
        spellCheck: false,
      });
      expect(props.keyboardType).toBeUndefined();
      expect(props.secureTextEntry).toBeUndefined();
    }
  });

  it("keeps Done off while the field is empty, says what is wrong with a clue, and submits a good one", () => {
    expect(done(render(true)).props.disabled).toBe(true);
    expect(alert(render(true))).toBeUndefined();
    enter(render(true));
    expect(onSubmit).not.toHaveBeenCalled();

    type("full moon");
    const spaced = render(true);
    expect(text(alert(spaced))).toBe("clueErrSpace");
    expect(done(spaced).props.disabled).toBe(true);
    enter(spaced);
    expect(onSubmit).not.toHaveBeenCalled();

    type(" Night ");
    const good = render(true);
    expect(done(good).props.disabled).toBe(false);
    expect(alert(good)).toBeUndefined();
    enter(good);
    expect(onSubmit).toHaveBeenLastCalledWith(" Night ");
    press(done(good));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("starts with an empty field when mounted for the next giver", () => {
    type("Night");
    expect(input(render(true)).props.value).toBe("Night");
    hooks.states = [];
    expect(input(render(true)).props.value).toBe("");
  });
});

describe("ClueGate (mobile)", () => {
  it("names who may look, with the app's button on the dark screen", () => {
    const onReveal = vi.fn();
    const tree = ClueGate({ title: "Clue givers", hint: "Ann, don't look", label: "Show", onReveal }) as Node;
    expect(everything(tree)).toContain("Clue givers");
    expect(everything(tree)).toContain("Ann, don't look");
    expect(gameButtons(tree)).toHaveLength(0);
    expect(primary(tree)!.props.label).toBe("Show");
    press(primary(tree));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("uses the game's dark button and dark text on a player's colour", () => {
    const tree = ClueGate({ title: "To Ann", hint: "h", label: "Show", onReveal: vi.fn(), onColor: true }) as Node;
    expect(primary(tree)).toBeUndefined();
    expect(gameButton(tree, "Show")).toBeDefined();
    const title = nodes(tree).find((n) => text(n) === "To Ann" && n.props.style)!;
    expect(flat(title.props.style).color).toBe(GAME_THEME.ink);
  });
});

const CLUES: ClueEntry[] = [
  { giver: "Bob", text: "Night", auto: null, struck: false },
  { giver: "Cem", text: "Sky", auto: "duplicate", struck: true },
  { giver: "Dan", text: "sky", auto: "duplicate", struck: false },
  { giver: "Eve", text: "Round", auto: null, struck: true },
  { giver: "Fay", text: "Moonlight", auto: "word", struck: true },
];

describe("ClueCheck (mobile)", () => {
  const onStrike = vi.fn();
  const onDone = vi.fn();
  const render = () => ClueCheck({ word: "Moon", guesser: "Ann", clues: CLUES, onStrike, onDone }) as Node;
  const rows = (tree: Node) => nodes(tree).filter((n) => n.type === Pressable);

  it("shows the givers the word, every clue and its writer, and warns the guesser off", () => {
    const all = everything(render());
    expect(all).toContain("Moon");
    expect(all).toContain("Ann, don't look");
    for (const c of CLUES) expect(all).toContain(c.giver);
  });

  it("says which clues are struck and why, not only with a line through them", () => {
    expect(rows(render()).map((r) => r.props.accessibilityLabel)).toEqual([
      "Night by Bob, kept",
      "Sky by Cem, struck: clueStruckDuplicate",
      "sky by Dan, kept",
      "Round by Eve, struck: clueStruckManual",
      "Moonlight by Fay, struck: clueStruckWord",
    ]);
    const lined = nodes(render()).filter((n) => flat(n.props.style).textDecorationLine === "line-through").map(text);
    expect(lined).toEqual(["Sky", "Round", "Moonlight"]);
  });

  it("strikes or restores a clue on a press and hands the clues to the guesser", () => {
    press(rows(render())[2]);
    expect(onStrike).toHaveBeenCalledWith(2);
    expect(primary(render())!.props.label).toBe("show Ann");
    press(primary(render()));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("ClueGuess (mobile)", () => {
  const onAnswer = vi.fn();

  it("shows the guesser the clues, and the table answers Got it, Missed or Pass", () => {
    const tree = ClueGuess({ guesser: "Ann", clues: ["Night", "sky"], onAnswer }) as Node;
    expect(text(tree)).toContain("Ann, guess");
    expect(text(tree)).toContain("Night");
    expect(text(tree)).toContain("sky");
    expect(gameButtons(tree).map((b) => b.props.label)).toEqual(["✓ clueGotIt", "✕ clueMissed", "↷ cluePass"]);
    for (const b of gameButtons(tree)) press(b);
    expect(onAnswer.mock.calls).toEqual([["got"], ["missed"], ["passed"]]);
  });

  it("says no clue is left and only lets the word be passed", () => {
    const tree = ClueGuess({ guesser: "Ann", clues: [], onAnswer }) as Node;
    expect(text(tree)).toContain("clueNoClues");
    expect(gameButtons(tree).map((b) => b.props.label)).toEqual(["↷ cluePass"]);
  });
});

const result = (outcome: ClueRoundResult["outcome"]): ClueRoundResult => ({ word: MOON, guesser: "Ann", outcome, clues: CLUES });

describe("ClueResult (mobile)", () => {
  it("shows everyone the word, the result in writing, every clue and the score", () => {
    const onNext = vi.fn();
    const tree = ClueResult({ result: result("missed"), round: 2, total: 8, score: 1, onNext }) as Node;
    const all = everything(tree);
    expect(all).toContain("Moon");
    expect(all).toContain("word 2/8");
    expect(all).toContain("score 1");
    expect(all).toContain(`${CLUE_OUTCOME_LOOK.missed.mark} clueResultMissed`);
    expect(all).toContain("Dan");
    expect(all).toContain("clueStruckManual");
    expect(primary(tree)!.props.label).toBe("clueNext");
    press(primary(tree));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("ClueEnd (mobile)", () => {
  it("shows the score, a rating line and every word with its result in writing", () => {
    const onPlayAgain = vi.fn();
    const onNewGame = vi.fn();
    const results = [result("got"), { ...result("passed"), word: { ...MOON, id: "x", word: "Sun" } }];
    const tree = ClueEnd({ results, onPlayAgain, onNewGame }) as Node;
    const all = everything(tree);
    expect(all).toContain("1 of 2");
    expect(all).toContain("clueRatingGood");
    expect(all).toContain("Moon");
    expect(all).toContain("✓ clueResultGot");
    expect(all).toContain("Sun");
    expect(all).toContain("↷ clueResultPassed");
    expect(primary(tree)!.props.label).toBe("cluePlayAgain");
    press(primary(tree));
    press(nodes(tree).find((n) => n.type === Pressable && text(n) === "clueNewGame"));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
