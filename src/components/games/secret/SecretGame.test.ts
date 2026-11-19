import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { secretCards } from "@/lib/secret-word";

const host = vi.hoisted(() => {
  const nodes: Array<{ type: string; props: Record<string, unknown> }> = [];
  const keep = (c: unknown): unknown =>
    Array.isArray(c) ? c.map(keep) : typeof c === "string" || typeof c === "number" ? null : c;
  const Host = ({ __type, ...props }: { __type: string; children?: unknown }) => {
    nodes.push({ type: __type, props });
    return keep(props.children) ?? null;
  };
  const wrap =
    (fn: (...args: unknown[]) => unknown) =>
    (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) =>
      typeof type === "string" ? fn(Host, { ...props, __type: type }, ...rest) : fn(type, props, ...rest);
  return { nodes, wrap };
});

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsx: host.wrap(actual.jsx), jsxs: host.wrap(actual.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsxDEV: host.wrap(actual.jsxDEV) };
});

import { LanguageProvider } from "@/lib/i18n";
import SecretGame from "@/components/games/secret/SecretGame";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot: (container: unknown) => Root;
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let clock = 1_000_000;
const store = new Map<string, string>();
const listeners = new Map<string, (e?: unknown) => void>();
const EN = secretCards("en");
// Math.random 0 deals the first unseen word.
const FIRST = EN[0].word;
const WRONG = FIRST === "ZZZZZ" ? "YYYYY" : "ZZZZZ";

function container() {
  const noop = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...noop }, ...noop };
}

beforeEach(() => {
  clock = 1_000_000;
  store.clear();
  listeners.clear();
  host.nodes.length = 0;
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  const on = (type: string, fn: (e?: unknown) => void) => listeners.set(type, fn);
  vi.stubGlobal("window", { HTMLIFrameElement: class {}, addEventListener: on, removeEventListener: () => undefined });
  vi.stubGlobal("document", {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    documentElement: { classList: { contains: () => false } },
  });
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  root = createRoot(container());
  await act(async () => root?.render(createElement(LanguageProvider, { initialLang: "en" }, createElement(SecretGame))));
}
function lastRender() {
  const i = host.nodes.findLastIndex((n) => n.type === "div" && String(n.props.className).includes("max-w-md"));
  return host.nodes.slice(i);
}
const text = () =>
  lastRender()
    .filter((n) => n.type === "p" || n.type === "span")
    .map((n) => (typeof n.props.children === "string" ? n.props.children : ""))
    .filter(Boolean)
    .join(" | ");
const button = (label: string) =>
  lastRender().find((n) => n.type === "button" && (n.props.children === label || n.props["aria-label"] === label));
async function click(label: string) {
  await act(async () => (button(label)!.props.onClick as () => void)());
}
async function key(k: string, extra: Record<string, unknown> = {}) {
  const e = { key: k, repeat: false, target: null, prevented: false, preventDefault() {
    e.prevented = true;
  }, ...extra };
  await act(async () => listeners.get("keydown")!(e));
  return e;
}
async function typeWord(word: string) {
  for (const l of word) await key(l.toLowerCase());
  await key("Enter");
}
const marks = () => lastRender().filter((n) => n.type === "span" && n.props["data-mark"]).map((n) => n.props["data-mark"]);

describe("SecretGame", () => {
  it("deals an unseen word with its category as a hint and saves it as seen", async () => {
    await mount();
    expect(text()).toContain("Hint: 🐾 Animals");
    expect(text()).toContain("Streak: 0");
    expect(JSON.parse(store.get("secret_word_seen_en")!)).toEqual([EN[0].id]);
  });

  it("deals the next unseen word when some are seen", async () => {
    store.set("secret_word_seen_en", JSON.stringify([EN[0].id]));
    await mount();
    expect(JSON.parse(store.get("secret_word_seen_en")!)).toEqual([EN[0].id, EN[1].id]);
  });

  it("types with the on-screen keys and deletes", async () => {
    await mount();
    await click("A");
    await click("B");
    await click("Delete");
    await click("C");
    expect(marks().slice(0, 5)).toEqual(["typed", "typed", "empty", "empty", "empty"]);
    await click("Enter");
    expect(text()).toContain("Five letters, please.");
  });

  it("takes the physical keyboard, but not with a modifier held or into a field", async () => {
    await mount();
    const e = await key("a");
    expect(e.prevented).toBe(true);
    await key("b", { ctrlKey: true });
    await key("c", { metaKey: true });
    await key("d", { target: { closest: () => ({}) } });
    await key("1");
    expect(marks().filter((m) => m === "typed")).toHaveLength(1);
    await key("Backspace");
    expect(marks().filter((m) => m === "typed")).toHaveLength(0);
  });

  it("marks a guess on the page and on the keys", async () => {
    await mount();
    await typeWord(WRONG);
    expect(marks().slice(0, 5)).toEqual(["miss", "miss", "miss", "miss", "miss"]);
    expect(button(WRONG[0])!.props.style).toMatchObject({ textDecoration: "line-through" });
  });

  it("wins, raises the streak, saves the best, and deals the next word only after 400 ms", async () => {
    store.set("secret-word-best", "0");
    await mount();
    await typeWord(WRONG);
    await typeWord(FIRST);
    expect(text()).toContain("Got it on try 2!");
    expect(text()).toContain("Streak: 1");
    expect(text()).toContain("New best!");
    expect(store.get("secret-word-best")).toBe("1");
    expect(button("A")).toBeUndefined();

    clock += 399;
    await click("Next word");
    expect(text()).toContain("Got it on try 2!");
    clock += 1;
    await click("Next word");
    expect(text()).not.toContain("Got it");
    expect(JSON.parse(store.get("secret_word_seen_en")!)).toEqual([EN[0].id, EN[1].id]);
    expect(text()).toContain("Streak: 1");
  });

  it("keeps Back to games from leaving for 400 ms after the round ends", async () => {
    await mount();
    await typeWord(FIRST);
    const back = () => lastRender().find((n) => n.type === "a")!;
    const follow = () => {
      const e = { prevented: false, preventDefault() {
        e.prevented = true;
      } };
      (back().props.onClick as (e: unknown) => void)(e);
      return e.prevented;
    };
    expect(back().props.href).toBe("/games");
    clock += 399;
    expect(follow()).toBe(true);
    clock += 1;
    expect(follow()).toBe(false);
  });

  it("starts the next word on Enter once the guard is off, ignoring a held Enter", async () => {
    await mount();
    await typeWord(FIRST);
    clock += 400;
    await key("Enter", { repeat: true });
    expect(text()).toContain("Got it on try 1!");
    await key("Enter");
    expect(text()).not.toContain("Got it");
  });

  it("loses after six misses, shows the word, resets the streak and keeps the best", async () => {
    store.set("secret-word-best", "4");
    await mount();
    await typeWord(FIRST);
    expect(text()).toContain("Best: 4");
    clock += 400;
    await click("Next word");
    for (let i = 0; i < 6; i++) await typeWord(WRONG);
    expect(text()).toContain(`The word was ${EN[1].word}.`);
    expect(text()).toContain("Streak: 0");
    expect(text()).toContain("Best: 4");
    expect(store.get("secret-word-best")).toBe("4");
    expect(button("Again")).toBeDefined();
  });

  it("does not claim a new best when storage cannot be read", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    await mount();
    await typeWord(FIRST);
    expect(text()).toContain("Got it on try 1!");
    expect(text()).not.toContain("New best!");
  });
});
