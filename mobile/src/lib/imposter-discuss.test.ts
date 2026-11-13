import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const NOW = 1_800_000_000_000;

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  index: 0,
  refIndex: 0,
}));
const rn = vi.hoisted(() => ({ vibrate: vi.fn() }));

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
    useRef: (initial: unknown) => {
      const i = hooks.refIndex++;
      if (!(i in hooks.refs)) hooks.refs[i] = { current: initial };
      return hooks.refs[i];
    },
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
});
vi.mock("react-native", () => ({ Text: () => null, View: () => null, Vibration: { vibrate: rn.vibrate } }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));

import { ImposterDiscuss } from "@/components/games/imposter-discuss";
import type { ReactElement } from "react";
import { GAME_THEME } from "@ptracker/shared/imposter";

type StyledNode = ReactElement<Record<string, unknown> & { children?: unknown }>;

function styledNodes(node: unknown): StyledNode[] {
  if (Array.isArray(node)) return node.flatMap(styledNodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as StyledNode;
  return [...(el.props.style ? [el] : []), ...styledNodes(el.props.children)];
}

function renderAndRunEffects(timerMinutes: number) {
  hooks.index = 0;
  hooks.refIndex = 0;
  hooks.effects = [];
  const tree = ImposterDiscuss({ starter: "Ann", starterColor: "#123456", timerMinutes, voting: true, onFinish: vi.fn() });
  for (const effect of hooks.effects) {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  }
  return tree;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: NOW });
  hooks.states = [];
  hooks.refs = [];
  hooks.cleanups = [];
});

afterEach(() => {
  for (const cleanup of hooks.cleanups) cleanup();
  vi.useRealTimers();
});

describe("ImposterDiscuss vibrate once", () => {
  it("vibrates once when the timer runs out", () => {
    renderAndRunEffects(1);
    vi.advanceTimersByTime(59_000);
    renderAndRunEffects(1);
    expect(rn.vibrate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    renderAndRunEffects(1);
    renderAndRunEffects(1);
    expect(rn.vibrate).toHaveBeenCalledTimes(1);
    expect(rn.vibrate).toHaveBeenCalledWith(800);
  });

  it("never vibrates with the timer off", () => {
    renderAndRunEffects(0);
    vi.advanceTimersByTime(60_000);
    renderAndRunEffects(0);
    expect(rn.vibrate).not.toHaveBeenCalled();
  });
});

describe("ImposterDiscuss starter", () => {
  it("names who starts on that player's colour", () => {
    const [chip, label] = styledNodes(renderAndRunEffects(0));
    expect(chip.props.style).toEqual({ backgroundColor: "#123456" });
    expect(label.props.children).toBe("imposterStarts");
    expect(label.props.style).toEqual({ color: GAME_THEME.ink });
  });
});
