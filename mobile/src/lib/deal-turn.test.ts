import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { GAME_THEME, TAP_GUARD_MS } from "@ptracker/shared/imposter";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
}));
const rn = vi.hoisted(() => ({
  listener: null as null | ((state: string) => void),
  type: null as null | string,
  remove: vi.fn(),
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
  };
});
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (type: string, fn: (state: string) => void) => {
      rn.type = type;
      rn.listener = fn;
      return { remove: rn.remove };
    },
  },
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: () => null },
  FadeIn: { duration: () => ({}) },
}));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "imposterPassTo" ? "Pass to {name}" : String(key)),
    }),
  }),
}));
vi.mock("@/components/games/game-button", () => ({ GameButton: () => null }));

import { Pressable } from "react-native";
import { DealTurn } from "@/components/games/deal-turn";
import { GameButton } from "@/components/games/game-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onReveal = vi.fn();
const onNext = vi.fn();

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

const card = (tree: Node) => nodes(tree).find((n) => n.type === Pressable)!;
const pressIn = (tree: Node) => (card(tree).props.onPressIn as () => void)();
const pressOut = (tree: Node) => (card(tree).props.onPressOut as () => void)();
const act = (tree: Node, actionName: string) =>
  (card(tree).props.onAccessibilityAction as (e: { nativeEvent: { actionName: string } }) => void)({
    nativeEvent: { actionName },
  });

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  rn.listener = null;
  rn.type = null;
});

describe("DealTurn hold card", () => {
  it("keeps the card closed until it is held", () => {
    const out = text(render(false));
    expect(out).toContain("Pass to Ann");
    expect(out).toContain("imposterHoldToSee");
    expect(out).not.toContain("SECRET");
  });

  it("asks for the reveal on the first press and shows the card once it was accepted", () => {
    pressIn(render(false));
    expect(onReveal).toHaveBeenCalledTimes(1);
    // A press inside the reducer's tap guard is not accepted: the card must stay closed.
    expect(text(render(false))).not.toContain("SECRET");
    expect(text(render(true))).toContain("SECRET");
  });

  it("does not ask for the reveal again once the card was seen", () => {
    pressIn(render(true));
    expect(onReveal).not.toHaveBeenCalled();
    expect(text(render(true))).toContain("SECRET");
  });

  it("hides the card when the finger lifts", () => {
    pressIn(render(true));
    expect(text(render(true))).toContain("SECRET");
    pressOut(render(true));
    expect(text(render(true))).not.toContain("SECRET");
  });

  it("hides the card when the app leaves the foreground", () => {
    render(true);
    const cleanup = hooks.effects[0]() as () => void;
    pressIn(render(true));
    rn.listener!("active");
    expect(text(render(true))).toContain("SECRET");
    rn.listener!("background");
    expect(text(render(true))).not.toContain("SECRET");
    cleanup();
    expect(rn.remove).toHaveBeenCalledTimes(1);
  });

  it("subscribes to app state changes and hides the card when the app goes inactive", () => {
    render(true);
    hooks.effects[0]();
    expect(rn.type).toBe("change");
    pressIn(render(true));
    expect(text(render(true))).toContain("SECRET");
    rn.listener!("inactive");
    expect(text(render(true))).not.toContain("SECRET");
  });

  it("lets a screen reader open and close the card with the activate action", () => {
    const first = render(false);
    expect(card(first).props.accessibilityActions).toEqual([{ name: "activate" }]);
    expect(card(first).props.accessibilityLiveRegion).toBe("polite");
    act(first, "activate");
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(text(render(true))).toContain("SECRET");
    act(render(true), "activate");
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(text(render(true))).not.toContain("SECRET");
  });

  it("ignores accessibility actions other than activate", () => {
    act(render(false), "longpress");
    expect(onReveal).not.toHaveBeenCalled();
    expect(text(render(true))).not.toContain("SECRET");
  });

  it("gives the card the same height whatever it shows", () => {
    expect(String(card(render(true)).props.className)).toContain("flex-1");
    expect(String(card(render(true)).props.className)).toContain("min-h-64");
  });

  it("labels the card only while it is closed, so a screen reader reads the content when open", () => {
    expect(card(render(false)).props.accessibilityLabel).toBe("imposterHoldToSee");
    expect(card(render(true)).props.accessibilityLabel).toBe("imposterHoldToSee");
    pressIn(render(true));
    expect(card(render(true)).props.accessibilityLabel).toBeUndefined();
  });

  it("uses the same card colour closed and open, whatever the card says", () => {
    expect(card(render(true)).props.style).toEqual({ backgroundColor: GAME_THEME.bg });
    pressIn(render(true));
    expect(card(render(true)).props.style).toEqual({ backgroundColor: GAME_THEME.bg });
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
    pressIn(render(false));
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
    pressIn(render(false));
    render(false);
    const cleanup = hooks.effects[1]() as () => void;
    vi.advanceTimersByTime(TAP_GUARD_MS - 1);
    pressOut(render(false));
    cleanup();
    render(false);
    hooks.effects[1]();
    vi.advanceTimersByTime(TAP_GUARD_MS * 5);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("schedules nothing once the reveal was accepted", () => {
    pressIn(render(true));
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
});

describe("DealTurn next player", () => {
  it("is disabled until the player has seen the card", () => {
    const next = (tree: Node) => nodes(tree).find((n) => n.type === GameButton)!;
    expect(next(render(false)).props.disabled).toBe(true);
    expect(next(render(true)).props).toMatchObject({ label: "imposterNextPlayer", onPress: onNext, disabled: false });
  });
});
