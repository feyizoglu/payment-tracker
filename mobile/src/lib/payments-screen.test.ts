import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";

const state = vi.hoisted(() => ({
  params: {} as { month?: string; tap?: string },
  header: null as null | {
    year: number;
    month: number;
    onNext: () => void;
    onToggleView: (v: string) => void;
  },
  calendar: null as null | { selectedDay: Date | null; onSelectDay: (d: Date) => void },
  auth: {
    api: { get: async () => [] as unknown[], patch: async () => undefined, put: async () => undefined },
    user: { id: "u1", email: "a@b.c", name: "A" },
  },
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
  return {
    router: { push: vi.fn() },
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
    useLocalSearchParams: () => state.params,
  };
});
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t: {} }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("@/components/tab-screen", async () => {
  const { Fragment, createElement: h } = await import("react");
  return { TabScreen: ({ children }: { children?: unknown }) => h(Fragment, null, children as never) };
});
vi.mock("@/components/month-header", () => ({
  MonthHeader: (props: NonNullable<typeof state.header>) => {
    state.header = props;
    return null;
  },
}));
vi.mock("@/components/month-list", () => ({ MonthList: () => null }));
vi.mock("@/components/payments-calendar", () => ({
  PaymentsCalendar: (props: NonNullable<typeof state.calendar>) => {
    state.calendar = props;
    return null;
  },
}));

import Payments from "@/app/(app)/index";

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
  await act(async () => root?.render(createElement(Payments)));
  await flush();
}

function header() {
  if (!state.header) throw new Error("MonthHeader not rendered");
  return state.header;
}

function calendar() {
  if (!state.calendar) throw new Error("PaymentsCalendar not rendered");
  return state.calendar;
}

async function browseAwayAndSelectDay() {
  await act(async () => header().onToggleView("calendar"));
  await act(async () => header().onNext());
  await act(async () => calendar().onSelectDay(new Date(2026, 3, 5)));
}

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.params = { month: "2026-03", tap: "n1" };
  state.header = null;
  state.calendar = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("Payments month/tap effect", () => {
  it("opens on the month a tapped reminder names", async () => {
    await render();
    expect({ year: header().year, month: header().month }).toEqual({ year: 2026, month: 2 });
  });

  it("moves the cursor back to the month on a second tap for the same month", async () => {
    await render();
    await browseAwayAndSelectDay();
    expect(header().month).toBe(3);
    state.params = { month: "2026-03", tap: "n2" };
    await render();
    expect({ year: header().year, month: header().month }).toEqual({ year: 2026, month: 2 });
  });

  it("clears the selected day on a second tap for the same month", async () => {
    await render();
    await browseAwayAndSelectDay();
    expect(calendar().selectedDay).not.toBeNull();
    state.params = { month: "2026-03", tap: "n2" };
    await render();
    expect(calendar().selectedDay).toBeNull();
  });

  it("leaves the browsed month alone when the params are unchanged", async () => {
    await render();
    await browseAwayAndSelectDay();
    state.params = { month: "2026-03", tap: "n1" };
    await render();
    expect(header().month).toBe(3);
  });
});
