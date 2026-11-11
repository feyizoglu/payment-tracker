import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { EMPTY_LOCK, type AppLockState } from "@ptracker/shared/app-lock";

const state = vi.hoisted(() => ({
  resolve: null as null | ((s: unknown) => void),
  value: null as null | { ready: boolean; lock: unknown; update: (next: unknown) => Promise<void> },
}));

vi.mock("@/lib/app-lock-storage", () => ({
  getStoredLock: vi.fn(
    () =>
      new Promise((r) => {
        state.resolve = r;
      })
  ),
  setStoredLock: vi.fn(async () => undefined),
}));

import { AppLockProvider, useAppLock } from "@/lib/app-lock-context";
import { setStoredLock } from "@/lib/app-lock-storage";

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

function Probe() {
  state.value = useAppLock() as never;
  return null;
}

async function render() {
  root = createRoot(container());
  await act(async () => root?.render(createElement(AppLockProvider, null, createElement(Probe))));
}

const stored: AppLockState = { ...EMPTY_LOCK, pinHash: "h", salt: "s", economyLock: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.resolve = null;
  state.value = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("AppLockProvider", () => {
  it("is not ready and exposes the empty lock until the stored lock is read", async () => {
    await render();
    expect(state.value?.ready).toBe(false);
    expect(state.value?.lock).toEqual(EMPTY_LOCK);
  });

  it("becomes ready with the stored lock once it is read", async () => {
    await render();
    await act(async () => state.resolve?.(stored));
    expect(state.value?.ready).toBe(true);
    expect(state.value?.lock).toEqual(stored);
  });
});

describe("AppLockProvider update", () => {
  it("exposes the new lock and stores it", async () => {
    await render();
    await act(async () => state.resolve?.(EMPTY_LOCK));
    const next = { ...stored, gameMode: true };
    await act(async () => state.value?.update(next));
    expect(state.value?.lock).toEqual(next);
    expect(setStoredLock).toHaveBeenCalledWith(next);
  });
});
