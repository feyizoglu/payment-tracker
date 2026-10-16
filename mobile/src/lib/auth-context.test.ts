import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";

const device = vi.hoisted(() => ({ isDevice: true }));

vi.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: { signOut: vi.fn(async () => undefined) },
}));
vi.mock("expo-device", () => ({
  get isDevice() {
    return device.isDevice;
  },
}));
vi.mock("./storage", () => ({
  getToken: vi.fn(),
  setToken: vi.fn(async () => undefined),
  clearToken: vi.fn(async () => undefined),
}));
vi.mock("./config", () => ({ getApiUrl: () => "https://api.test" }));
vi.mock("./auth", () => ({
  exchangeGoogleIdToken: vi.fn(),
  fetchProfile: vi.fn(),
}));
vi.mock("./widget-refresh", () => ({ refreshWidget: vi.fn() }));
vi.mock("./push-native", () => ({
  getNativePushToken: vi.fn(),
  nativePushDeps: vi.fn((post: unknown) => ({ post })),
}));
vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  registerForPush: vi.fn(),
}));

import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { AuthProvider, useAuth } from "./auth-context";
import { exchangeGoogleIdToken, fetchProfile } from "./auth";
import { registerForPush, type PushOutcome } from "./push";
import { getNativePushToken } from "./push-native";
import { clearToken, getToken } from "./storage";
import { refreshWidget } from "./widget-refresh";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot: (container: unknown) => Root;
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const USER = { id: "u1", email: "a@b.c", name: "A" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let ctx: ReturnType<typeof useAuth>;
let root: Root | null = null;
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

function Probe() {
  ctx = useAuth();
  return null;
}

function container() {
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...listeners }, ...listeners };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

async function mount() {
  root = createRoot(container());
  await act(async () => root?.render(createElement(AuthProvider, null, createElement(Probe))));
  await flush();
}

async function signOut() {
  await act(async () => ctx.signOut());
  await flush();
}

async function signIn(jwt: string) {
  vi.mocked(exchangeGoogleIdToken).mockResolvedValueOnce({ token: jwt, user: USER } as never);
  await act(async () => ctx.signInWithGoogleIdToken("google-id-token"));
  await flush();
}

function deletes() {
  return fetchMock.mock.calls
    .filter(([, init]) => init.method === "DELETE")
    .map(([url, init]) => ({
      url,
      body: JSON.parse(String(init.body)),
      auth: new Headers(init.headers).get("authorization"),
    }));
}

beforeEach(() => {
  vi.clearAllMocks();
  device.isDevice = true;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
  vi.mocked(getToken).mockResolvedValue("jwt-A");
  vi.mocked(fetchProfile).mockResolvedValue(USER as never);
  vi.mocked(getNativePushToken).mockResolvedValue("T-native");
  vi.mocked(registerForPush).mockResolvedValue({ kind: "denied" });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("AuthProvider push registration effect", () => {
  it("registers once for a restored session", async () => {
    await mount();
    expect(ctx.isAuthenticated).toBe(true);
    expect(registerForPush).toHaveBeenCalledTimes(1);
  });

  it("does not register without a session", async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    await mount();
    expect(registerForPush).not.toHaveBeenCalled();
  });

  it("warns instead of throwing when registration fails", async () => {
    const err = new Error("boom");
    vi.mocked(registerForPush).mockRejectedValue(err);
    await mount();
    expect(warn).toHaveBeenCalledWith("push registration failed", err);
  });

  it("waits for the previous sign-out's unregister before registering again", async () => {
    vi.mocked(registerForPush).mockResolvedValue({ kind: "registered", token: "T-A" });
    await mount();
    const gate = deferred<Response>();
    fetchMock.mockImplementationOnce(() => gate.promise);
    await signOut();
    await signIn("jwt-B");
    expect(registerForPush).toHaveBeenCalledTimes(1);

    gate.resolve(new Response(null, { status: 204 }));
    await flush();
    expect(registerForPush).toHaveBeenCalledTimes(2);
  });

  it("skips registration when the user signed out while it waited", async () => {
    vi.mocked(registerForPush).mockResolvedValue({ kind: "registered", token: "T-A" });
    await mount();
    const gate = deferred<Response>();
    fetchMock.mockImplementationOnce(() => gate.promise);
    await signOut();
    await signIn("jwt-B");
    await signOut();

    gate.resolve(new Response(null, { status: 204 }));
    await flush();
    expect(registerForPush).toHaveBeenCalledTimes(1);
  });

  it("re-registers only after a late registration's own unregister has gone out", async () => {
    const late = deferred<PushOutcome>();
    vi.mocked(registerForPush).mockReturnValueOnce(late.promise);
    await mount();
    await signOut();
    await signIn("jwt-A2");
    expect(registerForPush).toHaveBeenCalledTimes(1);

    late.resolve({ kind: "registered", token: "T-late" });
    await flush();
    const lateDelete = fetchMock.mock.calls.findIndex(
      ([, init]) => init.method === "DELETE" && String(init.body).includes("T-late")
    );
    expect(lateDelete).toBeGreaterThanOrEqual(0);
    expect(registerForPush).toHaveBeenCalledTimes(2);
    expect(vi.mocked(registerForPush).mock.invocationCallOrder[1]).toBeGreaterThan(
      fetchMock.mock.invocationCallOrder[lateDelete]
    );
  });

  it("unregisters a registration that lands after sign-out and does not keep its token", async () => {
    const late = deferred<PushOutcome>();
    vi.mocked(registerForPush).mockReturnValueOnce(late.promise);
    await mount();
    await signOut();
    late.resolve({ kind: "registered", token: "T-late" });
    await flush();
    expect(deletes()).toContainEqual({
      url: "https://api.test/api/devices",
      body: { expo_push_token: "T-late" },
      auth: "Bearer jwt-A",
    });

    fetchMock.mockClear();
    await signIn("jwt-B");
    await signOut();
    expect(deletes()).toEqual([
      { url: "https://api.test/api/devices", body: { expo_push_token: "T-native" }, auth: "Bearer jwt-B" },
    ]);
  });
});

describe("signOut push unregister", () => {
  it("redraws the home screen widget after the session is cleared", async () => {
    await mount();
    await signOut();
    expect(clearToken).toHaveBeenCalled();
    expect(refreshWidget).toHaveBeenCalledTimes(1);
    expect(vi.mocked(refreshWidget).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(clearToken).mock.invocationCallOrder[0]
    );
  });

  it("DELETEs the registered token with the JWT held at sign-out", async () => {
    vi.mocked(registerForPush).mockResolvedValue({ kind: "registered", token: "T-reg" });
    await mount();
    await signOut();
    expect(deletes()).toEqual([
      { url: "https://api.test/api/devices", body: { expo_push_token: "T-reg" }, auth: "Bearer jwt-A" },
    ]);
    expect(getNativePushToken).not.toHaveBeenCalled();
  });

  it("asks the device for its token when this session never registered", async () => {
    await mount();
    await signOut();
    expect(deletes()).toEqual([
      { url: "https://api.test/api/devices", body: { expo_push_token: "T-native" }, auth: "Bearer jwt-A" },
    ]);
  });

  it("sends nothing when there is no push token", async () => {
    device.isDevice = false;
    await mount();
    await signOut();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when there is no JWT", async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    await mount();
    await signOut();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getNativePushToken).not.toHaveBeenCalled();
  });

  it("clears the session first, then swallows a 401 from the DELETE without signing out again", async () => {
    vi.mocked(registerForPush).mockResolvedValue({ kind: "registered", token: "T-reg" });
    await mount();
    let clearedBeforeDelete = false;
    fetchMock.mockImplementation(async () => {
      clearedBeforeDelete = vi.mocked(clearToken).mock.calls.length > 0;
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    });

    await act(async () => {
      await expect(ctx.signOut()).resolves.toBeUndefined();
    });
    await flush();

    expect(clearedBeforeDelete).toBe(true);
    expect(ctx.isAuthenticated).toBe(false);
    expect(ctx.user).toBeNull();
    expect(warn).toHaveBeenCalledWith("push unregister failed", expect.objectContaining({ status: 401 }));
    expect(GoogleSignin.signOut).toHaveBeenCalledTimes(1);
    expect(clearToken).toHaveBeenCalledTimes(1);
  });
});
