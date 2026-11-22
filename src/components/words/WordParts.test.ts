import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactElement } from "react";

// One AudioButton instance: its ref lives across renders, as React keeps it.
const refs = vi.hoisted(() => ({ audio: null as { current: unknown } | null }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: (initial: unknown) => (refs.audio ??= { current: initial }),
}));
vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: "en" }),
}));

import { AudioButton, SenseList, StreakDots } from "@/components/words/WordParts";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function expand(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  if (typeof el.type === "function") return expand((el.type as (p: Props) => unknown)(el.props));
  return [el, ...expand(el.props.children)];
}

afterEach(() => {
  vi.unstubAllGlobals();
  refs.audio = null;
});

describe("StreakDots", () => {
  it("shows filled dots for the streak and a tick once learned", () => {
    expect((StreakDots({ word: { streak: 2, learned_at: null } }) as Node).props.children).toBe("●●○");
    expect((StreakDots({ word: { streak: 3, learned_at: "2026-11-22T00:00:00Z" } }) as Node).props.children).toBe("✓");
  });
});

describe("SenseList", () => {
  it("groups senses by part of speech and quotes the examples", () => {
    const all = expand(
      SenseList({
        senses: [
          { pos: "noun", definition: "money set aside", example: "a tight budget" },
          { pos: "verb", definition: "to plan spending" },
        ],
      })
    );
    const heads = all.filter((n) => n.type === "p" && String(n.props.className).includes("uppercase")).map((n) => n.props.children);
    expect(heads).toEqual(["noun", "verb"]);
    const quotes = all.filter((n) => n.type === "p" && String(n.props.className).includes("italic")).map((n) => n.props.children);
    expect(quotes).toEqual([["“", "a tight budget", "”"]]);
  });
});

describe("AudioButton", () => {
  it("renders nothing without a recording", () => {
    expect(AudioButton({ url: null })).toBeNull();
  });

  it("plays the recording from the start on a click", () => {
    const played: string[] = [];
    vi.stubGlobal(
      "Audio",
      class {
        currentTime = 5;
        constructor(public src: string) {}
        play() {
          played.push(`${this.src}@${this.currentTime}`);
          return Promise.resolve();
        }
      }
    );
    const button = AudioButton({ url: "https://x/budget-us.mp3" }) as Node;
    expect(button.props["aria-label"]).toBe("wordsListen");
    (button.props.onClick as () => void)();
    (button.props.onClick as () => void)();
    expect(played).toEqual(["https://x/budget-us.mp3@0", "https://x/budget-us.mp3@0"]);
  });

  it("plays the new word's recording when the same button is given another word", () => {
    const played: string[] = [];
    vi.stubGlobal(
      "Audio",
      class {
        currentTime = 0;
        constructor(public src: string) {}
        play() {
          played.push(this.src);
          return Promise.resolve();
        }
      }
    );
    (((AudioButton({ url: "https://x/one-us.mp3" }) as Node).props.onClick) as () => void)();
    (((AudioButton({ url: "https://x/two-us.mp3" }) as Node).props.onClick) as () => void)();
    expect(played).toEqual(["https://x/one-us.mp3", "https://x/two-us.mp3"]);
  });
});
