import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { EMPTY_LOCK, type AppLockState } from "@/lib/app-lock";

const hooks = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
}));
const store = vi.hoisted(() => ({
  lock: null as unknown,
  raw: null as string | null,
  writeLock: vi.fn(),
  sha256Hex: async (text: string) => `h(${text})`,
  randomSalt: () => "salt",
}));
const win = vi.hoisted(() => ({ listeners: new Map<string, (e: unknown) => void>() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.refs)) hooks.refs[i] = { current: initial };
      return hooks.refs[i];
    },
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
    useSyncExternalStore: () => true,
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "unauthenticated" }) }));
vi.mock("lucide-react", () => ({ ArrowLeft: () => null, Loader2: () => null, LogOut: () => null }));
vi.mock("@/components/events/EventsHeader", () => ({ default: () => null }));
vi.mock("@/components/lock/PinSetup", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: {} }) }));
vi.mock("@/lib/games-offline", () => ({ prepareGamesOffline: vi.fn(async () => undefined) }));
vi.mock("@/lib/games-auth", () => ({
  gamesAccess: () => "allow",
  isRememberedSignedIn: () => true,
  rememberSignedIn: vi.fn(),
}));
vi.mock("@/lib/app-lock-store", () => ({
  useAppLock: () => store.lock,
  readLockRaw: () => store.raw,
  writeLock: store.writeLock,
  sha256Hex: store.sha256Hex,
  randomSalt: store.randomSalt,
}));

import GamesShell from "./GamesShell";
import PinSetup from "@/components/lock/PinSetup";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h", salt: "s" };
const CHILD = "CHILD";

function render(): Node {
  hooks.index = 0;
  hooks.effects = [];
  return GamesShell({ children: CHILD }) as Node;
}

function runEffects() {
  for (const effect of hooks.effects) effect();
}

function nodes(node: unknown): unknown[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [node];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.refs = [];
  win.listeners = new Map();
  store.lock = { ...withPin, gameMode: true };
  store.raw = null;
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: (e: unknown) => void) => win.listeners.set(type, fn),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GamesShell pageshow", () => {
  function enterAndRestore(persisted: boolean) {
    render();
    runEffects();
    store.raw = JSON.stringify({ ...withPin, gameMode: false });
    win.listeners.get("pageshow")?.({ persisted });
  }

  it("turns game mode back on when the page comes back from the back-forward cache", () => {
    enterAndRestore(true);
    expect(store.writeLock).toHaveBeenCalledWith({ ...withPin, gameMode: true });
  });

  it("writes nothing on a fresh page load", () => {
    enterAndRestore(false);
    expect(store.writeLock).not.toHaveBeenCalled();
  });
});

describe("GamesShell PinSetup onDone", () => {
  it("asks for a PIN instead of showing the games when none is set", () => {
    store.lock = EMPTY_LOCK;
    const all = nodes(render());
    expect(all.some((n) => (n as Node)?.type === PinSetup)).toBe(true);
    expect(all).not.toContain(CHILD);
  });

  it("saves the new PIN and enters game mode", async () => {
    store.lock = EMPTY_LOCK;
    const setup = nodes(render()).find((n) => (n as Node)?.type === PinSetup) as Node;
    await (setup.props.onDone as (pin: string) => Promise<void>)("1234");
    expect(store.writeLock).toHaveBeenCalledWith(
      expect.objectContaining({ pinHash: "h(salt1234)", salt: "salt", gameMode: true })
    );
  });
});
