import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";

const host = vi.hoisted(() => {
  const nodes: Array<{ type: string; props: Record<string, unknown> }> = [];
  const keep = (c: unknown): unknown =>
    Array.isArray(c) ? c.map(keep) : typeof c === "string" || typeof c === "number" ? null : c;
  const Host = ({ __type, ...props }: { __type: string; children?: unknown }) => {
    nodes.push({ type: __type, props });
    return keep(props.children) ?? null;
  };
  const wrap =
    (fn: (...args: unknown[]) => unknown) =>
    (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) =>
      typeof type === "string" ? fn(Host, { ...props, __type: type }, ...rest) : fn(type, props, ...rest);
  return { nodes, wrap };
});

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsx: host.wrap(actual.jsx), jsxs: host.wrap(actual.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsxDEV: host.wrap(actual.jsxDEV) };
});
vi.mock("lucide-react", () => ({
  ChevronDown: () => null,
  ChevronUp: () => null,
  RefreshCw: () => null,
  Plus: () => null,
  Trash2: () => null,
  Pencil: () => null,
  Landmark: () => null,
  TrendingUp: () => null,
  Users: () => null,
  X: () => null,
  LogOut: () => null,
  KeyRound: () => null,
  CreditCard: () => null,
  Menu: () => null,
}));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", name: "Test", email: "t@example.com", image: null } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/PushToggle", () => ({ default: () => null }));
vi.mock("@/components/ThemePicker", () => ({ default: () => null }));
vi.mock("@/components/TeamPanel", () => ({ default: () => null }));

import { LanguageProvider } from "@/lib/i18n";
import EconomyPage from "./page";

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

const page = () => createElement(LanguageProvider, { initialLang: "en" }, createElement(EconomyPage));

async function rerender() {
  host.nodes.length = 0;
  await act(async () => root?.render(page()));
}

const latest = (match: (n: { type: string; props: Record<string, unknown> }) => boolean) =>
  host.nodes.filter(match).at(-1);
const sectionToggle = () => latest((n) => n.type === "button" && n.props["aria-controls"] === "app-nav-menu");
const userToggle = () =>
  latest((n) => n.type === "button" && String(n.props.className ?? "").includes("hover:text-gray-900"));
const userMenuShown = () =>
  host.nodes.some((n) => n.type === "div" && String(n.props.className ?? "").includes("w-56"));

beforeEach(() => {
  vi.stubGlobal("window", {
    HTMLIFrameElement: class {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => (url === "/api/exchange-rates" ? {} : []) })));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("EconomyPage header menus", () => {
  it("closes the user menu when the section menu opens", async () => {
    root = createRoot(container());
    await act(async () => root?.render(page()));

    await act(async () => (userToggle()?.props.onClick as () => void)());
    await rerender();
    expect(userMenuShown()).toBe(true);

    await act(async () => (sectionToggle()?.props.onClick as () => void)());
    await rerender();
    expect(userMenuShown()).toBe(false);
    expect(sectionToggle()?.props["aria-expanded"]).toBe(true);
  });

  it("closes the section menu when the user menu opens", async () => {
    root = createRoot(container());
    await act(async () => root?.render(page()));

    await act(async () => (sectionToggle()?.props.onClick as () => void)());
    await rerender();
    expect(sectionToggle()?.props["aria-expanded"]).toBe(true);

    await act(async () => (userToggle()?.props.onClick as () => void)());
    await rerender();
    expect(userMenuShown()).toBe(true);
    expect(sectionToggle()?.props["aria-expanded"]).toBe(false);
  });
});
