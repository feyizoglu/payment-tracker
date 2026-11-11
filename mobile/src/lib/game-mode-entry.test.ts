import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { EMPTY_LOCK, type AppLockState } from "@ptracker/shared/app-lock";

const state = vi.hoisted(() => ({
  lock: null as unknown as AppLockState,
  update: vi.fn(async () => undefined),
  pinSetups: 0,
  setupForms: 0,
  pinScreens: [] as Array<{ onUnlock: (s: AppLockState) => Promise<void> | void }>,
  blur: null as null | (() => void),
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return { ActivityIndicator: () => null, Pressable: pass, Switch: () => null, Text: () => null, View: pass };
});
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: { push: vi.fn() },
    useFocusEffect: (cb: () => (() => void) | void) =>
      useEffect(() => {
        state.blur = cb() ?? null;
      }, [cb]),
  };
});
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t: new Proxy({}, { get: (_, k) => String(k) }), lang: "en" }) }));
vi.mock("@/lib/app-lock-context", () => ({ useAppLock: () => ({ ready: true, lock: state.lock, update: state.update }) }));
vi.mock("@/lib/app-lock-storage", () => ({ randomSalt: () => "salt", sha256Hex: async (s: string) => `h(${s})` }));
vi.mock("@/lib/imposter-storage", () => ({ getStoredSetup: async () => null, setStoredSetup: async () => undefined }));
vi.mock("@/components/games/game-screen", async () => {
  const { Fragment, createElement: h } = await import("react");
  return { GameScreen: ({ children }: { children?: unknown }) => h(Fragment, null, children as never) };
});
vi.mock("@/components/games/imposter-setup", () => ({
  ImposterSetupForm: () => {
    state.setupForms++;
    return null;
  },
}));
vi.mock("@/components/games/imposter-discuss", () => ({ ImposterDiscuss: () => null }));
vi.mock("@/components/games/imposter-result", () => ({ ImposterResult: () => null }));
vi.mock("@/components/games/pass-phone", () => ({ PassPhone: () => null }));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/lock/pin-setup", () => ({
  PinSetup: () => {
    state.pinSetups++;
    return null;
  },
}));
vi.mock("@/components/lock/pin-screen", () => ({
  PinScreen: (props: (typeof state.pinScreens)[number]) => {
    state.pinScreens.push(props);
    return null;
  },
}));

import ImposterScreen from "@/app/games/imposter";
import { PinSettings } from "@/components/lock/pin-settings";

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

async function render(component: () => unknown) {
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(component as never)));
  await act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h", salt: "s" };

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.lock = EMPTY_LOCK;
  state.update.mockClear();
  state.pinSetups = 0;
  state.setupForms = 0;
  state.pinScreens = [];
  state.blur = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("Imposter screen opened directly", () => {
  it("asks for a PIN first when none is set", async () => {
    await render(ImposterScreen);
    expect(state.pinSetups).toBeGreaterThan(0);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("enters game mode once per visit when a PIN exists", async () => {
    state.lock = withPin;
    await render(ImposterScreen);
    expect(state.pinSetups).toBe(0);
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledWith({ ...withPin, gameMode: true });

    state.lock = { ...withPin };
    await render(ImposterScreen);
    expect(state.update).toHaveBeenCalledTimes(1);
  });
});

describe("PIN settings", () => {
  it("asks for the PIN again after the Settings tab lost focus", async () => {
    state.lock = withPin;
    await render(PinSettings);
    expect(state.pinScreens.length).toBeGreaterThan(0);

    await act(async () => state.pinScreens.at(-1)!.onUnlock(withPin));
    state.pinScreens = [];
    await render(PinSettings);
    expect(state.pinScreens).toHaveLength(0);

    await act(async () => state.blur?.());
    expect(state.pinScreens.length).toBeGreaterThan(0);
  });
});
