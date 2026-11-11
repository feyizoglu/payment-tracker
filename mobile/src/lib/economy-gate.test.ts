import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";

const state = vi.hoisted(() => ({
  lock: { pinHash: "h", salt: "s", economyLock: true } as Record<string, unknown>,
  update: vi.fn(async () => undefined),
  path: "/economy",
  pinProps: null as null | { onUnlock: (next: unknown) => Promise<void> },
  pinRenders: 0,
  childRenders: 0,
}));

vi.mock("expo-router", () => ({ usePathname: () => state.path }));
vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  return { ScrollView: ({ children }: { children?: unknown }) => h(Fragment, null, children as never) };
});
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t: { pinEconomyTitle: "Economy" } }) }));
vi.mock("@/components/tab-screen", async () => {
  const { Fragment, createElement: h } = await import("react");
  return { TabScreen: ({ children }: { children?: unknown }) => h(Fragment, null, children as never) };
});
vi.mock("@/lib/app-lock-context", () => ({
  useAppLock: () => ({ ready: true, lock: { ...state.lock }, update: state.update }),
}));
vi.mock("@/components/lock/pin-screen", () => ({
  PinScreen: (props: { onUnlock: (next: unknown) => Promise<void> }) => {
    state.pinProps = props;
    state.pinRenders++;
    return null;
  },
}));

import { EconomyGate } from "@/components/lock/economy-gate";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot: (container: unknown) => Root;
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

function container() {
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...listeners }, ...listeners };
}

function Child() {
  state.childRenders++;
  return null;
}

async function render() {
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(EconomyGate, null, createElement(Child))));
}

function resetCounts() {
  state.pinRenders = 0;
  state.childRenders = 0;
}

async function unlock(next: unknown) {
  resetCounts();
  await act(async () => state.pinProps?.onUnlock(next));
}

async function go(path: string) {
  state.path = path;
  resetCounts();
  await render();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.lock = { pinHash: "h", salt: "s", economyLock: true };
  state.path = "/economy";
  state.pinProps = null;
  resetCounts();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("EconomyGate", () => {
  it("shows the PIN screen instead of the children when the economy lock is on", async () => {
    await render();
    expect(state.pinRenders).toBeGreaterThan(0);
    expect(state.childRenders).toBe(0);
  });

  it("stores the unlocked state and shows the children after an unlock", async () => {
    await render();
    const next = { pinHash: "h", salt: "s", economyLock: true, failures: 0 };
    await unlock(next);
    expect(state.update).toHaveBeenCalledWith(next);
    expect(state.childRenders).toBeGreaterThan(0);
    expect(state.pinRenders).toBe(0);
  });

  it("shows the children directly when the economy lock is off", async () => {
    state.lock = { pinHash: "h", salt: "s", economyLock: false };
    await render();
    expect(state.childRenders).toBeGreaterThan(0);
    expect(state.pinRenders).toBe(0);
  });
});

describe("EconomyGate re-lock by path", () => {
  const unlocked = { pinHash: "h", salt: "s", economyLock: true };

  it("locks again after another tab was opened", async () => {
    await render();
    await unlock(unlocked);
    await go("/");
    expect(state.childRenders).toBe(0);
    await go("/economy");
    expect(state.pinRenders).toBeGreaterThan(0);
    expect(state.childRenders).toBe(0);
  });

  it.each(["/asset-form", "/asset/abc", "/manual-gold"])("stays unlocked while its own modal %s is open", async (modal) => {
    await render();
    await unlock(unlocked);
    await go(modal);
    expect(state.childRenders).toBeGreaterThan(0);
    expect(state.pinRenders).toBe(0);
    await go("/economy");
    expect(state.childRenders).toBeGreaterThan(0);
    expect(state.pinRenders).toBe(0);
  });

  it("locks again when a modal is left straight for another screen", async () => {
    await render();
    await unlock(unlocked);
    await go("/asset/abc");
    await go("/");
    await go("/economy");
    expect(state.pinRenders).toBeGreaterThan(0);
    expect(state.childRenders).toBe(0);
  });

  it("locks again after the same modal was opened twice and another tab was visited", async () => {
    await render();
    await unlock(unlocked);
    await go("/asset-form");
    await go("/asset-form");
    await go("/economy");
    await go("/events");
    await go("/economy");
    expect(state.pinRenders).toBeGreaterThan(0);
    expect(state.childRenders).toBe(0);
  });

  it("drops an unlock that finishes after the user left Economy", async () => {
    await render();
    state.path = "/";
    await unlock(unlocked);
    expect(state.childRenders).toBe(0);
    await go("/economy");
    expect(state.pinRenders).toBeGreaterThan(0);
    expect(state.childRenders).toBe(0);
  });
});
