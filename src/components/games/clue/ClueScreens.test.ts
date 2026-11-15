import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import {
  CLUE_MAX_LENGTH,
  CLUE_OUTCOME_LOOK,
  GAME_THEME,
  type ClueEntry,
  type ClueRoundResult,
  type WordCard,
} from "@/lib/clue-game";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));

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
vi.mock("@/lib/i18n", () => ({
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

import PassPhone from "../PassPhone";
import ClueCheck from "./ClueCheck";
import ClueEnd from "./ClueEnd";
import ClueGate from "./ClueGate";
import ClueGuess from "./ClueGuess";
import ClueHandoff from "./ClueHandoff";
import ClueResult from "./ClueResult";
import ClueWrite from "./ClueWrite";

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

/** Every string a screen reader or a sighted player could get from the tree. */
function everything(tree: Node): string {
  return [text(tree), ...nodes(tree).map((n) => String(n.props["aria-label"] ?? ""))].join(" ");
}

const click = (node: Node | undefined) => (node!.props.onClick as () => void)();
const buttons = (tree: Node) => nodes(tree).filter((n) => n.type === "button");
const button = (tree: Node, label: string) => buttons(tree).find((n) => text(n).includes(label));
const style = (node: Node) => node.props.style as Record<string, string>;

const MOON: WordCard = { id: "nature-1", word: "Moon", level: "easy", forbidden: ["a", "b", "c", "d"] };

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  hooks.index = 0;
});

describe("ClueHandoff", () => {
  it("names the guesser, who takes the phone, the word's number and the score", () => {
    const onBegin = vi.fn();
    const tree = ClueHandoff({ guesser: "Ann", next: "Bob", round: 3, total: 13, score: 2, onBegin }) as Node;
    const all = everything(tree);
    expect(all).toContain("word 3/13");
    expect(all).toContain("score 2");
    expect(all).toContain("Ann guesses");
    expect(all).toContain("Ann, no looking; give it to Bob");
    click(button(tree, "clueBegin"));
    expect(onBegin).toHaveBeenCalledTimes(1);
  });

  it("writes a name that looks like a placeholder as it was typed", () => {
    const tree = ClueHandoff({ guesser: "{next}", next: "$&", round: 1, total: 8, score: 0, onBegin: vi.fn() }) as Node;
    expect(everything(tree)).toContain("{next}, no looking; give it to $&");
  });
});

describe("ClueWrite", () => {
  const onReveal = vi.fn();
  const onSubmit = vi.fn();
  function render(revealed: boolean): Node {
    hooks.index = 0;
    return ClueWrite({ giver: "Bob", word: "Moon", revealed, onReveal, onSubmit }) as Node;
  }
  const input = (tree: Node) => nodes(tree).find((n) => n.type === "input")!;
  const type = (value: string) => (input(render(true)).props.onChange as (e: unknown) => void)({ target: { value } });
  const done = (tree: Node) => buttons(tree).find((b) => b.props.type === "submit")!;
  const submit = (tree: Node) => {
    const preventDefault = vi.fn();
    (nodes(tree).find((n) => n.type === "form")!.props.onSubmit as (e: unknown) => void)({ preventDefault });
    return preventDefault;
  };

  it("hands the phone to the giver without the word until they show it", () => {
    const tree = render(false);
    expect(everything(tree)).toContain("pass to Bob");
    expect(everything(tree)).not.toContain("Moon");
    expect(nodes(tree).some((n) => n.type === "input")).toBe(false);
    click(button(tree, "clueShowWord"));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("shows the word and a labelled clue field without autocomplete or autocorrect", () => {
    const tree = render(true);
    expect(text(tree)).toContain("Moon");
    const label = nodes(tree).find((n) => n.type === "label")!;
    expect(text(label)).toContain("clueYourClue");
    expect(nodes(label).some((n) => n.type === "input")).toBe(true);
    expect(input(tree).props).toMatchObject({
      value: "",
      autoComplete: "off",
      autoCorrect: "off",
      autoCapitalize: "off",
      spellCheck: false,
      enterKeyHint: "done",
      maxLength: CLUE_MAX_LENGTH,
    });
    expect(text(tree)).toContain("clueClueHint");
  });

  it("keeps Done off while the field is empty, says what is wrong with a clue, and submits a good one with Enter", () => {
    expect(done(render(true)).props.disabled).toBe(true);
    expect(nodes(render(true)).some((n) => n.props.role === "alert")).toBe(false);
    submit(render(true));
    expect(onSubmit).not.toHaveBeenCalled();

    type("full moon");
    const spaced = render(true);
    expect(text(nodes(spaced).find((n) => n.props.role === "alert"))).toBe("clueErrSpace");
    expect(input(spaced).props["aria-invalid"]).toBe(true);
    expect(done(spaced).props.disabled).toBe(true);
    submit(spaced);
    expect(onSubmit).not.toHaveBeenCalled();

    type("?!");
    expect(text(nodes(render(true)).find((n) => n.props.role === "alert"))).toBe("clueErrNoLetter");

    type(" Night ");
    const good = render(true);
    expect(done(good).props.disabled).toBe(false);
    expect(nodes(good).some((n) => n.props.role === "alert")).toBe(false);
    expect(submit(good)).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(" Night ");
  });

  it("starts with an empty field when mounted for the next giver", () => {
    type("Night");
    expect(input(render(true)).props.value).toBe("Night");
    hooks.states = [];
    expect(input(render(true)).props.value).toBe("");
  });
});

describe("ClueGate", () => {
  it("names who may look and shows nothing else until the button", () => {
    const onReveal = vi.fn();
    const tree = ClueGate({ title: "Clue givers", hint: "Ann, don't look", label: "Show", onReveal }) as Node;
    expect(everything(tree)).toContain("Clue givers");
    expect(everything(tree)).toContain("Ann, don't look");
    expect(button(tree, "Show")!.props.className).toContain("bg-blue-600");
    click(button(tree, "Show"));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("uses the game's dark button on a player's colour", () => {
    const tree = ClueGate({ title: "To Ann", hint: "h", label: "Show", onReveal: vi.fn(), onColor: true }) as Node;
    expect(style(button(tree, "Show")!)).toEqual({ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text });
  });
});

const CLUES: ClueEntry[] = [
  { giver: "Bob", text: "Night", auto: null, struck: false },
  { giver: "Cem", text: "Sky", auto: "duplicate", struck: true },
  { giver: "Dan", text: "sky", auto: "duplicate", struck: false },
  { giver: "Eve", text: "Round", auto: null, struck: true },
  { giver: "Fay", text: "Moonlight", auto: "word", struck: true },
];

describe("ClueCheck", () => {
  const onStrike = vi.fn();
  const onDone = vi.fn();
  const render = () => ClueCheck({ word: "Moon", guesser: "Ann", clues: CLUES, onStrike, onDone }) as Node;
  const clueButtons = (tree: Node) => buttons(tree).filter((b) => b.props["aria-label"]);

  it("shows the givers the word, every clue and its writer, and warns the guesser off", () => {
    const tree = render();
    expect(text(tree)).toContain("Moon");
    expect(text(tree)).toContain("Ann, don't look");
    for (const c of CLUES) {
      expect(text(tree)).toContain(c.text);
      expect(text(tree)).toContain(c.giver);
    }
  });

  it("says which clues are struck and why, not only with a line through them", () => {
    const labels = clueButtons(render()).map((b) => b.props["aria-label"]);
    expect(labels).toEqual([
      "Night by Bob, kept",
      "Sky by Cem, struck: clueStruckDuplicate",
      "sky by Dan, kept",
      "Round by Eve, struck: clueStruckManual",
      "Moonlight by Fay, struck: clueStruckWord",
    ]);
    const struck = nodes(render()).filter((n) => String(n.props.className ?? "").includes("line-through")).map(text);
    expect(struck).toEqual(["Sky", "Round", "Moonlight"]);
    expect(text(clueButtons(render())[1])).toContain("clueStruckDuplicate");
  });

  it("strikes or restores a clue on a tap and hands the clues to the guesser", () => {
    click(clueButtons(render())[2]);
    expect(onStrike).toHaveBeenCalledWith(2);
    click(button(render(), "show Ann"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("ClueGuess", () => {
  const onAnswer = vi.fn();

  it("shows the guesser the clues large, and the table answers Got it, Missed or Pass", () => {
    const tree = ClueGuess({ guesser: "Ann", clues: ["Night", "sky"], onAnswer }) as Node;
    expect(text(tree)).toContain("Ann, guess");
    expect(nodes(tree).filter((n) => n.type === "li").map(text)).toEqual(["Night", "sky"]);
    expect(buttons(tree).map(text)).toEqual(["✓ clueGotIt", "✕ clueMissed", "↷ cluePass"]);
    click(button(tree, "clueGotIt"));
    click(button(tree, "clueMissed"));
    click(button(tree, "cluePass"));
    expect(onAnswer.mock.calls).toEqual([["got"], ["missed"], ["passed"]]);
  });

  it("says no clue is left and only lets the word be passed", () => {
    const tree = ClueGuess({ guesser: "Ann", clues: [], onAnswer }) as Node;
    expect(text(tree)).toContain("clueNoClues");
    expect(buttons(tree).map(text)).toEqual(["↷ cluePass"]);
  });
});

const result = (outcome: ClueRoundResult["outcome"]): ClueRoundResult => ({ word: MOON, guesser: "Ann", outcome, clues: CLUES });

describe("ClueResult", () => {
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
    click(button(tree, "clueNext"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("ClueEnd", () => {
  it("shows the score, a rating line and every word with its result in writing", () => {
    const onPlayAgain = vi.fn();
    const onNewGame = vi.fn();
    const results = [result("got"), { ...result("passed"), word: { ...MOON, id: "x", word: "Sun" } }];
    const tree = ClueEnd({ results, onPlayAgain, onNewGame }) as Node;
    const all = everything(tree);
    expect(all).toContain("1 of 2");
    expect(all).toContain("clueRatingGood");
    expect(nodes(tree).filter((n) => n.type === "li").map(text)).toEqual(["Moon✓ clueResultGot", "Sun↷ clueResultPassed"]);
    click(button(tree, "cluePlayAgain"));
    click(button(tree, "clueNewGame"));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
