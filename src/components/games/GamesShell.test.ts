import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { EMPTY_LOCK, type AppLockState } from "@/lib/app-lock";
import type { SessionCheck, SessionStatus } from "@/lib/games-auth";

type CheckResult = Exclude<SessionCheck, "pending">;

const s = vi.hoisted(() => ({
  status: "authenticated" as string,
  online: true,
  remembered: false,
  lock: null as unknown,
  raw: null as string | null,
  replace: vi.fn(),
  writeLock: vi.fn(),
  rememberSignedIn: vi.fn(),
  checkSession: vi.fn(),
  prepareGamesOffline: vi.fn(async () => undefined),
  pinSetup: null as null | { onDone: (pin: string) => Promise<void> },
  childRenders: 0,
  listeners: new Map<string, (e: unknown) => void>(),
}));

const host = vi.hoisted(() => {
  const keep = (c: unknown): unknown =>
    Array.isArray(c) ? c.map(keep) : typeof c === "string" || typeof c === "number" ? null : c;
  const Host = (props: { children?: unknown }) => keep(props.children) ?? null;
  const wrap =
    (fn: (...args: unknown[]) => unknown) =>
    (type: unknown, ...rest: unknown[]) =>
      fn(typeof type === "string" ? Host : type, ...rest);
  return { wrap };
});

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsx: host.wrap(actual.jsx), jsxs: host.wrap(actual.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsxDEV: host.wrap(actual.jsxDEV) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: s.replace }) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: s.status }) }));
vi.mock("lucide-react", () => ({ ArrowLeft: () => null, Loader2: () => null, LogOut: () => null }));
vi.mock("@/components/events/EventsHeader", () => ({ default: () => null }));
vi.mock("@/components/lock/PinSetup", () => ({
  default: (props: { onDone: (pin: string) => Promise<void> }) => {
    s.pinSetup = props;
    return null;
  },
}));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: {} }) }));
vi.mock("@/lib/games-offline", () => ({ prepareGamesOffline: s.prepareGamesOffline }));
vi.mock("@/lib/games-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/games-auth")>()),
  isRememberedSignedIn: () => s.remembered,
  rememberSignedIn: s.rememberSignedIn,
  checkSession: s.checkSession,
}));
vi.mock("@/lib/app-lock-store", () => ({
  useAppLock: () => s.lock,
  readLockRaw: () => s.raw,
  writeLock: s.writeLock,
  sha256Hex: async (text: string) => `h(${text})`,
  randomSalt: () => "salt",
}));

import GamesShell from "./GamesShell";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot: (container: unknown) => Root;
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h", salt: "s" };

function container() {
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...listeners }, ...listeners };
}

function Child() {
  s.childRenders++;
  return null;
}

async function render() {
  s.childRenders = 0;
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(GamesShell, null, createElement(Child))));
}

function session(status: SessionStatus, { online = true, remembered = false, check }: { online?: boolean; remembered?: boolean; check?: CheckResult } = {}) {
  s.status = status;
  s.online = online;
  s.remembered = remembered;
  if (check) s.checkSession.mockResolvedValue(check);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  s.status = "authenticated";
  s.online = true;
  s.remembered = false;
  s.lock = { ...withPin, gameMode: true };
  s.raw = null;
  s.pinSetup = null;
  s.listeners = new Map();
  s.checkSession.mockResolvedValue("none");
  s.rememberSignedIn.mockImplementation((signedIn: boolean) => {
    s.remembered = signedIn;
  });
  vi.stubGlobal("window", {
    HTMLIFrameElement: class {},
    addEventListener: (type: string, fn: (e: unknown) => void) => s.listeners.set(type, fn),
    removeEventListener: (type: string) => s.listeners.delete(type),
  });
  vi.stubGlobal("navigator", {
    get onLine() {
      return s.online;
    },
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("GamesShell enter game mode once", () => {
  it("turns game mode on once and leaves it off after it was exited in another tab", async () => {
    s.lock = withPin;
    await render();
    expect(s.writeLock).toHaveBeenCalledTimes(1);
    expect(s.writeLock).toHaveBeenCalledWith({ ...withPin, gameMode: true });

    s.lock = { ...withPin, gameMode: true };
    await render();
    s.lock = { ...withPin, gameMode: false };
    await render();
    expect(s.writeLock).toHaveBeenCalledTimes(1);
  });

  it("does not enter game mode before access is allowed", async () => {
    s.lock = withPin;
    session("unauthenticated");
    await render();
    expect(s.writeLock).not.toHaveBeenCalled();
  });
});

describe("GamesShell sign-in redirect", () => {
  it("sends a device that was never signed in to the sign-in page without asking the server again", async () => {
    session("unauthenticated");
    await render();
    expect(s.replace).toHaveBeenCalledWith("/");
    expect(s.childRenders).toBe(0);
    expect(s.checkSession).not.toHaveBeenCalled();
  });

  it("waits for the server's answer on a remembered device", async () => {
    const answer = deferred<CheckResult>();
    s.checkSession.mockReturnValue(answer.promise);
    session("unauthenticated", { remembered: true });
    await render();
    expect(s.checkSession).toHaveBeenCalledTimes(1);
    expect(s.replace).not.toHaveBeenCalled();
    expect(s.childRenders).toBe(0);

    await act(async () => answer.resolve("none"));
    expect(s.replace).toHaveBeenCalledWith("/");
    expect(s.childRenders).toBe(0);
  });

  it("redirects a remembered device once the server confirmed there is no session", async () => {
    session("unauthenticated", { remembered: true, check: "none" });
    await render();
    expect(s.replace).toHaveBeenCalledWith("/");
    expect(s.childRenders).toBe(0);
  });

  it("keeps the games open on a remembered device when the server cannot be reached", async () => {
    session("unauthenticated", { remembered: true, check: "unreachable" });
    await render();
    expect(s.replace).not.toHaveBeenCalled();
    expect(s.childRenders).toBeGreaterThan(0);
  });

  it("keeps the games open when the server still has the session", async () => {
    session("unauthenticated", { remembered: true, check: "active" });
    await render();
    expect(s.replace).not.toHaveBeenCalled();
    expect(s.childRenders).toBeGreaterThan(0);
  });

  it("renders the games offline on a remembered device without asking the server", async () => {
    session("unauthenticated", { online: false, remembered: true });
    await render();
    expect(s.childRenders).toBeGreaterThan(0);
    expect(s.replace).not.toHaveBeenCalled();
    expect(s.checkSession).not.toHaveBeenCalled();
  });

  it("ignores an answer that arrives after the device went offline", async () => {
    const answer = deferred<CheckResult>();
    s.checkSession.mockReturnValue(answer.promise);
    session("unauthenticated", { remembered: true });
    await render();
    s.online = false;
    await act(async () => s.listeners.get("offline")?.({}));
    await act(async () => answer.resolve("none"));
    expect(s.replace).not.toHaveBeenCalled();
    expect(s.rememberSignedIn).not.toHaveBeenCalled();
    expect(s.childRenders).toBeGreaterThan(0);
  });
});

describe("GamesShell rememberSignedIn", () => {
  it("stores the flag for a signed-in user", async () => {
    await render();
    expect(s.rememberSignedIn).toHaveBeenCalledWith(true);
    expect(s.rememberSignedIn).not.toHaveBeenCalledWith(false);
  });

  it("clears the flag once the server confirmed there is no session", async () => {
    session("unauthenticated", { remembered: true, check: "none" });
    await render();
    expect(s.rememberSignedIn).toHaveBeenCalledWith(false);
    expect(s.rememberSignedIn).not.toHaveBeenCalledWith(true);
  });

  it("keeps the flag when the server cannot be reached while the browser says online", async () => {
    session("unauthenticated", { remembered: true, check: "unreachable" });
    await render();
    expect(s.rememberSignedIn).not.toHaveBeenCalled();
  });

  it("keeps the flag while the server's answer is pending", async () => {
    s.checkSession.mockReturnValue(new Promise(() => undefined));
    session("unauthenticated", { remembered: true });
    await render();
    expect(s.rememberSignedIn).not.toHaveBeenCalled();
  });

  it("keeps the flag while offline", async () => {
    session("unauthenticated", { online: false, remembered: true });
    await render();
    expect(s.rememberSignedIn).not.toHaveBeenCalled();
  });
});

describe("GamesShell prepareGamesOffline", () => {
  it("prepares offline play once for a signed-in session", async () => {
    await render();
    await render();
    expect(s.prepareGamesOffline).toHaveBeenCalledTimes(1);
  });

  it("does not prepare offline play while the session is loading", async () => {
    session("loading");
    await render();
    expect(s.prepareGamesOffline).not.toHaveBeenCalled();
  });

  it("does not prepare offline play without a session, even when the games stay open", async () => {
    session("unauthenticated", { remembered: true, check: "unreachable" });
    await render();
    expect(s.childRenders).toBeGreaterThan(0);
    expect(s.prepareGamesOffline).not.toHaveBeenCalled();
  });

  it("prepares offline play as soon as the session becomes authenticated", async () => {
    session("loading");
    await render();
    session("authenticated");
    await render();
    expect(s.prepareGamesOffline).toHaveBeenCalledTimes(1);
  });
});

describe("GamesShell pageshow", () => {
  async function enterAndRestore(persisted: boolean) {
    await render();
    s.writeLock.mockClear();
    s.raw = JSON.stringify({ ...withPin, gameMode: false });
    s.listeners.get("pageshow")?.({ persisted });
  }

  it("turns game mode back on when the page comes back from the back-forward cache", async () => {
    await enterAndRestore(true);
    expect(s.writeLock).toHaveBeenCalledWith({ ...withPin, gameMode: true });
  });

  it("writes nothing on a fresh page load", async () => {
    await enterAndRestore(false);
    expect(s.writeLock).not.toHaveBeenCalled();
  });
});

describe("GamesShell PinSetup onDone", () => {
  it("asks for a PIN instead of showing the games when none is set", async () => {
    s.lock = EMPTY_LOCK;
    await render();
    expect(s.pinSetup).not.toBeNull();
    expect(s.childRenders).toBe(0);
  });

  it("saves the new PIN and enters game mode", async () => {
    s.lock = EMPTY_LOCK;
    await render();
    await s.pinSetup?.onDone("1234");
    expect(s.writeLock).toHaveBeenCalledTimes(1);
    expect(s.writeLock).toHaveBeenCalledWith(
      expect.objectContaining({ pinHash: "h(salt1234)", salt: "salt", gameMode: true })
    );
  });
});
