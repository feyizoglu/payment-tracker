import { describe, it, expect, vi, beforeEach } from "vitest";

const s = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  focused: true,
  gameMode: true,
  canGoBack: true,
  back: undefined as undefined | (() => boolean),
  remove: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useEffect: (effect: () => void | (() => void)) => s.effects.push(effect) };
});
vi.mock("expo-router", () => ({
  useIsFocused: () => s.focused,
  router: { canGoBack: () => s.canGoBack, back: vi.fn(), replace: vi.fn() },
}));
vi.mock("react-native", () => ({
  Alert: { alert: s.alert },
  BackHandler: {
    addEventListener: (_: string, fn: () => boolean) => {
      s.back = fn;
      return { remove: s.remove };
    },
  },
}));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: { gameLeaveTitle: "TITLE", gameLeaveBody: "BODY", gameLeaveConfirm: "LEAVE", cancel: "CANCEL" } }),
}));
vi.mock("@/lib/app-lock-context", () => ({ useAppLock: () => ({ lock: { gameMode: s.gameMode } }) }));

import { router } from "expo-router";
import { leaveGameScreen, useConfirmLeave } from "@/lib/leave-game";

type Button = { text: string; style?: string; onPress?: () => void };

function mount(active: boolean) {
  s.effects = [];
  useConfirmLeave(active);
  for (const effect of s.effects) effect();
}

const buttons = () => s.alert.mock.calls[0][2] as Button[];

beforeEach(() => {
  vi.clearAllMocks();
  s.focused = true;
  s.gameMode = true;
  s.canGoBack = true;
  s.back = undefined;
});

describe("useConfirmLeave", () => {
  it("asks before Android's back leaves a game in progress, and stays put", () => {
    mount(true);
    expect(s.back!()).toBe(true);
    expect(s.alert).toHaveBeenCalledWith("TITLE", "BODY", expect.any(Array));
    expect(buttons().map((b) => [b.text, b.style])).toEqual([
      ["CANCEL", "cancel"],
      ["LEAVE", "destructive"],
    ]);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("leaves the game only when Leave is chosen", () => {
    mount(true);
    s.back!();
    buttons()[1].onPress!();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("does not catch back when no game is in progress or another screen is on top", () => {
    mount(false);
    expect(s.back).toBeUndefined();
    s.focused = false;
    mount(true);
    expect(s.back).toBeUndefined();
  });
});

describe("leaveGameScreen", () => {
  it("goes back, or to the games list in game mode and to Payments outside it when there is no history", () => {
    leaveGameScreen(true);
    expect(router.back).toHaveBeenCalledTimes(1);
    s.canGoBack = false;
    leaveGameScreen(true);
    expect(router.replace).toHaveBeenLastCalledWith("/games");
    leaveGameScreen(false);
    expect(router.replace).toHaveBeenLastCalledWith("/");
  });
});
