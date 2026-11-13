import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { GAME_THEME, TAP_GUARD_MS } from "@/lib/imposter";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
  desktop: false,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.states)) hooks.states[i] = typeof initial === "function" ? initial() : initial;
      const set = (next: unknown) => {
        hooks.states[i] = typeof next === "function" ? next(hooks.states[i]) : next;
      };
      return [hooks.states[i], set];
    },
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
    useSyncExternalStore: () => hooks.desktop,
  };
});
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "imposterPassTo" ? "Pass to {name}" : String(key)),
    }),
  }),
}));

import DealTurn from "./DealTurn";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onReveal = vi.fn();
const onNext = vi.fn();
const listeners: Record<string, () => void> = {};
const doc = {
  hidden: false,
  addEventListener: (type: string, fn: () => void) => {
    listeners[type] = fn;
  },
  removeEventListener: vi.fn(),
};

function render(revealed: boolean): Node {
  hooks.index = 0;
  hooks.effects = [];
  return DealTurn({ name: "Ann", revealed, onReveal, onNext, children: createElement("p", null, "SECRET") }) as Node;
}

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

const card = (tree: Node) => nodes(tree).find((n) => n.props["data-card"])!;
const button = (tree: Node, label: string) => nodes(tree).find((n) => n.type === "button" && text(n) === label);

function press(tree: Node, event: Record<string, unknown> = {}) {
  const setPointerCapture = vi.fn();
  (card(tree).props.onPointerDown as (e: unknown) => void)({ pointerId: 7, currentTarget: { setPointerCapture }, ...event });
  return setPointerCapture;
}

function keyDown(tree: Node, event: { key: string; repeat?: boolean }) {
  const preventDefault = vi.fn();
  (card(tree).props.onKeyDown as (e: unknown) => void)({ repeat: false, ...event, preventDefault });
  return preventDefault;
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  hooks.desktop = false;
  doc.hidden = false;
  vi.stubGlobal("document", doc);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DealTurn hold card", () => {
  it("keeps the card closed until it is held", () => {
    const out = text(render(false));
    expect(out).toContain("Pass to Ann");
    expect(out).toContain("imposterHoldToSee");
    expect(out).not.toContain("SECRET");
  });

  it("asks for the reveal on the first press and shows the card once it was accepted", () => {
    press(render(false));
    expect(onReveal).toHaveBeenCalledTimes(1);
    // A press inside the reducer's tap guard is not accepted: the card must stay closed.
    expect(text(render(false))).not.toContain("SECRET");
    expect(text(render(true))).toContain("SECRET");
  });

  it("does not ask for the reveal again once the card was seen", () => {
    press(render(true));
    expect(onReveal).not.toHaveBeenCalled();
    expect(text(render(true))).toContain("SECRET");
  });

  it.each(["onPointerUp", "onPointerCancel", "onPointerLeave"])("hides the card on %s", (handler) => {
    press(render(true));
    expect(text(render(true))).toContain("SECRET");
    (card(render(true)).props[handler] as () => void)();
    expect(text(render(true))).not.toContain("SECRET");
  });

  it("captures the pointer so a drifting finger keeps the card open", () => {
    expect(press(render(true))).toHaveBeenCalledWith(7);
  });

  it("ignores a press that is not the main button", () => {
    const capture = press(render(false), { button: 2 });
    expect(capture).not.toHaveBeenCalled();
    expect(onReveal).not.toHaveBeenCalled();
    expect(text(render(true))).not.toContain("SECRET");
    press(render(true), { button: 0 });
    expect(text(render(true))).toContain("SECRET");
  });

  it("opens the card even when the pointer cannot be captured", () => {
    const setPointerCapture = () => {
      throw new Error("InvalidPointerId");
    };
    press(render(false), { currentTarget: { setPointerCapture } });
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(text(render(true))).toContain("SECRET");
  });

  it("blocks the long-press menu, text selection and scrolling on the card", () => {
    const { props } = card(render(false));
    const preventDefault = vi.fn();
    (props.onContextMenu as (e: unknown) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(props.style).toMatchObject({ touchAction: "none", userSelect: "none" });
  });

  it("hides the card when the page goes to the background", () => {
    render(true);
    const cleanup = hooks.effects[0]() as () => void;
    press(render(true));
    listeners.visibilitychange();
    expect(text(render(true))).toContain("SECRET");
    doc.hidden = true;
    listeners.visibilitychange();
    expect(text(render(true))).not.toContain("SECRET");
    cleanup();
    expect(doc.removeEventListener).toHaveBeenCalledWith("visibilitychange", listeners.visibilitychange);
  });

  it("uses the same card colours closed and open, whatever the card says", () => {
    const fixed = { backgroundColor: GAME_THEME.bg, color: GAME_THEME.text };
    expect(card(render(true)).props.style).toMatchObject(fixed);
    press(render(true));
    expect(card(render(true)).props.style).toMatchObject(fixed);
  });

  it("keeps the card the same height closed and open, so a longer card cannot give the role away", () => {
    const heights = (tree: Node) => String(card(tree).props.className).split(" ").filter((c) => /(^|:)(min-)?h-/.test(c));
    expect(heights(render(true))).toEqual(["h-72"]);
    press(render(true));
    expect(heights(render(true))).toEqual(["h-72"]);
  });
});

describe("DealTurn hold card from the keyboard", () => {
  it("can be focused and shows where the focus is", () => {
    const { props } = card(render(false));
    expect(props.tabIndex).toBe(0);
    expect(props.className).toContain("focus-visible:ring-2");
  });

  it.each(["Enter", " "])("opens on the %j key once the reveal was accepted", (key) => {
    const preventDefault = keyDown(render(false), { key });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(text(render(false))).not.toContain("SECRET");
    expect(text(render(true))).toContain("SECRET");
  });

  it("closes on the next press of the key", () => {
    keyDown(render(true), { key: "Enter" });
    expect(text(render(true))).toContain("SECRET");
    keyDown(render(true), { key: "Enter" });
    expect(text(render(true))).not.toContain("SECRET");
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("ignores a key that is held down", () => {
    keyDown(render(false), { key: "Enter", repeat: true });
    expect(onReveal).not.toHaveBeenCalled();
    expect(text(render(true))).not.toContain("SECRET");
    keyDown(render(true), { key: "Enter" });
    keyDown(render(true), { key: "Enter", repeat: true });
    expect(text(render(true))).toContain("SECRET");
  });

  it("keeps a held Space from scrolling the page without toggling the card", () => {
    expect(keyDown(render(false), { key: " ", repeat: true })).toHaveBeenCalledTimes(1);
    expect(onReveal).not.toHaveBeenCalled();
    expect(text(render(true))).not.toContain("SECRET");
    keyDown(render(true), { key: " " });
    expect(keyDown(render(true), { key: " ", repeat: true })).toHaveBeenCalledTimes(1);
    expect(text(render(true))).toContain("SECRET");
  });

  it("ignores every other key", () => {
    const preventDefault = keyDown(render(false), { key: "Tab" });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onReveal).not.toHaveBeenCalled();
    expect(text(render(true))).not.toContain("SECRET");
  });

  it("closes when the focus leaves the card", () => {
    keyDown(render(true), { key: "Enter" });
    expect(text(render(true))).toContain("SECRET");
    (card(render(true)).props.onBlur as () => void)();
    expect(text(render(true))).not.toContain("SECRET");
  });

  it("is labelled only while it is closed, so the open card reads its content", () => {
    expect(card(render(true)).props["aria-label"]).toBe("imposterHoldToSee");
    press(render(false));
    expect(card(render(false)).props["aria-label"]).toBe("imposterHoldToSee");
    expect(card(render(true)).props["aria-label"]).toBeUndefined();
  });
});

describe("DealTurn hold inside the tap guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for the reveal once more when the card is still held as the guard ends", () => {
    press(render(false));
    expect(onReveal).toHaveBeenCalledTimes(1);
    render(false);
    hooks.effects[1]();
    vi.advanceTimersByTime(TAP_GUARD_MS - 1);
    expect(onReveal).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onReveal).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(TAP_GUARD_MS * 5);
    expect(onReveal).toHaveBeenCalledTimes(2);
  });

  it("does not ask again when the card is released before the guard ends", () => {
    press(render(false));
    render(false);
    const cleanup = hooks.effects[1]() as () => void;
    vi.advanceTimersByTime(TAP_GUARD_MS - 1);
    (card(render(false)).props.onPointerUp as () => void)();
    cleanup();
    render(false);
    hooks.effects[1]();
    vi.advanceTimersByTime(TAP_GUARD_MS * 5);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("schedules nothing once the reveal was accepted", () => {
    press(render(true));
    render(true);
    hooks.effects[1]();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(TAP_GUARD_MS * 5);
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("schedules nothing while the card is closed", () => {
    render(false);
    hooks.effects[1]();
    vi.advanceTimersByTime(TAP_GUARD_MS * 5);
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("does not open a card opened with Show on its own when the guard ends", () => {
    hooks.desktop = true;
    // The second click of a double click on Start lands on the first player's Show.
    (button(render(false), "imposterShow")!.props.onClick as () => void)();
    expect(onReveal).toHaveBeenCalledTimes(1);
    render(false);
    hooks.effects[1]();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(TAP_GUARD_MS * 5);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(text(render(false))).not.toContain("SECRET");
    expect(button(render(false), "imposterShow")).toBeDefined();
  });

  it("does not open a card opened with a key on its own when the guard ends", () => {
    keyDown(render(false), { key: "Enter" });
    render(false);
    hooks.effects[1]();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(TAP_GUARD_MS * 5);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("stops asking once a held card was hidden by the page going to the background", () => {
    render(false);
    hooks.effects[0]();
    press(render(false));
    doc.hidden = true;
    listeners.visibilitychange();
    render(false);
    hooks.effects[1]();
    vi.advanceTimersByTime(TAP_GUARD_MS * 5);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });
});

describe("DealTurn next player", () => {
  it("is disabled until the player has seen the card", () => {
    expect(button(render(false), "imposterNextPlayer")!.props.disabled).toBe(true);
    const next = button(render(true), "imposterNextPlayer")!;
    expect(next.props.disabled).toBe(false);
    expect(next.props.onClick).toBe(onNext);
  });
});

describe("DealTurn on a desktop pointer", () => {
  beforeEach(() => {
    hooks.desktop = true;
  });

  it("offers a Show button instead of the hold card", () => {
    const tree = render(false);
    expect(card(tree).props.onPointerDown).toBeUndefined();
    expect(text(tree)).not.toContain("imposterHoldToSee");
    expect(text(tree)).not.toContain("SECRET");
    expect(button(tree, "imposterShow")).toBeDefined();
  });

  it("shows and hides the card with the button, with no holding", () => {
    (button(render(false), "imposterShow")!.props.onClick as () => void)();
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(text(render(true))).toContain("SECRET");
    (button(render(true), "imposterHide")!.props.onClick as () => void)();
    expect(text(render(true))).not.toContain("SECRET");
    expect(button(render(true), "imposterShow")).toBeDefined();
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("hides a card opened with Show when the page goes to the background", () => {
    render(true);
    hooks.effects[0]();
    (button(render(true), "imposterShow")!.props.onClick as () => void)();
    expect(text(render(true))).toContain("SECRET");
    doc.hidden = true;
    listeners.visibilitychange();
    expect(text(render(true))).not.toContain("SECRET");
    expect(button(render(true), "imposterShow")).toBeDefined();
  });

  it("leaves the keyboard to the Show button", () => {
    const { props } = card(render(false));
    expect(props.tabIndex).toBeUndefined();
    expect(props.onKeyDown).toBeUndefined();
    expect(props.onBlur).toBeUndefined();
  });
});

describe("DealTurn when the pointer mode changes", () => {
  it("closes a held card when the device turns into a desktop pointer", () => {
    press(render(true));
    expect(text(render(true))).toContain("SECRET");
    hooks.desktop = true;
    const tree = render(true);
    expect(text(tree)).not.toContain("SECRET");
    expect(button(tree, "imposterShow")).toBeDefined();
  });

  it("closes a card opened with Show when the device turns into a touch pointer", () => {
    hooks.desktop = true;
    (button(render(true), "imposterShow")!.props.onClick as () => void)();
    expect(text(render(true))).toContain("SECRET");
    hooks.desktop = false;
    const tree = render(true);
    expect(text(tree)).not.toContain("SECRET");
    expect(text(tree)).toContain("imposterHoldToSee");
  });

  it("keeps a held card closed when the device turns back into a touch pointer", () => {
    press(render(true));
    hooks.desktop = true;
    expect(text(render(true))).not.toContain("SECRET");
    hooks.desktop = false;
    expect(text(render(true))).not.toContain("SECRET");
    expect(text(render(true))).not.toContain("SECRET");
    press(render(true));
    expect(text(render(true))).toContain("SECRET");
  });

  it("keeps a card opened with Show closed when the device turns back into a desktop pointer", () => {
    hooks.desktop = true;
    (button(render(true), "imposterShow")!.props.onClick as () => void)();
    hooks.desktop = false;
    expect(text(render(true))).not.toContain("SECRET");
    hooks.desktop = true;
    const tree = render(true);
    expect(text(tree)).not.toContain("SECRET");
    expect(button(tree, "imposterShow")).toBeDefined();
    expect(button(tree, "imposterHide")).toBeUndefined();
    (button(tree, "imposterShow")!.props.onClick as () => void)();
    expect(text(render(true))).toContain("SECRET");
  });
});

describe("DealTurn next label", () => {
  it("says Next player unless the caller names the button", () => {
    expect(button(render(true), "imposterNextPlayer")).toBeDefined();
    hooks.index = 0;
    hooks.effects = [];
    const named = DealTurn({
      name: "Ann",
      revealed: true,
      onReveal,
      onNext,
      nextLabel: "Continue",
      children: createElement("p", null, "SECRET"),
    }) as Node;
    expect(button(named, "Continue")?.props.onClick).toBe(onNext);
    expect(button(named, "imposterNextPlayer")).toBeUndefined();
  });
});
