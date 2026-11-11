import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";

interface BankGroupProps {
  bankName: string;
  onEdit: (asset: { id: string }) => void;
  onAdd: (bankName: string) => void;
}

const state = vi.hoisted(() => ({
  pressables: [] as { label: string; onPress: () => void }[],
  groups: [] as unknown[],
  gateRenders: 0,
}));

vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: { push: vi.fn() },
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
  };
});
vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  const label = (node: unknown): string => {
    if (Array.isArray(node)) return node.map(label).join("");
    if (typeof node === "string") return node;
    if (!node || typeof node !== "object" || !("props" in node)) return "";
    return label((node as { props: { children?: unknown } }).props.children);
  };
  return {
    ActivityIndicator: () => null,
    Pressable: ({ children, onPress }: { children?: unknown; onPress: () => void }) => {
      state.pressables.push({ label: label(children), onPress });
      return null;
    },
    RefreshControl: () => null,
    ScrollView: pass,
    Text: () => null,
    View: pass,
  };
});
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, k) => String(k) }) }),
}));
vi.mock("@/components/bank-group", () => ({
  BankGroup: (props: unknown) => {
    state.groups.push(props);
    return null;
  },
}));
vi.mock("@/components/lock/economy-gate", async () => {
  const { Fragment, createElement: h } = await import("react");
  return {
    EconomyGate: ({ children }: { children?: unknown }) => {
      state.gateRenders++;
      return h(Fragment, null, children as never);
    },
  };
});
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));
vi.mock("@/components/tab-screen", async () => {
  const { Fragment, createElement: h } = await import("react");
  return { TabScreen: ({ children }: { children?: unknown }) => h(Fragment, null, children as never) };
});
vi.mock("@/lib/auth-context", () => {
  const assets = [{ id: "a1", user_id: "u1", team_id: null, bank_name: "Bank", currency: "USD", amount: 5, created_at: "" }];
  const api = { get: async (path: string) => (path === "/api/assets" ? assets : []) };
  return { useAuth: () => ({ api, user: { id: "u1" } }) };
});
vi.mock("@/lib/economy-storage", () => ({
  getCachedRates: async () => null,
  getPreferredCurrency: async () => null,
  setCachedRates: async () => undefined,
  setPreferredCurrency: async () => undefined,
}));

import { router } from "expo-router";
import Economy from "@/app/(app)/economy";

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

async function mount() {
  root = createRoot(container());
  await act(async () => root?.render(createElement(Economy)));
  await vi.waitFor(() => expect(state.groups.length).toBeGreaterThan(0));
}

function press(label: string) {
  const found = state.pressables.findLast((p) => p.label.includes(label));
  if (!found) throw new Error(`no pressable labelled ${label}`);
  found.onPress();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.pressables = [];
  state.groups = [];
  state.gateRenders = 0;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("Economy modal routes", () => {
  it("renders inside the Economy PIN gate", async () => {
    await mount();
    expect(state.gateRenders).toBeGreaterThan(0);
  });

  it("opens the asset form from the + button", async () => {
    await mount();
    press("+");
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/asset-form");
  });

  it("opens the manual gold entry", async () => {
    await mount();
    press("enterGoldManually");
    expect(router.push).toHaveBeenCalledWith("/manual-gold");
  });

  it("opens an asset and the add form for a bank from its group", async () => {
    await mount();
    const group = state.groups.at(-1) as BankGroupProps;
    expect(group.bankName).toBe("Bank");
    group.onEdit({ id: "a1" });
    expect(router.push).toHaveBeenCalledWith({ pathname: "/asset/[id]", params: { id: "a1" } });
    group.onAdd("Bank");
    expect(router.push).toHaveBeenCalledWith({ pathname: "/asset-form", params: { bankName: "Bank" } });
  });
});
