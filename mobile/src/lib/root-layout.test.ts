import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";

const state = vi.hoisted(() => ({
  ready: true,
  isAuthenticated: true,
  response: null as unknown,
}));

vi.mock("expo-router", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return {
    router: { navigate: vi.fn() },
    Stack: Object.assign(pass, { Protected: () => null, Screen: () => null }),
    ThemeProvider: pass,
    DarkTheme: {},
    DefaultTheme: {},
  };
});
vi.mock("expo-notifications", () => ({ useLastNotificationResponse: () => state.response }));
vi.mock("expo-splash-screen", () => ({ preventAutoHideAsync: vi.fn(async () => undefined) }));
vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  return {
    View: ({ children }: { children?: unknown }) => h(Fragment, null, children as never),
    ActivityIndicator: () => null,
    useColorScheme: () => "light",
  };
});
vi.mock("@ptracker/shared/i18n", async () => {
  const { Fragment, createElement: h } = await import("react");
  return { LanguageProvider: ({ children }: { children?: unknown }) => h(Fragment, null, children as never) };
});
vi.mock("@/components/animated-icon", () => ({ AnimatedSplashOverlay: () => null }));
vi.mock("@/lib/auth-context", async () => {
  const { Fragment, createElement: h } = await import("react");
  return {
    AuthProvider: ({ children }: { children?: unknown }) => h(Fragment, null, children as never),
    useAuth: () => ({ ready: state.ready, isAuthenticated: state.isAuthenticated }),
  };
});
vi.mock("@/lib/language-storage", () => ({
  getStoredLanguage: vi.fn(async () => "tr"),
  setStoredLanguage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/theme-storage", () => ({
  getStoredTheme: vi.fn(async () => "dark"),
  applyTheme: vi.fn(),
}));

import { router } from "expo-router";
import RootLayout from "@/app/_layout";
import { applyTheme } from "@/lib/theme-storage";

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

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

async function render() {
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(RootLayout)));
  await flush();
}

function tap(identifier: string, data: Record<string, unknown>) {
  return { notification: { request: { identifier, content: { data } } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.ready = true;
  state.isAuthenticated = true;
  state.response = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("RootNavigator notification deep link", () => {
  it("opens the tapped reminder's month with the tap id", async () => {
    state.response = tap("n1", { month: "2026-03" });
    await render();
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith({ pathname: "/", params: { month: "2026-03", tap: "n1" } });
  });

  it("opens the Payments tab without params when the data carries no valid month", async () => {
    state.response = tap("n1", { month: "2026-13" });
    await render();
    expect(router.navigate).toHaveBeenCalledWith("/");
  });

  it("does not navigate while auth is not ready", async () => {
    state.ready = false;
    state.response = tap("n1", { month: "2026-03" });
    await render();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("does not navigate while signed out", async () => {
    state.isAuthenticated = false;
    state.response = tap("n1", { month: "2026-03" });
    await render();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("navigates once auth becomes ready and authenticated", async () => {
    state.ready = false;
    state.response = tap("n1", { month: "2026-03" });
    await render();
    state.ready = true;
    await render();
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });
});

describe("RootNavigator handledTapRef", () => {
  it("does not replay the same tap after a sign-out and sign-in", async () => {
    state.response = tap("n1", { month: "2026-03" });
    await render();
    state.isAuthenticated = false;
    await render();
    state.isAuthenticated = true;
    await render();
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it("does not navigate again when the hook returns a new object for the same identifier", async () => {
    state.response = tap("n1", { month: "2026-03" });
    await render();
    state.response = tap("n1", { month: "2026-03" });
    await render();
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it("navigates again for a new identifier, carrying that identifier as tap", async () => {
    state.response = tap("n1", { month: "2026-03" });
    await render();
    state.response = tap("n2", { month: "2026-03" });
    await render();
    expect(router.navigate).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenLastCalledWith({ pathname: "/", params: { month: "2026-03", tap: "n2" } });
  });
});

describe("RootLayout theme", () => {
  it("applies the saved theme before the app renders", async () => {
    await render();
    expect(applyTheme).toHaveBeenCalledWith("dark");
  });
});
