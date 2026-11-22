import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const scheme = vi.hoisted(() => ({ value: "light" as "light" | "dark" }));

vi.mock("react-native", () => ({ Pressable: "Pressable", Text: "Text", View: "View" }));
vi.mock("expo-symbols", () => ({ SymbolView: "SymbolView" }));
vi.mock("expo-web-browser", () => ({ openBrowserAsync: vi.fn() }));
vi.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => scheme.value }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ptracker/shared/i18n")>();
  return { ...actual, useLang: () => ({ lang: "en", t: actual.translationsFor("en") }) };
});

import { AudioButton, SenseList, StreakDots } from "@/components/words/word-parts";

type El = ReactElement<{ children?: unknown; tintColor?: string }>;
const isEl = (c: unknown): c is El => typeof c === "object" && c !== null && "props" in c;
const flat = (c: unknown): string => {
  if (Array.isArray(c)) return c.map(flat).join("");
  if (typeof c === "string" || typeof c === "number") return String(c);
  if (isEl(c) && c.type !== "Text") return flat(c.props.children);
  return "";
};
function texts(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => texts(n, out));
  else if (isEl(node)) {
    if (node.type === "Text") out.push(flat(node.props.children));
    texts(node.props.children, out);
  }
  return out;
}
function find(node: unknown, type: string): El | undefined {
  if (Array.isArray(node)) return node.map((n) => find(n, type)).find(Boolean);
  if (!isEl(node)) return undefined;
  return node.type === type ? node : find(node.props.children, type);
}

beforeEach(() => {
  scheme.value = "light";
});

describe("AudioButton", () => {
  it("tints the speaker emerald 700 in the light theme", () => {
    expect(find(AudioButton({ url: "https://x/a-us.mp3" }), "SymbolView")?.props.tintColor).toBe("#047857");
  });

  it("tints the speaker mint in the dark theme", () => {
    scheme.value = "dark";
    expect(find(AudioButton({ url: "https://x/a-us.mp3" }), "SymbolView")?.props.tintColor).toBe("#6ee7b7");
  });
});

describe("StreakDots", () => {
  it("fills one dot per correct answer in a row", () => {
    expect(texts(StreakDots({ word: { streak: 2, learned_at: null } }))).toEqual(["●●○"]);
  });

  it("shows a check once the word is learned", () => {
    expect(texts(StreakDots({ word: { streak: 3, learned_at: "2026-11-22T11:00:00Z" } }))).toEqual(["✓"]);
  });
});

describe("SenseList", () => {
  it("groups the senses by part of speech, numbers them and quotes the example", () => {
    const tree = SenseList({
      senses: [
        { pos: "noun", definition: "money set aside", example: "a tight budget" },
        { pos: "verb", definition: "to plan spending" },
        { pos: "noun", definition: "a plan of spending" },
      ],
    });
    expect(texts(tree)).toEqual([
      "noun", "1. money set aside", "“a tight budget”", "2. a plan of spending",
      "verb", "1. to plan spending",
    ]);
  });
});
