import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";

const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  button: { focus: () => undefined },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useRef: () => ({ current: hooks.button }),
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
});

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: { dashboard: "DASH", economy: "ECON", events: "EVENTS", games: "GAMES", wordsTitle: "WORDS", menu: "MENU" },
  }),
}));

import Link from "next/link";
import AppNav, { type AppSection } from "./AppNav";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function findAll(node: unknown, match: (el: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, out);
    return out;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return out;
  const el = node as Node;
  if (match(el)) out.push(el);
  findAll(el.props.children, match, out);
  return out;
}

const onOpenChange = vi.fn();
let open = false;
const render = (active: AppSection = "events") => AppNav({ active, open, onOpenChange }) as unknown as Node;
const toggle = (tree: Node) => findAll(tree, (el) => el.type === "button")[0];
const panel = (tree: Node) => findAll(tree, (el) => el.type === "nav" && el.props.id !== undefined)[0];
const inline = (tree: Node) => findAll(tree, (el) => el.type === "nav" && el.props.id === undefined)[0];
const links = (node: unknown) => findAll(node, (el) => el.type === Link);
const backdrop = (tree: Node) => findAll(tree, (el) => el.type === "div" && el.props["aria-hidden"] === "true");

type Listener = (e: { key: string; defaultPrevented?: boolean; isComposing?: boolean }) => void;
let keyListeners: Listener[];
let wideListeners: Array<() => void>;
let wide: { matches: boolean };

beforeEach(() => {
  open = false;
  onOpenChange.mockClear();
  hooks.effects.length = 0;
  hooks.button.focus = vi.fn();
  keyListeners = [];
  wideListeners = [];
  wide = { matches: false };
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: Listener) => type === "keydown" && keyListeners.push(fn),
    removeEventListener: (type: string, fn: Listener) => {
      if (type === "keydown") keyListeners = keyListeners.filter((l) => l !== fn);
    },
    matchMedia: (query: string) => {
      expect(query).toBe("(min-width: 64rem)");
      return {
        get matches() {
          return wide.matches;
        },
        addEventListener: (_type: string, fn: () => void) => wideListeners.push(fn),
        removeEventListener: (_type: string, fn: () => void) => {
          wideListeners = wideListeners.filter((l) => l !== fn);
        },
      };
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const runEffects = () => hooks.effects.map((effect) => effect()).filter((c): c is () => void => typeof c === "function");

describe("AppNav", () => {
  it("links the five sections in order, inline and in the menu panel", () => {
    open = true;
    const tree = render();
    const expected = [
      ["/dashboard", "DASH"],
      ["/economy", "ECON"],
      ["/events", "EVENTS"],
      ["/games", "GAMES"],
      ["/words", "WORDS"],
    ];
    for (const nav of [inline(tree), panel(tree)]) {
      expect(links(nav).map((l) => [l.props.href, l.props.children])).toEqual(expected);
    }
  });

  it.each([
    ["dashboard", "/dashboard", "text-blue-700"],
    ["economy", "/economy", "text-green-700"],
    ["events", "/events", "text-purple-700"],
    ["games", "/games", "text-purple-700"],
    ["words", "/words", "text-purple-700"],
  ] as const)("marks %s as the current page in its colour, the others idle", (section, href, colour) => {
    open = true;
    const tree = render(section);
    for (const nav of [inline(tree), panel(tree)]) {
      for (const link of links(nav)) {
        const current = link.props.href === href;
        expect(link.props["aria-current"]).toBe(current ? "page" : undefined);
        expect(link.props.className).toContain(current ? colour : "text-gray-500");
        if (current) expect(link.props.className).toContain("font-semibold");
      }
    }
  });

  it("shows the menu button and panel only below lg, and the inline links only from lg", () => {
    const tree = render();
    expect(toggle(tree).props.className).toContain("lg:hidden");
    expect(panel(tree).props.className).toContain("lg:hidden");
    expect(inline(tree).props.className).toContain("hidden lg:flex");
  });

  it("labels the menu button and points it at the panel", () => {
    const tree = render();
    const button = toggle(tree);
    expect(button.props["aria-label"]).toBe("MENU");
    expect(button.props["aria-controls"]).toBe(panel(tree).props.id);
    expect(button.props.type).toBe("button");
  });

  it("keeps the panel hidden and no backdrop while closed", () => {
    const tree = render();
    expect(toggle(tree).props["aria-expanded"]).toBe(false);
    expect(panel(tree).props.hidden).toBe(true);
    expect(backdrop(tree)).toHaveLength(0);
  });

  it("shows the panel and a backdrop while open", () => {
    open = true;
    const tree = render();
    expect(toggle(tree).props["aria-expanded"]).toBe(true);
    expect(panel(tree).props.hidden).toBe(false);
    expect(backdrop(tree)).toHaveLength(1);
  });

  it("asks the header to open and close it from the menu button", () => {
    (toggle(render()).props.onClick as () => void)();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    open = true;
    (toggle(render()).props.onClick as () => void)();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps the menu button above its backdrop so a tap on it closes the menu itself", () => {
    expect(toggle(render()).props.className).toContain("relative z-50");
  });

  it("closes when a section in the panel is chosen", () => {
    open = true;
    const [, economy] = links(panel(render()));
    (economy.props.onClick as () => void)();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on a tap outside the panel", () => {
    open = true;
    (backdrop(render())[0].props.onClick as () => void)();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("listens for nothing while closed", () => {
    render();
    runEffects();
    expect(keyListeners).toHaveLength(0);
    expect(wideListeners).toHaveLength(0);
  });

  it("closes on Escape wherever the focus is and puts focus back on the menu button", () => {
    open = true;
    render();
    runEffects();
    for (const l of keyListeners) l({ key: "Enter" });
    expect(onOpenChange).not.toHaveBeenCalled();
    for (const l of keyListeners) l({ key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(hooks.button.focus).toHaveBeenCalledTimes(1);
  });

  it("leaves an Escape that cancels typing or that another control already handled", () => {
    open = true;
    render();
    runEffects();
    for (const l of keyListeners) l({ key: "Escape", isComposing: true });
    for (const l of keyListeners) l({ key: "Escape", defaultPrevented: true });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(hooks.button.focus).not.toHaveBeenCalled();
  });

  it("closes when the window grows to lg, where the panel is hidden, so it does not come back on shrinking", () => {
    open = true;
    render();
    runEffects();
    for (const l of wideListeners) l();
    expect(onOpenChange).not.toHaveBeenCalled();
    wide.matches = true;
    for (const l of wideListeners) l();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stops listening when it closes or unmounts", () => {
    open = true;
    render();
    for (const cleanup of runEffects()) cleanup();
    expect(keyListeners).toHaveLength(0);
    expect(wideListeners).toHaveLength(0);
  });

  it("gives the menu button the ref that Escape focuses", () => {
    expect(toggle(render()).props.ref).toEqual({ current: hooks.button });
  });

  it("shows the PayTrack word only from sm, next to the logo", () => {
    const [word] = findAll(render(), (el) => el.type === "span" && el.props.children === "PayTrack");
    expect(word.props.className).toContain("hidden sm:inline");
  });
});
