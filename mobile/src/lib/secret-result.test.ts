import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => {
  const templates: Record<string, string> = {
    secretWon: "Got it on try {n}!",
    secretLost: "The word was {word}.",
    secretStreak: "Streak: {n}",
    soloBest: "Best: {n}",
    soloNewBest: "New best!",
  };
  return {
    ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
    useLang: () => ({ t: new Proxy(templates, { get: (target, key) => target[String(key)] ?? String(key) }), lang: "en" }),
  };
});
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));

import { Pressable, Text } from "react-native";
import { PrimaryButton } from "@/components/ui/primary-button";
import { newSecretRound, secretSubmit, secretType, type SecretRound } from "@ptracker/shared/secret-word";
import { SecretResult } from "@/components/games/secret/secret-parts";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function expand(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  if (typeof el.type === "function" && ![Pressable, Text, PrimaryButton].includes(el.type as never) && el.type.name !== "View") {
    return expand((el.type as (p: Props) => unknown)(el.props));
  }
  return [el, ...expand(el.props.children)];
}

const play = (guesses: string[]): SecretRound => {
  let r = newSecretRound({ id: "animals-1", word: "KÖPEK", category: "animals" }, "tr");
  for (const g of guesses) r = secretSubmit([...g].reduce(secretType, r));
  return r;
};

const won = () => play(["KÖPEK"]);
const lost = () => play(Array(6).fill("KAYAK"));

function texts(round: SecretRound, extra: { streak?: number; best?: number; newBest?: boolean } = {}): unknown[] {
  const shown = expand(
    SecretResult({ round, streak: 2, best: 1, newBest: false, onNext: () => undefined, onBack: () => undefined, ...extra })
  );
  return shown.filter((n) => n.type === Text).map((n) => n.props.children);
}

describe("SecretResult text", () => {
  it("names the try a won round was guessed on", () => {
    expect(texts(won())).toContain("Got it on try 1!");
  });

  it("reveals the word after a lost round", () => {
    expect(lost().phase).toBe("lost");
    expect(texts(lost())).toContain("The word was KÖPEK.");
  });

  it("shows the streak after a win", () => {
    expect(texts(won(), { streak: 2 })).toContain("Streak: 2");
  });

  it("shows no streak line after a loss", () => {
    expect(texts(lost(), { streak: 2 }).some((s) => typeof s === "string" && s.startsWith("Streak:"))).toBe(false);
  });

  it("shows the standing best when the round set no new best", () => {
    const shown = texts(won(), { best: 4, newBest: false });
    expect(shown).toContain("Best: 4");
    expect(shown).not.toContain("New best!");
  });
});
