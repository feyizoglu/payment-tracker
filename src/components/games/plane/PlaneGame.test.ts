import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { PlaneState } from "@/lib/paper-plane";

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
// Lets a test end the flight with a chosen score instead of flying through real gaps.
const engine = vi.hoisted(() => ({ endWith: null as null | ((s: PlaneState) => PlaneState) }));

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsx: host.wrap(actual.jsx), jsxs: host.wrap(actual.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsxDEV: host.wrap(actual.jsxDEV) };
});
vi.mock("@/lib/paper-plane", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paper-plane")>();
  return {
    ...actual,
    stepPlane: (s: PlaneState, dt: number, rng: () => number) =>
      engine.endWith && s.phase === "flying" ? engine.endWith(s) : actual.stepPlane(s, dt, rng),
  };
});

import { LanguageProvider } from "@/lib/i18n";
import PlaneGame from "@/components/games/plane/PlaneGame";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot: (container: unknown) => Root;
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const frames: ((now: number) => void)[] = [];
let now = 0;
const store = new Map<string, string>();
const listeners = new Map<string, (e?: unknown) => void>();

function container() {
  const noop = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...noop }, ...noop };
}

beforeEach(() => {
  frames.length = 0;
  now = 0;
  store.clear();
  listeners.clear();
  host.nodes.length = 0;
  engine.endWith = null;
  const on = (type: string, fn: (e?: unknown) => void) => listeners.set(type, fn);
  vi.stubGlobal("window", { HTMLIFrameElement: class {}, addEventListener: on, removeEventListener: () => undefined });
  vi.stubGlobal("document", {
    addEventListener: on,
    removeEventListener: () => undefined,
    hidden: false,
    documentElement: { classList: { contains: () => false } },
  });
  vi.stubGlobal("requestAnimationFrame", (fn: (t: number) => void) => frames.push(fn));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount() {
  root = createRoot(container());
  await act(async () => root?.render(createElement(LanguageProvider, { initialLang: "en" }, createElement(PlaneGame))));
}
async function frame(ms = 16) {
  now += ms;
  await act(async () => frames.splice(0, frames.length).forEach((fn) => fn(now)));
}
const area = () => host.nodes.findLast((n) => n.type === "div" && typeof n.props.onPointerDown === "function")!;
async function tap() {
  await act(async () => (area().props.onPointerDown as (e: unknown) => void)({ preventDefault() {} }));
}
function lastRender() {
  const i = host.nodes.findLastIndex((n) => n.type === "div" && typeof n.props.onPointerDown === "function");
  return host.nodes.slice(i);
}
const text = () =>
  lastRender()
    .filter((n) => n.type === "p")
    .map((n) => String(n.props.children))
    .join(" | ");
const again = () => lastRender().find((n) => n.type === "button")!;

describe("PlaneGame", () => {
  it("shows the best score and starts on a tap", async () => {
    store.set("paper-plane-best", "7");
    await mount();
    expect(text()).toContain("Best: 7");
    expect(text()).toContain("Tap to start");
    await tap();
    await frame();
    expect(text()).not.toContain("Tap to start");
    expect(text()).toBe("0");
  });

  it("flaps on Space, and pauses when the tab is hidden until a tap", async () => {
    await mount();
    await act(async () => listeners.get("keydown")!({ code: "Space", repeat: false, preventDefault() {} }));
    expect(text()).toBe("0");
    (document as { hidden: boolean }).hidden = true;
    await act(async () => listeners.get("visibilitychange")!());
    expect(text()).toContain("Tap to continue");
    await tap();
    expect(text()).toBe("0");
  });

  it("ends when the plane falls, and keeps the best score that was not beaten", async () => {
    store.set("paper-plane-best", "4");
    await mount();
    await tap();
    for (let i = 0; i < 200 && !text().includes("Score"); i++) await frame(33);
    expect(text()).toContain("Score");
    expect(text()).toContain("Best: 4");
    expect(store.get("paper-plane-best")).toBe("4");
  });

  it("saves a new best, and guards Again for 500 ms", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    store.set("paper-plane-best", "2");
    await mount();
    await tap();
    engine.endWith = (s) => ({ ...s, phase: "over", score: 3 });
    await frame();
    expect(text()).toContain("New best!");
    expect(store.get("paper-plane-best")).toBe("3");
    expect(again().props.disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(500));
    expect(again().props.disabled).toBe(false);
    engine.endWith = null;
    await act(async () => (again().props.onClick as () => void)());
    expect(text()).toContain("Tap to start");
    expect(text()).toContain("Best: 3");
  });

  it("reads a wrong saved best as 0", async () => {
    store.set("paper-plane-best", "x");
    await mount();
    expect(text()).toContain("Best: 0");
  });
});
