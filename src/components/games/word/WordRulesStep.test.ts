import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { defaultWordSetup, type WordSetup } from "@/lib/word-game";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordSeconds" ? "{n} s" : String(key)),
    }),
  }),
}));

import WordRulesStep from "./WordRulesStep";

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
const render = (v: WordSetup = value) => WordRulesStep({ value: v, onChange }) as Node;
const group = (tree: Node, label: string) =>
  nodes(nodes(tree).find((n) => n.props["aria-label"] === label)!).filter((n) => n.type === "button");
const click = (node: Node) => (node.props.onClick as () => void)();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WordRulesStep", () => {
  it("shows each mode with its one-line rule and picks one", () => {
    const modes = group(render(), "wordMode");
    expect(modes.map(text)).toEqual([
      "wordModeFreewordModeFreeRule",
      "wordModeForbiddenwordModeForbiddenRule",
      "wordModeMimewordModeMimeRule",
    ]);
    expect(modes.map((b) => b.props["aria-pressed"])).toEqual([true, false, false]);
    click(modes[2]);
    expect(onChange).toHaveBeenLastCalledWith({ ...value, mode: "mime" });
  });

  it("sets the turn time and the passes", () => {
    const times = group(render(), "wordTurnTime");
    expect(times.map(text)).toEqual(["30 s", "60 s", "90 s"]);
    click(times[2]);
    expect(onChange).toHaveBeenLastCalledWith({ ...value, turnSeconds: 90 });
    const passes = group(render(), "wordPasses");
    expect(passes.map(text)).toEqual(["0", "3", "wordPassesUnlimited"]);
    expect(passes.map((b) => b.props["aria-pressed"])).toEqual([false, true, false]);
    click(passes[2]);
    expect(onChange).toHaveBeenLastCalledWith({ ...value, passLimit: null });
  });

  it("asks for the rounds or the target score, whichever ends the game", () => {
    const tree = render();
    expect(group(tree, "wordRounds").map(text)).toEqual(["1", "2", "3"]);
    expect(nodes(tree).some((n) => n.props["aria-label"] === "wordTarget")).toBe(false);
    click(group(tree, "wordEndBy")[1]);
    expect(onChange).toHaveBeenLastCalledWith({ ...value, endBy: "target" });
    const target = render({ ...value, endBy: "target" });
    expect(group(target, "wordTarget").map(text)).toEqual(["20", "30", "50"]);
    click(group(target, "wordTarget")[2]);
    expect(onChange).toHaveBeenLastCalledWith({ ...value, endBy: "target", target: 50 });
  });
});
