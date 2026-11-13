import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { EMPTY_LOCK, type AppLockState } from "@ptracker/shared/app-lock";
import { DEFAULT_SETUP, type ImposterSetup } from "@ptracker/shared/imposter";

const state = vi.hoisted(() => ({
  lock: null as unknown as AppLockState,
  update: vi.fn(async () => undefined),
  pinSetups: 0,
  setupForms: 0,
  storedSetup: null as unknown,
  setStoredSetup: vi.fn(async (_setup: unknown) => undefined),
  form: null as null | { value: unknown; onStart: () => void },
  dealTurns: 0,
  presses: [] as (() => void)[],
  pinScreens: [] as Array<{ onUnlock: (s: AppLockState) => Promise<void> | void }>,
  blur: null as null | (() => void),
  setLang: vi.fn((_lang: string) => undefined),
  lang: "en",
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  const Pressable = ({ children, onPress }: { children?: unknown; onPress?: () => void }) => {
    if (onPress) state.presses.push(onPress);
    return h(Fragment, null, children as never);
  };
  return { ActivityIndicator: () => null, Pressable, Switch: () => null, Text: () => null, View: pass };
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
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, k) => String(k) }), lang: state.lang, setLang: state.setLang }),
}));
vi.mock("@/lib/app-lock-context", () => ({ useAppLock: () => ({ ready: true, lock: state.lock, update: state.update }) }));
vi.mock("@/lib/app-lock-storage", () => ({ randomSalt: () => "salt", sha256Hex: async (s: string) => `h(${s})` }));
vi.mock("@/lib/imposter-storage", () => ({
  getStoredSetup: () => (state.storedSetup ? Promise.resolve(state.storedSetup) : new Promise(() => {})),
  setStoredSetup: state.setStoredSetup,
}));
vi.mock("@/components/games/game-screen", async () => {
  const { Fragment, createElement: h } = await import("react");
  return {
    GameScreen: ({ children, right }: { children?: unknown; right?: unknown }) =>
      h(Fragment, null, children as never, right as never),
  };
});
vi.mock("@/components/games/imposter-setup", () => ({
  ImposterSetupWizard: (props: { value: unknown; onStart: () => void }) => {
    state.setupForms++;
    state.form = props;
    return null;
  },
}));
vi.mock("@/components/games/imposter-discuss", () => ({ ImposterDiscuss: () => null }));
vi.mock("@/components/games/imposter-result", () => ({ ImposterResult: () => null }));
vi.mock("@/components/games/deal-turn", () => ({
  DealTurn: () => {
    state.dealTurns++;
    return null;
  },
}));
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

import { router } from "expo-router";
import GamesScreen from "@/app/games/index";
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
  state.storedSetup = null;
  state.setStoredSetup.mockClear();
  state.form = null;
  state.dealTurns = 0;
  state.presses = [];
  vi.mocked(router.push).mockClear();
  state.pinScreens = [];
  state.blur = null;
  state.setLang.mockClear();
  state.lang = "en";
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

describe("ImposterScreen onStart", () => {
  it("saves the chosen setup and deals the first card", async () => {
    const setup: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };
    state.lock = { ...withPin, gameMode: true };
    state.storedSetup = setup;
    await render(ImposterScreen);
    expect(state.form?.value).toEqual(setup);
    expect(state.dealTurns).toBe(0);

    await act(async () => state.form?.onStart());
    expect(state.setStoredSetup).toHaveBeenCalledTimes(1);
    expect(state.setStoredSetup).toHaveBeenCalledWith(setup);
    expect(state.dealTurns).toBeGreaterThan(0);
  });

  it("shows no setup form until the stored setup has been read", async () => {
    state.lock = { ...withPin, gameMode: true };
    state.storedSetup = null;
    await render(ImposterScreen);
    expect(state.setupForms).toBe(0);
    expect(state.setStoredSetup).not.toHaveBeenCalled();
  });
});

describe("GamesScreen", () => {
  it("asks for a PIN first when none is set", async () => {
    await render(GamesScreen);
    expect(state.pinSetups).toBeGreaterThan(0);
    expect(state.presses).toHaveLength(0);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("opens the imposter game from its entry once a PIN exists", async () => {
    state.lock = { ...withPin, gameMode: true };
    await render(GamesScreen);
    expect(state.pinSetups).toBe(0);
    expect(state.presses).toHaveLength(3);
    state.presses[0]();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/games/imposter");
  });

  it("opens Wolf Night from its entry", async () => {
    state.lock = { ...withPin, gameMode: true };
    await render(GamesScreen);
    state.presses[1]();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/games/wolf");
  });

  it("enters game mode when the games list is opened with a PIN", async () => {
    state.lock = withPin;
    await render(GamesScreen);
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledWith({ ...withPin, gameMode: true });
  });

  it.each([
    ["en", "tr"],
    ["tr", "en"],
  ])("switches the language from %s to %s with the header's flag, as Settings is out of reach in game mode", async (from, to) => {
    state.lock = { ...withPin, gameMode: true };
    state.lang = from;
    await render(GamesScreen);
    state.presses[2]();
    expect(router.push).not.toHaveBeenCalled();
    expect(state.setLang).toHaveBeenCalledTimes(1);
    expect(state.setLang).toHaveBeenCalledWith(to);
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
