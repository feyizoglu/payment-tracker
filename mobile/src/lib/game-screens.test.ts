import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { EMPTY_LOCK, type AppLockState } from "@ptracker/shared/app-lock";

const s = vi.hoisted(() => ({
  lock: null as unknown,
  path: "/games",
  canGoBack: false,
  update: vi.fn(async (_next: unknown) => undefined),
}));

vi.mock("expo-router", () => ({
  usePathname: () => s.path,
  router: { canGoBack: () => s.canGoBack, back: vi.fn(), replace: vi.fn(), push: vi.fn() },
}));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: () => null,
  Platform: { OS: "android" },
  Pressable: () => null,
  ScrollView: () => null,
  Text: () => null,
  View: () => null,
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock("@/lib/game-theme", () => ({ gameDarkVars: { dark: true } }));
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t: { back: "BACK", gameModeExit: "EXIT" } }) }));
vi.mock("@/lib/app-lock-context", () => ({ useAppLock: () => ({ ready: true, lock: s.lock, update: s.update }) }));
vi.mock("@/lib/app-lock-storage", () => ({
  randomSalt: () => "salt",
  sha256Hex: async (text: string) => `h(${text})`,
}));
vi.mock("@/components/lock/pin-setup", () => ({ PinSetup: () => null }));
vi.mock("@/components/lock/pin-screen", () => ({ PinScreen: () => null }));

import { router } from "expo-router";
import { KeyboardAvoidingView, Pressable, ScrollView, View } from "react-native";
import AppLockScreen from "@/app/app-lock";
import { GameScreen } from "@/components/games/game-screen";
import { GamesPinSetup } from "@/components/games/game-mode-entry";
import { PinScreen } from "@/components/lock/pin-screen";
import { PinSetup } from "@/components/lock/pin-setup";
import { GAME_THEME } from "@ptracker/shared/imposter";
import { gameDarkVars } from "@/lib/game-theme";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h", salt: "s" };

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function pressable(label: string) {
  const tree = GameScreen({ title: "Game", children: null }) as Node;
  return nodes(tree).find((n) => n.type === Pressable && text(n).includes(label));
}

beforeEach(() => {
  vi.clearAllMocks();
  s.lock = withPin;
  s.path = "/games";
  s.canGoBack = false;
});

describe("AppLockScreen onUnlock", () => {
  it("leaves game mode with the checked state", async () => {
    const tree = AppLockScreen() as Node;
    const screen = nodes(tree).find((n) => n.type === PinScreen)!;
    await (screen.props.onUnlock as (next: AppLockState) => Promise<void>)({ ...withPin, gameMode: true, failures: 0 });
    expect(s.update).toHaveBeenCalledWith({ ...withPin, gameMode: false, failures: 0 });
  });
});

describe("GamesPinSetup", () => {
  it("saves the new PIN and enters game mode", async () => {
    s.lock = EMPTY_LOCK;
    const setup = nodes(GamesPinSetup({ title: "Games" })).find((n) => n.type === PinSetup)!;
    await (setup.props.onDone as (pin: string) => Promise<void>)("1234");
    expect(s.update).toHaveBeenCalledWith(
      expect.objectContaining({ pinHash: "h(salt1234)", salt: "salt", gameMode: true })
    );
  });
});

describe("GameScreen hidden back", () => {
  it("hides the back action on the games list in game mode", () => {
    s.lock = { ...withPin, gameMode: true };
    expect(pressable("BACK")).toBeUndefined();
  });

  it("shows the back action outside game mode", () => {
    expect(pressable("BACK")).toBeDefined();
  });
});

describe("GameScreen back fallback", () => {
  it("goes to the games list in game mode when there is no history", () => {
    s.lock = { ...withPin, gameMode: true };
    s.path = "/games/imposter";
    (pressable("BACK")!.props.onPress as () => void)();
    expect(router.replace).toHaveBeenCalledWith("/games");
  });

  it("goes to Payments outside game mode when there is no history", () => {
    (pressable("BACK")!.props.onPress as () => void)();
    expect(router.replace).toHaveBeenCalledWith("/");
  });
});

describe("GameScreen header slots", () => {
  const header = (props: { right?: ReactElement } = {}) => {
    const tree = GameScreen({ title: "Game", children: null, ...props }) as Node;
    const row = nodes(tree).find((n) => n.type === View && String(n.props.className).includes("border-b"))!;
    return (row.props.children as unknown[]).map((child) => text(child));
  };

  it("puts the exit on the left on the games list in game mode, where there is no back", () => {
    s.lock = { ...withPin, gameMode: true };
    expect(header()).toEqual(["EXIT", "Game", ""]);
  });

  it("keeps the back on the left and the exit on the right on the other game screens", () => {
    s.lock = { ...withPin, gameMode: true };
    s.path = "/games/imposter";
    expect(header()).toEqual(["‹ BACK", "Game", "EXIT"]);
  });

  it("shows the screen's own action on the right", () => {
    s.lock = { ...withPin, gameMode: true };
    expect(header({ right: createElement(Pressable, null, "FLAG") })).toEqual(["EXIT", "Game", "FLAG"]);
  });

  it("has no exit outside game mode", () => {
    expect(header()).toEqual(["‹ BACK", "Game", ""]);
  });
});

describe("GameScreen exit button", () => {
  it("opens the lock screen from the games list in game mode", () => {
    s.lock = { ...withPin, gameMode: true };
    (pressable("EXIT")!.props.onPress as () => void)();
    expect(router.push).toHaveBeenCalledWith("/app-lock");
  });

  it("is hidden on the lock screen itself", () => {
    s.lock = { ...withPin, gameMode: true };
    s.path = "/app-lock";
    expect(pressable("EXIT")).toBeUndefined();
  });
});

describe("GameScreen tone and body", () => {
  type ScreenProps = Parameters<typeof GameScreen>[0];
  const screen = (props: Partial<ScreenProps> = {}) => GameScreen({ title: "Game", children: "BODY", ...props }) as Node;
  const styles = (node: Node) => [node.props.style].flat();

  it("follows the app theme by default", () => {
    const tree = screen();
    expect(tree.type).toBe(KeyboardAvoidingView);
    expect(String(tree.props.className)).toContain("bg-surface");
    expect(nodes(tree).some((n) => n.props.style === gameDarkVars)).toBe(false);
  });

  it("draws the game tone on the fixed dark background with the dark palette", () => {
    const tree = screen({ tone: "game" });
    expect(String(tree.props.className)).not.toContain("bg-surface");
    expect(styles(tree)).toContainEqual({ backgroundColor: GAME_THEME.bg });
    const themed = nodes(tree).find((n) => n.type === View && n.props.style === gameDarkVars)!;
    expect(text(themed)).toContain("BODY");
  });

  it("fills the body with the player's colour", () => {
    const body = nodes(screen({ tone: "game", color: "#FF6B6B" })).find((n) => n.type === ScrollView)!;
    expect(body.props.style).toEqual({ backgroundColor: "#FF6B6B" });
    expect(nodes(screen({ tone: "game" })).find((n) => n.type === ScrollView)!.props.style).toBeNull();
  });

  it("does not scroll when asked, so holding the card is never taken for a scroll", () => {
    const tree = screen({ tone: "game", color: "#FF6B6B", scroll: false });
    expect(nodes(tree).some((n) => n.type === ScrollView)).toBe(false);
    const body = nodes(tree).find((n) => n.type === View && styles(n).some((s) => s && (s as { backgroundColor?: string }).backgroundColor === "#FF6B6B"))!;
    expect(text(body)).toBe("BODY");
  });
});
