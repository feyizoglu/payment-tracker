import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { GAME_THEME } from "@/lib/imposter";

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

function press(tree: Node) {
  const setPointerCapture = vi.fn();
  (card(tree).props.onPointerDown as (e: unknown) => void)({ pointerId: 7, currentTarget: { setPointerCapture } });
  return setPointerCapture;
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
});
