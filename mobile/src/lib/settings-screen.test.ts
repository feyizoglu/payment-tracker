import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";

const state = vi.hoisted(() => ({
  toggles: [] as Array<{ value: string; options: Array<{ value: string }>; onChange: (v: string) => void }>,
  auth: {
    api: { get: async () => [] as unknown[], patch: async () => undefined, post: async () => undefined },
    user: { id: "u1", email: "a@b.c", name: "A" },
    signOut: () => undefined,
  },
}));
const theme = vi.hoisted(() => ({
  applyTheme: vi.fn(),
  getStoredTheme: vi.fn(),
  setStoredTheme: vi.fn(),
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return {
    ActivityIndicator: () => null,
    Pressable: pass,
    RefreshControl: () => null,
    ScrollView: pass,
    Text: () => null,
    View: pass,
  };
});
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]) };
});
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t: {}, lang: "en", setLang: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/theme-storage", () => theme);
vi.mock("@/components/tab-screen", async () => {
  const { Fragment, createElement: h } = await import("react");
  return { TabScreen: ({ children }: { children?: unknown }) => h(Fragment, null, children as never) };
});
vi.mock("@/components/ui/segmented-toggle", () => ({
  SegmentedToggle: (props: (typeof state.toggles)[number]) => {
    state.toggles.push(props);
    return null;
  },
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/ui/text-field", () => ({ TextField: () => null }));

import Settings from "@/app/(app)/settings";

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
  root = createRoot(container());
  await act(async () => root?.render(createElement(Settings)));
  await flush();
}

function themeToggle() {
  const toggle = state.toggles.findLast((p) => p.options.some((o) => o.value === "dark"));
  if (!toggle) throw new Error("theme toggle not rendered");
  return toggle;
}

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.toggles = [];
  theme.applyTheme.mockReset();
  theme.setStoredTheme.mockReset().mockResolvedValue(undefined);
  theme.getStoredTheme.mockReset().mockResolvedValue("system");
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("Settings theme", () => {
  it("shows the stored theme after mount", async () => {
    theme.getStoredTheme.mockResolvedValue("dark");

    await render();

    expect(themeToggle().value).toBe("dark");
  });

  it("applies and stores dark when it is chosen", async () => {
    await render();

    await act(async () => themeToggle().onChange("dark"));

    expect(theme.applyTheme).toHaveBeenCalledWith("dark");
    expect(theme.setStoredTheme).toHaveBeenCalledWith("dark");
    expect(themeToggle().value).toBe("dark");
  });
});
