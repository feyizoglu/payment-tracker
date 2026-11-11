import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";

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
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import ImposterDiscuss from "./ImposterDiscuss";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function render(timerMinutes: number): Node {
  hooks.index = 0;
  hooks.effects = [];
  return ImposterDiscuss({ starter: "Ann", timerMinutes, voting: true, onFinish: vi.fn() }) as Node;
}

function runEffects() {
  for (const effect of hooks.effects) {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  }
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: NOW });
  hooks.states = [];
  hooks.cleanups = [];
});

afterEach(() => {
  for (const cleanup of hooks.cleanups) cleanup();
  vi.useRealTimers();
});

describe("ImposterDiscuss countdown", () => {
  it("counts down from the timer and shows time up at zero", () => {
    expect(text(render(1))).toContain("1:00");
    runEffects();
    vi.advanceTimersByTime(30_000);
    expect(text(render(1))).toContain("0:30");
    vi.advanceTimersByTime(30_000);
    const out = text(render(1));
    expect(out).toContain("imposterTimeUp");
    expect(out).not.toContain("0:00");
  });

  it("shows no countdown when the timer is off", () => {
    const out = text(render(0));
    runEffects();
    expect(vi.getTimerCount()).toBe(0);
    expect(out).not.toContain("0:00");
    expect(out).not.toContain("imposterTimeUp");
  });
});
