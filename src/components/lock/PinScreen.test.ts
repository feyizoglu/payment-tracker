import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { EMPTY_LOCK, type AppLockState } from "@/lib/app-lock";

const NOW = 1_800_000_000_000;

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  index: 0,
  refIndex: 0,
}));
const store = vi.hoisted(() => ({
  writeLock: vi.fn(),
  sha256Hex: vi.fn(async (text: string) => `h(${text})`),
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
vi.mock("lucide-react", () => ({ Lock: () => null }));
vi.mock("@/lib/i18n", () => ({
  localeFor: () => "tr-TR",
  useLang: () => ({
    lang: "tr",
    t: {
      pinWrong: "WRONG",
      pinEnter: "",
      pinUnlock: "UNLOCK",
      pinForgot: "FORGOT",
      pinResetCancel: "CANCEL",
      pinResetPending: "pending {time}",
      pinLockedOut: "{s}",
      pinLockedOutMin: "{m}",
    },
  }),
}));
vi.mock("@/lib/app-lock-store", () => store);

import PinScreen from "./PinScreen";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onUnlock = vi.fn();
const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h(s1234)", salt: "s" };

function render(state: AppLockState, showForgot = true): Node {
  hooks.index = 0;
  hooks.refIndex = 0;
  hooks.effects = [];
  return PinScreen({ state, title: "Lock", onUnlock, showForgot }) as Node;
}

function runEffects() {
  for (const effect of hooks.effects) {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  }
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

function find(tree: Node, type: string, label?: string) {
  return nodes(tree).find((n) => n.type === type && (label === undefined || text(n) === label));
}

function typePin(state: AppLockState, pin: string) {
  const input = find(render(state), "input")!;
  (input.props.onChange as (e: unknown) => void)({ target: { value: pin } });
  return render(state);
}

function submit(tree: Node) {
  return (find(tree, "form")!.props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault: () => undefined });
}

function fakeIntervals() {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: NOW });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  hooks.states = [];
  hooks.refs = [];
  hooks.cleanups = [];
});

afterEach(() => {
  for (const cleanup of hooks.cleanups) cleanup();
  vi.useRealTimers();
});

describe("PinScreen submit wrong PIN", () => {
  it("saves one more failure, shows the error and does not unlock", async () => {
    const lock = { ...withPin, failures: 2 };
    await submit(typePin(lock, "9999"));
    expect(store.writeLock).toHaveBeenCalledWith(expect.objectContaining({ failures: 3 }));
    expect(text(render(lock))).toContain("WRONG");
    expect(onUnlock).not.toHaveBeenCalled();
  });
});

describe("PinScreen checkingRef", () => {
  it("checks the PIN once when the form is submitted twice during a check", async () => {
    let finish: (v: string) => void = () => undefined;
    store.sha256Hex.mockImplementationOnce(
      () =>
        new Promise<string>((r) => {
          finish = r;
        })
    );
    const tree = typePin(withPin, "9999");
    const first = submit(tree);
    const second = submit(tree);
    finish("wrong");
    await Promise.all([first, second]);
    expect(store.sha256Hex).toHaveBeenCalledTimes(1);
    expect(store.writeLock).toHaveBeenCalledTimes(1);
  });
});

describe("PinScreen submit right PIN", () => {
  it("unlocks with the counters reset and leaves saving to the caller", async () => {
    const lock = { ...withPin, failures: 3 };
    await submit(typePin(lock, "1234"));
    expect(onUnlock).toHaveBeenCalledWith({ ...withPin, failures: 0, lockedUntil: 0, resetAt: 0 });
    expect(store.writeLock).not.toHaveBeenCalled();
  });
});

describe("PinScreen clampLockout effect", () => {
  it("caps a lockout further than 15 minutes ahead", () => {
    render({ ...withPin, failures: 9, lockedUntil: NOW + 60 * 60_000 });
    runEffects();
    expect(store.writeLock).toHaveBeenCalledWith(expect.objectContaining({ lockedUntil: NOW + 15 * 60_000 }));
  });

  it("leaves a lockout within 15 minutes alone", () => {
    render({ ...withPin, failures: 9, lockedUntil: NOW + 10 * 60_000 });
    runEffects();
    expect(store.writeLock).not.toHaveBeenCalled();
  });
});

describe("PinScreen applyReset tick", () => {
  it("clears the lock once the requested reset time has passed", () => {
    render({ ...withPin, resetAt: NOW - 1 });
    runEffects();
    expect(store.writeLock).toHaveBeenCalledWith(EMPTY_LOCK);
  });

  it("clears the lock on the one-second tick after the reset time arrives, and not before", () => {
    fakeIntervals();
    render({ ...withPin, resetAt: NOW + 1500 });
    runEffects();
    vi.advanceTimersByTime(1000);
    expect(store.writeLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(store.writeLock).toHaveBeenCalledWith(EMPTY_LOCK);
  });

  it("stops ticking once the screen is gone", () => {
    fakeIntervals();
    render({ ...withPin, resetAt: NOW + 1500 });
    runEffects();
    for (const cleanup of hooks.cleanups.splice(0)) cleanup();
    vi.advanceTimersByTime(5000);
    expect(store.writeLock).not.toHaveBeenCalled();
  });

  it("starts no reset timer when no reset was requested", () => {
    fakeIntervals();
    render(withPin);
    runEffects();
    expect(vi.getTimerCount()).toBe(0);
    expect(store.writeLock).not.toHaveBeenCalled();
  });
});

describe("PinScreen forgot", () => {
  it("requests a reset one hour from now", () => {
    (find(render(withPin), "button", "FORGOT")!.props.onClick as () => void)();
    expect(store.writeLock).toHaveBeenCalledWith({ ...withPin, resetAt: NOW + 60 * 60_000 });
  });

  it("offers no reset when showForgot is false", () => {
    expect(find(render(withPin, false), "button", "FORGOT")).toBeUndefined();
  });
});

describe("PinScreen cancel reset", () => {
  it("cancels a pending reset", () => {
    const lock = { ...withPin, resetAt: NOW + 30 * 60_000 };
    (find(render(lock), "button", "CANCEL")!.props.onClick as () => void)();
    expect(store.writeLock).toHaveBeenCalledWith({ ...withPin, resetAt: 0 });
  });
});
