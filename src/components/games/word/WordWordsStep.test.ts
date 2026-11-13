import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import {
  WORD_CATEGORY_CHOICES,
  WORD_CATEGORY_EMOJI,
  WORD_CATEGORY_LABEL_KEYS,
  defaultWordSetup,
  type WordSetup,
} from "@/lib/word-game";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordSeconds" ? "{n} s" : String(key)),
    }),
  }),
}));

import WordWordsStep from "./WordWordsStep";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

const onChange = vi.fn();
const value: WordSetup = defaultWordSetup(["Red", "Blue"]);
const render = () => WordWordsStep({ value, onChange }) as Node;
const group = (tree: Node, label: string) =>
  nodes(nodes(tree).find((n) => n.props["aria-label"] === label)!).filter((n) => n.type === "button");
const click = (node: Node) => (node.props.onClick as () => void)();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WordWordsStep", () => {
  it("offers Mixed and every category with its emoji and label", () => {
    expect(group(render(), "wordCategory").map(text)).toEqual(
      WORD_CATEGORY_CHOICES.map((c) => `${WORD_CATEGORY_EMOJI[c]}${WORD_CATEGORY_LABEL_KEYS[c]}`)
    );
  });

  it("marks the chosen category and picks another", () => {
    const tiles = group(render(), "wordCategory");
    expect(tiles.map((b) => b.props["aria-pressed"]).indexOf(true)).toBe(0);
    click(tiles[3]);
    expect(onChange).toHaveBeenCalledWith({ ...value, category: WORD_CATEGORY_CHOICES[3] });
  });

  it("picks the difficulty", () => {
    const pills = group(render(), "wordDifficulty");
    expect(pills.map(text)).toEqual(["wordEasy", "wordHard", "wordDifficultyMixed"]);
    expect(pills.map((b) => b.props["aria-pressed"])).toEqual([false, false, true]);
    click(pills[1]);
    expect(onChange).toHaveBeenCalledWith({ ...value, difficulty: "hard" });
  });
});
