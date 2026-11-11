import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";

const state = vi.hoisted(() => ({
  lock: { pinHash: "h", salt: "s", economyLock: true } as Record<string, unknown>,
  update: vi.fn(async () => undefined),
  focus: null as null | (() => () => void),
  pinProps: null as null | { onUnlock: (next: unknown) => Promise<void> },
  pinRenders: 0,
  childRenders: 0,
}));

vi.mock("expo-router", () => ({
  useFocusEffect: (cb: () => () => void) => {
    state.focus = cb;
  },
}));
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
import { markEconomyModal } from "@/lib/economy-unlock";

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

async function blur() {
  resetCounts();
  await act(async () => state.focus?.()());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.lock = { pinHash: "h", salt: "s", economyLock: true };
  state.focus = null;
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

describe("EconomyGate focus re-lock", () => {
  it("locks again when the tab loses focus", async () => {
    await render();
    await unlock({ pinHash: "h", salt: "s", economyLock: true });
    await blur();
    expect(state.pinRenders).toBeGreaterThan(0);
    expect(state.childRenders).toBe(0);
  });

  it("stays unlocked when Economy opened one of its own modals", async () => {
    await render();
    await unlock({ pinHash: "h", salt: "s", economyLock: true });
    markEconomyModal();
    await blur();
    await render();
    expect(state.childRenders).toBeGreaterThan(0);
    expect(state.pinRenders).toBe(0);
  });
});
