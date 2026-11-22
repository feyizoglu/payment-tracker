import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { VocabWord } from "@ptracker/shared/vocab";

type AlertButton = { text: string; style?: string; onPress?: () => void | Promise<void> };
type Pressed = { onPress?: () => void; disabled?: boolean; accessibilityLabel?: string; children?: unknown };
type Button = { label: string; onPress: () => void; disabled?: boolean };
type Field = { label: string; value: string; onChangeText: (v: string) => void };

const state = vi.hoisted(() => ({
  texts: [] as unknown[],
  pressables: [] as { onPress?: () => void; disabled?: boolean; accessibilityLabel?: string; children?: unknown }[],
  buttons: [] as { label: string; onPress: () => void; disabled?: boolean }[],
  fields: [] as { label: string; value: string; onChangeText: (v: string) => void }[],
  alert: (_title: string, _message: unknown, _buttons: { text: string; onPress?: () => void | Promise<void> }[]) => undefined as void,
  id: "w1",
  api: {
    get: async (_path: string) => undefined as unknown,
    post: async (_path: string, _body: unknown) => undefined as unknown,
    patch: async (_path: string, _body: unknown) => undefined as unknown,
    del: async (_path: string) => undefined as unknown,
  },
  router: { back: () => undefined as void, push: (_to: unknown) => undefined as void },
  browser: (_url: string) => Promise.resolve(undefined as unknown),
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return {
    ActivityIndicator: () => null,
    Alert: { alert: (title: string, message: unknown, buttons: AlertButton[]) => state.alert(title, message, buttons) },
    Pressable: (props: Pressed) => {
      state.pressables.push(props);
      return h(Fragment, null, props.children as never);
    },
    RefreshControl: () => null,
    ScrollView: pass,
    Text: ({ children }: { children?: unknown }) => {
      state.texts.push(children);
      // Nested Text still renders (and records itself); bare strings have no host to land in.
      const nested = (Array.isArray(children) ? children : [children]).filter((c) => c && typeof c === "object");
      return h(Fragment, null, ...(nested as never[]));
    },
    View: pass,
  };
});
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: { back: () => state.router.back(), push: (to: unknown) => state.router.push(to) },
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
    useLocalSearchParams: () => ({ id: state.id }),
  };
});
vi.mock("expo-symbols", () => ({ SymbolView: () => null }));
vi.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
vi.mock("expo-web-browser", () => ({ openBrowserAsync: (url: string) => state.browser(url) }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ptracker/shared/i18n")>();
  return { ...actual, useLang: () => ({ lang: "en", t: actual.translationsFor("en") }) };
});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ api: state.api }) }));
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
vi.mock("@/components/ui/text-field", () => ({
  TextField: (props: Field) => {
    state.fields.push(props);
    return null;
  },
}));

import { translationsFor } from "@ptracker/shared/i18n";
import { ApiError } from "@/lib/api";
import WordsScreen from "@/app/words/index";
import WordCardScreen from "@/app/words/[id]";
import WordsReviewScreen from "@/app/words/review";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as { createRoot: (c: unknown) => Root };
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = translationsFor("en");
let root: Root | null = null;

function container() {
  const noop = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...noop }, ...noop };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

function word(over: Partial<VocabWord>): VocabWord {
  return {
    id: "w1", user_id: "u1", word: "budget", word_key: "budget", meaning_tr: "bütçe", ipa: "/ˈbʌdʒɪt/",
    audio_url: "https://x/budget-us.mp3", senses: [{ pos: "noun", definition: "money set aside" }],
    lookup: "found", streak: 0, learned_at: null, reviewed_at: null, created_at: "2026-11-22T10:00:00Z", ...over,
  };
}
const learned = word({ id: "w2", word: "thrive", word_key: "thrive", learned_at: "2026-11-22T11:00:00Z", streak: 3 });

function reset() {
  state.texts = [];
  state.pressables = [];
  state.buttons = [];
  state.fields = [];
}
async function render(screen: () => unknown) {
  reset();
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(screen as never)));
  await flush();
}

const flat = (c: unknown): string => {
  if (Array.isArray(c)) return c.map(flat).join("");
  if (typeof c === "string" || typeof c === "number") return String(c);
  if (c && typeof c === "object" && "props" in c) return flat((c as { props: { children?: unknown } }).props.children);
  return "";
};
// The last render's state: each render appends, so read from the end.
const text = () => state.texts.map(flat).join(" | ");
const button = (label: string) => state.buttons.findLast((b) => b.label === label);
const field = (label: string) => state.fields.findLast((f) => f.label === label)!;
const pressable = (label: string) =>
  state.pressables.findLast((p) => p.accessibilityLabel === label || flat(p.children).includes(label));
async function press(target: { onPress?: () => void } | undefined) {
  if (!target?.onPress) throw new Error(`nothing to press in ${text()}`);
  reset();
  await act(async () => target.onPress!());
  await flush();
}
async function type(label: string, value: string) {
  const f = field(label);
  await act(async () => f.onChangeText(value));
}

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.id = "w1";
  state.alert = vi.fn();
  state.router = { back: vi.fn(), push: vi.fn() };
  state.browser = vi.fn(async () => undefined);
  state.api = {
    get: vi.fn(async () => [word({}), learned]),
    post: vi.fn(async () => word({ id: "w9" })),
    patch: vi.fn(async () => word({})),
    del: vi.fn(async () => ({ ok: true })),
  };
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("WordsScreen", () => {
  it("shows the progress and a review button for the unlearned words", async () => {
    await render(WordsScreen);
    expect(state.api.get).toHaveBeenCalledWith("/api/words");
    expect(text()).toContain("2 words · 1 learned");
    expect(button("Review (1)")).toMatchObject({ disabled: false });
  });

  it("disables the review with nothing left to learn", async () => {
    state.api.get = vi.fn(async () => [learned]);
    await render(WordsScreen);
    expect(button("Review (0)")).toMatchObject({ disabled: true });
  });

  it("saves a word and opens its card", async () => {
    await render(WordsScreen);
    await type(t.wordsWordLabel, " give  up ");
    await type(t.wordsMeaningLabel, "vazgeçmek");
    await press(button(t.wordsSave));
    expect(state.api.post).toHaveBeenCalledWith("/api/words", { word: "give up", meaningTr: "vazgeçmek" });
    expect(state.router.push).toHaveBeenCalledWith({ pathname: "/words/[id]", params: { id: "w9" } });
  });

  it("opens the existing card for a word already in the list", async () => {
    state.api.post = vi.fn(async () => {
      throw new ApiError(409, "Already in your list", "duplicate");
    });
    await render(WordsScreen);
    await type(t.wordsWordLabel, "Budget");
    await press(button(t.wordsSave));
    expect(state.router.push).toHaveBeenCalledWith({ pathname: "/words/[id]", params: { id: "w1" } });
  });

  it("refuses an invalid word without calling the server", async () => {
    await render(WordsScreen);
    await type(t.wordsWordLabel, "abc1");
    await press(button(t.wordsSave));
    expect(text()).toContain(t.wordsInvalidWord);
    expect(state.api.post).not.toHaveBeenCalled();
  });

  it("shows the server's translated error", async () => {
    state.api.post = vi.fn(async () => {
      throw new ApiError(400, "Invalid meaning", "invalid_meaning");
    });
    await render(WordsScreen);
    await type(t.wordsWordLabel, "budget");
    await press(button(t.wordsSave));
    expect(text()).toContain(t.wordsInvalidMeaning);
  });

  it("filters to learned words", async () => {
    await render(WordsScreen);
    await press(pressable(t.wordsFilterLearned));
    const rows = state.pressables.filter((p) => flat(p.children).includes("budget") || flat(p.children).includes("thrive"));
    expect(rows.map((p) => flat(p.children))).toEqual([expect.stringContaining("thrive")]);
  });

  it("offers a retry when the list cannot be loaded", async () => {
    state.api.get = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([word({})]);
    await render(WordsScreen);
    expect(text()).toContain(t.wordsLoadFailed);
    await press(pressable(t.wordsRetry));
    expect(text()).toContain("1 words · 0 learned");
  });
});

describe("WordCardScreen", () => {
  it("plays the recording in the browser", async () => {
    await render(WordCardScreen);
    await press(pressable(t.wordsListen));
    expect(state.browser).toHaveBeenCalledWith("https://x/budget-us.mp3");
  });

  it("edits the Turkish meaning", async () => {
    state.api.patch = vi.fn(async () => word({ meaning_tr: "ödenek" }));
    await render(WordCardScreen);
    await press(pressable("bütçe"));
    await type(t.wordsMeaningLabel, "ödenek");
    await press(button(t.wordsSave));
    expect(state.api.patch).toHaveBeenCalledWith("/api/words/w1", { meaningTr: "ödenek" });
    expect(text()).toContain("ödenek");
  });

  it("looks a missing word up again", async () => {
    state.api.get = vi.fn(async () => [word({ lookup: "failed", senses: [] })]);
    await render(WordCardScreen);
    expect(text()).toContain(t.wordsLookupFailed);
    await press(pressable(t.wordsLookupRetry));
    expect(state.api.patch).toHaveBeenCalledWith("/api/words/w1", { relookup: true });
  });

  it("marks a learned word as not learned", async () => {
    state.id = "w2";
    await render(WordCardScreen);
    await press(pressable(t.wordsUnlearn));
    expect(state.api.patch).toHaveBeenCalledWith("/api/words/w2", { unlearn: true });
  });

  it("deletes after confirming and goes back", async () => {
    await render(WordCardScreen);
    await press(pressable(t.wordsDelete));
    const [title, , buttons] = vi.mocked(state.alert).mock.calls[0];
    expect(title).toBe('Delete "budget"?');
    await act(async () => buttons.find((b) => b.text === t.wordsDelete)!.onPress!());
    expect(state.api.del).toHaveBeenCalledWith("/api/words/w1");
    expect(state.router.back).toHaveBeenCalled();
  });

  it("goes back for a word that is not in the list", async () => {
    state.id = "gone";
    await render(WordCardScreen);
    expect(state.router.back).toHaveBeenCalled();
  });
});

describe("WordsReviewScreen", () => {
  it("reveals, records the answer and ends with the round summary", async () => {
    state.api.get = vi.fn(async () => [word({ streak: 2 })]);
    await render(WordsReviewScreen);
    expect(text()).not.toContain("bütçe");
    await press(button(t.wordsShow));
    expect(text()).toContain("bütçe");
    await press(button(t.wordsKnow));
    expect(state.api.patch).toHaveBeenCalledWith("/api/words/w1", { answer: "know" });
    expect(text()).toContain("1 of 1 · 1 words learned");
    await press(button(t.wordsAnotherRound));
    expect(state.api.get).toHaveBeenCalledTimes(2);
  });

  it("keeps going and says so when an answer cannot be saved", async () => {
    state.api.get = vi.fn(async () => [word({}), word({ id: "w3", word: "thrive", word_key: "thrive" })]);
    state.api.patch = vi.fn(async () => {
      throw new Error("offline");
    });
    await render(WordsReviewScreen);
    await press(button(t.wordsShow));
    await press(pressable(t.wordsDontKnow));
    expect(state.api.patch).toHaveBeenCalledWith("/api/words/w1", { answer: "dontKnow" });
    expect(text()).toContain(t.wordsAnswerFailed);
    expect(text()).toContain("thrive");
  });

  it("says when there is nothing to review", async () => {
    state.api.get = vi.fn(async () => [learned]);
    await render(WordsReviewScreen);
    expect(text()).toContain(t.wordsNothingToReview);
  });
});
