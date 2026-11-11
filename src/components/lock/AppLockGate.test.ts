import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_LOCK, type AppLockState } from "@/lib/app-lock";

const state = vi.hoisted(() => ({
  path: "/dashboard",
  lock: null as unknown,
  writeLock: vi.fn(),
  pin: null as null | { cancel: { href: string }; onUnlock: (next: unknown) => void },
  pinRenders: 0,
  childRenders: 0,
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: {} }) }));
vi.mock("@/lib/app-lock-store", () => ({ useAppLock: () => state.lock, writeLock: state.writeLock }));
vi.mock("./PinScreen", () => ({
  default: (props: { cancel: { href: string }; onUnlock: (next: unknown) => void }) => {
    state.pin = props;
    state.pinRenders++;
    return null;
  },
}));

import AppLockGate from "./AppLockGate";

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

function resetCounts() {
  state.pinRenders = 0;
  state.childRenders = 0;
}

async function render(path: string) {
  state.path = path;
  resetCounts();
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(AppLockGate, null, createElement(Child))));
}

async function unlock(next: AppLockState) {
  resetCounts();
  await act(async () => state.pin?.onUnlock(next));
}

const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h", salt: "s" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.lock = withPin;
  state.pin = null;
  resetCounts();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("Gate before lock read", () => {
  it("hides the children of a locked-capable page until the lock is read", () => {
    state.lock = null;
    state.path = "/dashboard";
    renderToStaticMarkup(createElement(AppLockGate, null, createElement(Child)));
    expect(state.childRenders).toBe(0);
  });

  it("renders the games before the lock is read", () => {
    state.lock = null;
    state.path = "/games/imposter";
    renderToStaticMarkup(createElement(AppLockGate, null, createElement(Child)));
    expect(state.childRenders).toBe(1);
  });
});

describe("Gate game-mode screen", () => {
  it("asks for the PIN with a way back to the games outside the games", async () => {
    state.lock = { ...withPin, gameMode: true };
    await render("/dashboard");
    expect(state.pin?.cancel.href).toBe("/games");
    expect(state.childRenders).toBe(0);
  });

  it("renders the games in game mode", async () => {
    state.lock = { ...withPin, gameMode: true };
    await render("/games");
    expect(state.childRenders).toBeGreaterThan(0);
    expect(state.pinRenders).toBe(0);
  });
});

describe("Gate game unlock", () => {
  it("leaves game mode on unlock", async () => {
    state.lock = { ...withPin, gameMode: true };
    await render("/dashboard");
    await unlock({ ...withPin, gameMode: true, failures: 0 });
    expect(state.writeLock).toHaveBeenCalledWith({ ...withPin, gameMode: false, failures: 0 });
  });
});

describe("Gate economy screen", () => {
  it("asks for the PIN on Economy with a way back to the dashboard", async () => {
    state.lock = { ...withPin, economyLock: true };
    await render("/economy");
    expect(state.pin?.cancel.href).toBe("/dashboard");
    expect(state.childRenders).toBe(0);
  });

  it("stores the unlocked state and shows Economy after an unlock", async () => {
    state.lock = { ...withPin, economyLock: true };
    await render("/economy");
    const next = { ...withPin, economyLock: true, failures: 0 };
    await unlock(next);
    expect(state.writeLock).toHaveBeenCalledWith(next);
    expect(state.childRenders).toBeGreaterThan(0);
  });
});

describe("AppLockGate key per path", () => {
  it("asks for the PIN again after leaving Economy and coming back", async () => {
    state.lock = { ...withPin, economyLock: true };
    await render("/economy");
    await unlock({ ...withPin, economyLock: true });
    await render("/dashboard");
    await render("/economy");
    expect(state.pinRenders).toBeGreaterThan(0);
    expect(state.childRenders).toBe(0);
  });
});
