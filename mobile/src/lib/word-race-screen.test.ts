import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { VocabWord } from "@ptracker/shared/vocab";

type Pressed = { onPress?: () => void; className?: string; accessibilityLabel?: string; children?: unknown };
type Button = { label: string; onPress: () => void; disabled?: boolean };

const state = vi.hoisted(() => ({
  texts: [] as unknown[],
  pressables: [] as { onPress?: () => void; className?: string; accessibilityLabel?: string; children?: unknown }[],
  buttons: [] as { label: string; onPress: () => void; disabled?: boolean }[],
  store: new Map<string, string>(),
  get: async (_path: string) => undefined as unknown,
  back: () => undefined as void,
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return {
    Pressable: (props: Pressed) => {
      state.pressables.push(props);
      return h(Fragment, null, props.children as never);
    },
    ScrollView: pass,
    Text: ({ children }: { children?: unknown }) => {
      state.texts.push(children);
      const nested = (Array.isArray(children) ? children : [children]).filter((c) => c && typeof c === "object");
      return h(Fragment, null, ...(nested as never[]));
    },
    View: pass,
  };
});
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: { back: () => state.back() },
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
  };
});
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => state.store.get(k) ?? null,
    setItem: async (k: string, v: string) => void state.store.set(k, v),
    removeItem: async (k: string) => void state.store.delete(k),
  },
}));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ptracker/shared/i18n")>();
  return { ...actual, useLang: () => ({ lang: "en", t: actual.translationsFor("en") }) };
});
vi.mock("@/lib/auth-context", () => {
  // The real provider hands out the same client on every render.
  const auth = { api: { get: (p: string) => state.get(p) }, user: { id: "u1" } };
  return { useAuth: () => auth };
});
vi.mock("@/components/tab-screen", async () => {
  const { Fragment, createElement: h } = await import("react");
  return { TabScreen: ({ children }: { children?: unknown }) => h(Fragment, null, children as never) };
});
vi.mock("@/components/ui/primary-button", () => ({
  PrimaryButton: (props: Button) => {
    state.buttons.push(props);
    return null;
  },
}));

import { translationsFor } from "@ptracker/shared/i18n";
import WordRaceScreen from "@/app/words/race";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as { createRoot: (c: unknown) => Root };
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = translationsFor("en");
const NOW = Date.UTC(2026, 10, 25, 18, 0, 0);
let root: Root | null = null;

function container() {
  const noop = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...noop }, ...noop };
}

function word(id: string, w: string, meaning: string): VocabWord {
  return {
    id, user_id: "u1", word: w, word_key: w, meaning_tr: meaning, ipa: null, audio_url: null, senses: [],
    lookup: "found", streak: 0, learned_at: null, reviewed_at: null, created_at: "2026-11-25T10:00:00Z",
  };
}
const list = [word("r1", "budget", "bütçe"), word("r2", "thrive", "gelişmek"), word("r3", "frugal", "tutumlu"), word("r4", "vivid", "canlı")];
const answerFor: Record<string, string> = { bütçe: "budget", gelişmek: "thrive", tutumlu: "frugal", canlı: "vivid" };

const flat = (c: unknown): string => {
  if (Array.isArray(c)) return c.map(flat).join("");
  if (typeof c === "string" || typeof c === "number") return String(c);
  if (c && typeof c === "object" && "props" in c) return flat((c as { props: { children?: unknown } }).props.children);
  return "";
};
function reset() {
  state.texts = [];
  state.pressables = [];
  state.buttons = [];
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}
async function mount() {
  reset();
  root = createRoot(container());
  await act(async () => root?.render(createElement(WordRaceScreen)));
  await flush();
}
async function advance(ms: number) {
  reset();
  await act(async () => void vi.advanceTimersByTime(ms));
  await flush();
}
// Each render appends; the last render's texts come last, so read the latest window.
const texts = () => state.texts.map(flat);
const text = () => texts().join(" | ");
const clue = () => texts().findLast((s) => s in answerFor);
const choices = () => {
  const words = Object.values(answerFor);
  const latest = new Map<string, Pressed>();
  for (const p of state.pressables) if (words.includes(flat(p.children))) latest.set(flat(p.children), p);
  return [...latest.values()];
};
const choice = (w: string) => choices().find((p) => flat(p.children) === w)!;
const right = () => answerFor[clue()!];
const wrong = () => Object.values(answerFor).find((w) => w !== right())!;
// No reset: an ignored tap renders nothing new, so the last render must stay readable.
async function press(target: { onPress?: () => void } | undefined) {
  if (!target?.onPress) throw new Error(`nothing to press in ${text()}`);
  await act(async () => target.onPress!());
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"], now: NOW });
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.store = new Map();
  state.back = vi.fn();
  state.get = vi.fn(async () => list);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WordRaceScreen", () => {
  it("starts at once with a clue and four choices, and keeps the list for offline races", async () => {
    await mount();
    expect(state.get).toHaveBeenCalledWith("/api/words");
    expect(text()).toContain("60s");
    expect(clue()).toBeTruthy();
    expect(choices()).toHaveLength(4);
    expect(JSON.parse(state.store.get("words-race-list")!)).toHaveLength(4);
  });

  it("scores a right answer, ignores taps during the pause, then asks the next word", async () => {
    await mount();
    const first = clue();
    const answer = right();
    const miss = wrong();
    await press(choice(answer));
    expect(text()).toContain("Score: 1");
    expect(choice(answer).className).toContain("bg-emerald-600");
    await press(choice(miss));
    expect(text()).not.toContain("Score: 2");
    expect(text()).not.toContain("57s");
    expect(choice(miss).className).not.toContain("bg-red-600");
    await advance(600);
    expect(clue()).not.toBe(first);
    expect(choices().every((p) => !String(p.className).includes("bg-emerald-600"))).toBe(true);
  });

  it("shows a wrong pick in red next to the right answer and takes three seconds off", async () => {
    await mount();
    const answer = right();
    const miss = wrong();
    await press(choice(miss));
    expect(choice(miss).className).toContain("bg-red-600");
    expect(choice(answer).className).toContain("bg-emerald-600");
    expect(text()).toContain("57s");
  });

  it("ends at zero with the score, best combo, missed words and a saved new best", async () => {
    await mount();
    const missedClue = clue()!;
    await press(choice(wrong()));
    await advance(600);
    await press(choice(right()));
    await advance(60_000);
    await flush();
    expect(text()).toContain("Score: 1");
    expect(text()).toContain("Best combo: 1");
    expect(text()).toContain(t.wordRaceMissed);
    expect(text()).toContain(answerFor[missedClue]);
    expect(text()).toContain(missedClue);
    expect(text()).toContain(t.wordRaceNewBest);
    expect(state.store.get("words-race-best")).toBe("1");
    expect(choices()).toHaveLength(0);
  });

  it("plays again with the list read again", async () => {
    await mount();
    await advance(60_000);
    expect(text()).toContain(t.wordRaceNoMissed);
    await press(state.buttons.findLast((b) => b.label === t.wordRacePlayAgain));
    expect(state.get).toHaveBeenCalledTimes(2);
    expect(text()).toContain("60s");
    expect(choices()).toHaveLength(4);
  });

  it("races with the saved copy when the list cannot be read", async () => {
    state.store.set("words-race-list", JSON.stringify(list));
    state.get = vi.fn(async () => {
      throw new Error("offline");
    });
    await mount();
    expect(clue()).toBeTruthy();
    expect(text()).not.toContain(t.wordsLoadFailed);
  });

  it("ignores a saved copy that belongs to someone else", async () => {
    state.store.set("words-race-list", JSON.stringify(list.map((w) => ({ ...w, user_id: "u2" }))));
    state.get = vi.fn(async () => {
      throw new Error("offline");
    });
    await mount();
    expect(text()).toContain(t.wordsLoadFailed);
    expect(clue()).toBeUndefined();
  });

  it("says four words are needed when too few can be asked", async () => {
    state.get = vi.fn(async () => list.slice(0, 3));
    await mount();
    expect(text()).toContain(t.wordRaceNeedWords);
    expect(choices()).toHaveLength(0);
  });
});
