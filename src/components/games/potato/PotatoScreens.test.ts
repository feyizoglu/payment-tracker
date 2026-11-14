import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { POTATO_NEXT_LOCK_MS, playerColor } from "@/lib/hot-potato";

const NOW = 1_800_000_000_000;

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  index: 0,
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
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        const templates: Record<string, string> = {
          potatoStarts: "{name} starts",
          potatoPassLabel: "pass from {name}",
          potatoLivesLeft: "{n} lives left",
          potatoWins: "{name} wins",
        };
        return templates[String(key)] ?? String(key);
      },
    }),
  }),
}));

import PotatoBang from "./PotatoBang";
import PotatoEnd from "./PotatoEnd";
import PotatoPlay from "./PotatoPlay";
import PotatoReady from "./PotatoReady";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

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

const click = (node: Node | undefined) => (node!.props.onClick as () => void)();
const button = (tree: Node, label: string) => nodes(tree).find((n) => n.type === "button" && text(n) === label);

function runEffects() {
  for (const effect of hooks.effects) {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  }
  hooks.effects = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"], now: NOW });
  hooks.states = [];
  hooks.effects = [];
  hooks.cleanups = [];
});

afterEach(() => {
  for (const cleanup of hooks.cleanups) cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PotatoReady", () => {
  it("names the player who starts and lights the fuse on Start", () => {
    const onStart = vi.fn();
    const tree = PotatoReady({ name: "Ann", onStart }) as Node;
    expect(text(tree)).toContain("Ann starts");
    expect(text(tree)).not.toContain("potatoSayDifferent");
    click(button(tree, "potatoStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("writes a name that looks like a placeholder as it was typed", () => {
    expect(text(PotatoReady({ name: "{name} $&", onStart: vi.fn() }))).toContain("{name} $& starts");
  });
});

describe("PotatoPlay", () => {
  const onPass = vi.fn();
  const onTick = vi.fn();
  const onPause = vi.fn();
  const onResume = vi.fn();
  const listeners: Record<string, (() => void) | undefined> = {};
  const doc = {
    hidden: false,
    addEventListener: vi.fn((type: string, fn: () => void) => {
      listeners[type] = fn;
    }),
    removeEventListener: vi.fn((type: string) => {
      listeners[type] = undefined;
    }),
  };

  function render(fuse: { fuseMs: number; burntMs: number; litAt: number | null } = { fuseMs: 10_000, burntMs: 0, litAt: NOW }) {
    hooks.index = 0;
    hooks.effects = [];
    return PotatoPlay({ holder: "Ann", task: "An animal starting with S", ...fuse, onPass, onTick, onPause, onResume }) as Node;
  }

  const pulse = (tree: Node) => nodes(tree).find((n) => n.props["data-pulse"]);

  beforeEach(() => {
    doc.hidden = false;
    vi.stubGlobal("document", doc);
  });

  it("shows the holder and the task, never the time left", () => {
    const tree = render();
    expect(text(tree)).toContain("Ann");
    expect(text(tree)).toContain("An animal starting with S");
    expect(text(tree)).toContain("potatoSayDifferent");
    expect(nodes(tree).some((n) => n.props.role === "timer")).toBe(false);
  });

  it("passes with a large button whose label names the holder", () => {
    const pass = button(render(), "potatoPass")!;
    expect(pass.props["aria-label"]).toBe("pass from Ann");
    click(pass);
    expect(onPass).toHaveBeenCalledTimes(1);
  });

  it("asks the game to check the fuse while it runs, and stops when it leaves", () => {
    render();
    runEffects();
    vi.advanceTimersByTime(1000);
    expect(onTick.mock.calls.length).toBeGreaterThanOrEqual(4);
    for (const cleanup of hooks.cleanups.splice(0)) cleanup();
    const calls = onTick.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(calls);
  });

  it("pauses the fuse when the page is hidden and resumes it when it is back", () => {
    render();
    runEffects();
    doc.hidden = true;
    listeners.visibilitychange!();
    expect(onPause).toHaveBeenCalledTimes(1);
    doc.hidden = false;
    listeners.visibilitychange!();
    expect(onResume).toHaveBeenCalledTimes(1);
    for (const cleanup of hooks.cleanups.splice(0)) cleanup();
    expect(listeners.visibilitychange).toBeUndefined();
  });

  it("pulses only in the last quarter of the fuse, faster in the last tenth, hidden from screen readers", () => {
    expect(pulse(render({ fuseMs: 10_000, burntMs: 0, litAt: NOW - 7_000 }))).toBeUndefined();
    const slow = pulse(render({ fuseMs: 10_000, burntMs: 0, litAt: NOW - 8_000 }))!;
    expect(slow.props["aria-hidden"]).toBe(true);
    expect(slow.props["data-pulse"]).toBe("pulse");
    expect(String(slow.props.className)).toContain("animate-pulse");
    const fast = pulse(render({ fuseMs: 10_000, burntMs: 9_500, litAt: null }))!;
    expect(fast.props["data-pulse"]).toBe("fast");
    expect((fast.props.style as { animationDuration: string }).animationDuration).toBe("0.5s");
  });

  it("starts pulsing as the time goes by", () => {
    render({ fuseMs: 10_000, burntMs: 0, litAt: NOW });
    runEffects();
    vi.advanceTimersByTime(8_000);
    expect(pulse(render({ fuseMs: 10_000, burntMs: 0, litAt: NOW }))).toBeDefined();
  });
});

describe("PotatoBang", () => {
  const onNext = vi.fn();

  function render(livesLeft: number, bangAt = NOW) {
    hooks.index = 0;
    hooks.effects = [];
    return PotatoBang({ name: "Ann", livesLeft, bangAt, onNext }) as Node;
  }

  const alert = (tree: Node) => nodes(tree).find((n) => n.props.role === "alert")!;

  it("announces the bang, the holder and their lives left", () => {
    expect(alert(render(2)).props["aria-live"]).toBe("assertive");
    expect(text(alert(render(2)))).toBe("potatoBangAnn2 lives left");
    expect(text(alert(render(1)))).toBe("potatoBangAnnpotatoLifeLeft");
    expect(text(alert(render(0)))).toBe("potatoBangAnnpotatoOut");
  });

  it("keeps Next off until 1.5 s after the bang", () => {
    expect(button(render(1), "potatoNext")!.props.disabled).toBe(true);
    runEffects();
    vi.advanceTimersByTime(POTATO_NEXT_LOCK_MS - 1);
    expect(button(render(1), "potatoNext")!.props.disabled).toBe(true);
    vi.advanceTimersByTime(1);
    const next = button(render(1), "potatoNext")!;
    expect(next.props.disabled).toBe(false);
    click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("counts the lock from the bang, not from when the screen appeared", () => {
    render(1, NOW - 1000);
    runEffects();
    vi.advanceTimersByTime(500);
    expect(button(render(1, NOW - 1000), "potatoNext")!.props.disabled).toBe(false);
  });

  it("vibrates once where the browser can", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    render(1);
    runEffects();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("does without vibration where the browser cannot or refuses", () => {
    vi.stubGlobal("navigator", {});
    render(1);
    expect(() => runEffects()).not.toThrow();
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("blocked");
      },
    });
    hooks.states = [];
    render(1);
    expect(() => runEffects()).not.toThrow();
  });
});

describe("PotatoEnd", () => {
  const onPlayAgain = vi.fn();
  const onNewGame = vi.fn();
  const players = ["Ann", "Bob", "Cem", "Dan"];

  function render() {
    return PotatoEnd({ players, winner: 2, outOrder: [3, 0, 1], onPlayAgain, onNewGame }) as Node;
  }

  it("shows the winner in their colour", () => {
    const tree = render();
    const win = nodes(tree).find((n) => text(n) === "Cem wins" && (n.props.style as { backgroundColor?: string } | undefined)?.backgroundColor);
    expect(win).toBeDefined();
    expect((win!.props.style as { backgroundColor: string }).backgroundColor).toBe(playerColor(2));
  });

  it("lists the others in the order they went out", () => {
    const out = nodes(render()).filter((n) => n.type === "li");
    expect(out.map(text)).toEqual(["Dan", "Ann", "Bob"]);
    expect(out.map((n) => (n.props.style as { backgroundColor: string }).backgroundColor)).toEqual([
      playerColor(3),
      playerColor(0),
      playerColor(1),
    ]);
  });

  it("plays again or goes back to the setup", () => {
    click(button(render(), "potatoPlayAgain"));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    click(button(render(), "potatoNewGame"));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
