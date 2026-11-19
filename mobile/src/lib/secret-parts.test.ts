import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: "tr" }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));

import { Pressable, Text } from "react-native";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SECRET_ALPHABET, SECRET_COLORS, newSecretRound, secretSubmit, secretType, type SecretRound } from "@ptracker/shared/secret-word";
import { SecretBoard, SecretKeyboard, SecretLegend, SecretLetter, SecretResult } from "@/components/games/secret/secret-parts";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

// Renders function components down to host elements.
function expand(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  if (typeof el.type === "function" && ![Pressable, Text, PrimaryButton].includes(el.type as never) && el.type.name !== "View") {
    return expand((el.type as (p: Props) => unknown)(el.props));
  }
  return [el, ...expand(el.props.children)];
}

const c = SECRET_COLORS.light;
const round = (typed: string[], guesses: string[] = []): SecretRound => {
  let r = newSecretRound({ id: "animals-1", word: "KÖPEK", category: "animals" }, "tr");
  for (const g of guesses) r = secretSubmit([...g].reduce(secretType, r));
  return typed.reduce(secretType, r);
};

describe("SecretKeyboard", () => {
  it("has a key for every Turkish letter, plus Enter and delete with spoken labels", () => {
    const onKey = vi.fn();
    const keys = expand(SecretKeyboard({ round: round([]), marks: {}, palette: c, onKey })).filter((n) => n.type === Pressable);
    const labels = keys.map((k) => k.props.accessibilityLabel);
    expect(labels).toEqual(expect.arrayContaining([...SECRET_ALPHABET.tr, "secretEnter", "secretDelete"]));
    expect(keys).toHaveLength(SECRET_ALPHABET.tr.length + 2);
    (keys.find((k) => k.props.accessibilityLabel === "Ş")!.props.onPressIn as () => void)();
    const enter = keys.find((k) => k.props.accessibilityLabel === "secretEnter")!;
    expect(enter.props.onPressIn).toBeUndefined();
    (enter.props.onPress as () => void)();
    (keys.find((k) => k.props.accessibilityLabel === "secretDelete")!.props.onPressIn as () => void)();
    expect(onKey.mock.calls).toEqual([["Ş"], ["Enter"], ["Backspace"]]);
  });

  it("shows each key's mark", () => {
    const keys = expand(SecretKeyboard({ round: round([]), marks: { K: "hit", A: "near", Y: "miss" }, palette: c, onKey: () => undefined })).filter(
      (n) => n.type === Pressable
    );
    const style = (l: string) => Object.assign({}, ...(keys.find((k) => k.props.accessibilityLabel === l)!.props.style as object[]));
    expect(style("K").backgroundColor).toBe(c.hit);
    expect(style("A").borderBottomColor).toBe(c.near);
    expect(style("Y").opacity).toBe(0.6);
    expect(style("B").backgroundColor).toBe(c.key);
  });
});

describe("SecretLetter and SecretBoard", () => {
  const look = (mark: "hit" | "near" | "miss" | "typed" | "empty") => {
    const [box, text] = expand(SecretLetter({ slot: { letter: "K", mark }, palette: c, size: 30 }));
    return { box: Object.assign({}, ...(box.props.style as object[])), text: Object.assign({}, ...(text.props.style as object[])) };
  };

  it("marks by shape as well as colour", () => {
    expect(look("hit").box).toMatchObject({ backgroundColor: c.hit, borderRadius: 999 });
    expect(look("near").box).toMatchObject({ borderBottomWidth: 4, borderBottomColor: c.near });
    expect(look("miss").text).toMatchObject({ color: c.miss, textDecorationLine: "line-through" });
    expect(look("empty").box).toMatchObject({ borderBottomColor: c.line });
  });

  it("draws six lines that share the height it is given", () => {
    const board = SecretBoard({ round: round(["K"], ["KAYAK"]), palette: c, width: 340, height: 300 }) as Node;
    const lines = (board.props.children as unknown[])[1] as Node[];
    expect(lines).toHaveLength(6);
    expect((lines[0].props.style as { height: number }).height).toBe(50);
    const tiny = SecretBoard({ round: round([], ["KAYAK"]), palette: c, width: 340, height: 60 }) as Node;
    const tinyLine = ((tiny.props.children as unknown[])[1] as Node[])[0];
    const letter = (tinyLine.props.children as Node[])[0];
    expect(letter.props.size).toBeLessThanOrEqual((tinyLine.props.style as { height: number }).height);
  });
});

describe("SecretResult", () => {
  it("offers the next word after a win and Again after a loss", () => {
    const won = round([], ["KÖPEK"]);
    const next = vi.fn();
    const shown = expand(SecretResult({ round: won, streak: 2, best: 2, newBest: true, onNext: next, onBack: () => undefined }));
    expect(shown.find((n) => n.type === PrimaryButton)!.props).toMatchObject({ label: "secretNext", onPress: next });
    expect(shown.some((n) => n.type === Text && n.props.children === "soloNewBest")).toBe(true);
    let lost = round([]);
    for (let i = 0; i < 6; i++) lost = secretSubmit([..."KAYAK"].reduce(secretType, lost));
    const after = expand(SecretResult({ round: lost, streak: 0, best: 2, newBest: false, onNext: next, onBack: () => undefined }));
    expect(after.find((n) => n.type === PrimaryButton)!.props.label).toBe("soloAgain");
  });

  it("goes back to the games from the back button", () => {
    const back = vi.fn();
    const shown = expand(SecretResult({ round: round([], ["KÖPEK"]), streak: 1, best: 1, newBest: false, onNext: () => undefined, onBack: back }));
    const button = shown.find((n) => n.type === Pressable && (n.props.children as Node).props.children === "soloBackToGames")!;
    (button.props.onPress as () => void)();
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe("SecretLegend", () => {
  it("shows a hit, a near and a miss sample with their labels", () => {
    const items = (SecretLegend({ palette: c }) as Node).props.children as Node[];
    const shown = items.map((item) => {
      const [sample, label] = item.props.children as [Node, Node];
      return [sample.type, (sample.props.slot as { mark: string }).mark, label.type, label.props.children];
    });
    expect(shown).toEqual([
      [SecretLetter, "hit", Text, "secretLegendHit"],
      [SecretLetter, "near", Text, "secretLegendNear"],
      [SecretLetter, "miss", Text, "secretLegendMiss"],
    ]);
  });
});
