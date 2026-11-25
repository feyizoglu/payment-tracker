import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { HuntState } from "@/lib/bill-hunt";

const host = vi.hoisted(() => {
  const nodes: Array<{ type: string; props: Record<string, unknown> }> = [];
  const attach = { canvas: null as unknown };
  const keep = (c: unknown): unknown =>
    Array.isArray(c) ? c.map(keep) : typeof c === "string" || typeof c === "number" ? null : c;
  const Host = ({ __type, ...props }: { __type: string; children?: unknown; ref?: unknown }) => {
    if (__type === "canvas" && attach.canvas && props.ref && typeof props.ref === "object") (props.ref as { current: unknown }).current = attach.canvas;
    nodes.push({ type: __type, props });
    return keep(props.children) ?? null;
  };
  const wrap =
    (fn: (...args: unknown[]) => unknown) =>
    (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) =>
      typeof type === "string" ? fn(Host, { ...props, __type: type }, ...rest) : fn(type, props, ...rest);
  return { nodes, wrap, attach };
});
// Lets a test end the game instead of playing a whole one.
const engine = vi.hoisted(() => ({ endWith: null as null | ((s: HuntState) => HuntState) }));

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsx: host.wrap(actual.jsx), jsxs: host.wrap(actual.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsxDEV: host.wrap(actual.jsxDEV) };
});
vi.mock("@/lib/bill-hunt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bill-hunt")>();
  return {
    ...actual,
    stepHunt: (s: HuntState, dt: number, rng: () => number) =>
      engine.endWith && s.phase === "throwing" ? engine.endWith(s) : actual.stepHunt(s, dt, rng),
  };
});

import { LanguageProvider } from "@/lib/i18n";
import HuntGame from "@/components/games/bills/HuntGame";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as { createRoot: (container: unknown) => Root };
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const frames: ((now: number) => void)[] = [];
let now = 0;
const store = new Map<string, string>();
let calls: { name: string; args: unknown[] }[] = [];

function container() {
  const noop = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...noop }, ...noop };
}
function fakeCanvas() {
  const state: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(state, {
    get: (t, k) => (k in t ? t[k] : (...args: unknown[]) => calls.push({ name: String(k), args })),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
  return { clientWidth: 300, clientHeight: 600, width: 0, height: 0, getContext: () => ctx };
}

beforeEach(() => {
  frames.length = 0;
  now = 0;
  store.clear();
  calls = [];
  host.nodes.length = 0;
  host.attach.canvas = fakeCanvas();
  engine.endWith = null;
  vi.stubGlobal("window", { HTMLIFrameElement: class {}, addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("document", {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    documentElement: { classList: { contains: () => false } },
  });
  vi.stubGlobal("requestAnimationFrame", (fn: (t: number) => void) => frames.push(fn));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal("MutationObserver", class {
    observe() {}
    disconnect() {}
  });
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
  await act(async () => root?.render(createElement(LanguageProvider, { initialLang: "en" }, createElement(HuntGame))));
}
async function frame(ms = 16) {
  now += ms;
  await act(async () => frames.splice(0, frames.length).forEach((fn) => fn(now)));
}
const area = () => host.nodes.findLast((n) => n.type === "div" && typeof n.props.onPointerDown === "function")!;
function lastRender() {
  const i = host.nodes.findLastIndex((n) => n.type === "div" && typeof n.props.onPointerDown === "function");
  return host.nodes.slice(i);
}
const flat = (c: unknown): string => (Array.isArray(c) ? c.map(flat).join("") : typeof c === "string" || typeof c === "number" ? String(c) : "");
const text = () => lastRender().map((n) => flat(n.props.children)).filter(Boolean).join(" | ");
const button = (label: string) => lastRender().find((n) => n.type === "button" && flat(n.props.children).includes(label));
async function press(label: string) {
  const b = button(label);
  if (!b) throw new Error(`no button ${label} in ${text()}`);
  await act(async () => (b.props.onClick as () => void)());
}
const pointer = (x: number, y: number, over: Record<string, unknown> = {}) => ({
  button: 0, pointerId: 1, clientX: x, clientY: y, target: { closest: () => null }, currentTarget: { setPointerCapture: vi.fn() }, preventDefault() {}, ...over,
});
async function fire(name: string, e: unknown) {
  await act(async () => (area().props[name] as (e: unknown) => void)(e));
}
async function pullAndLet(dy: number, dx = 0) {
  await fire("onPointerDown", pointer(150, 300));
  await fire("onPointerMove", pointer(150 + dx, 300 + dy));
  await fire("onPointerUp", pointer(150 + dx, 300 + dy));
}

describe("HuntGame", () => {
  it("shows the best and starts on Start", async () => {
    store.set("bill-hunt-best", "7");
    await mount();
    expect(text()).toContain("Best: 7");
    await press("Start");
    expect(text()).toContain("Month 1");
    expect(text()).toContain("×1");
  });

  it("draws the aim line while pulling back, and throws when let go", async () => {
    await mount();
    await press("Start");
    await fire("onPointerDown", pointer(150, 300));
    calls = [];
    await fire("onPointerMove", pointer(150, 400));
    expect(calls.some((c) => c.name === "setLineDash")).toBe(true);
    await fire("onPointerUp", pointer(150, 400));
    expect(button("Speed up")).toBeTruthy();
    expect(button("Call back")).toBeTruthy();
    calls = [];
    await frame();
    expect(calls.some((c) => c.name === "arc")).toBe(true);
  });

  it("throws nothing for a short pull, a cancelled one, one pressed on a button, or before Start", async () => {
    await mount();
    await pullAndLet(100);
    expect(text()).toContain("Start");
    await press("Start");
    await pullAndLet(5);
    expect(button("Call back")).toBeUndefined();
    await fire("onPointerDown", pointer(150, 300));
    await fire("onPointerMove", pointer(150, 400));
    await fire("onPointerCancel", pointer(150, 400));
    await fire("onPointerUp", pointer(150, 400));
    expect(button("Call back")).toBeUndefined();
    await fire("onPointerDown", pointer(150, 300, { target: { closest: () => ({}) } }));
    await fire("onPointerUp", pointer(150, 400));
    expect(button("Call back")).toBeUndefined();
    await fire("onPointerDown", pointer(150, 300, { button: 2 }));
    await fire("onPointerUp", pointer(150, 400));
    expect(button("Call back")).toBeUndefined();
  });

  it("speeds a throw up once, and calls it back into the next month", async () => {
    await mount();
    await press("Start");
    await pullAndLet(100);
    await press("Speed up");
    expect(button("Speed up")!.props.disabled).toBe(true);
    await press("Call back");
    expect(text()).toContain("Month 2");
    expect(button("Call back")).toBeUndefined();
  });

  it("plays a throw to its end on its own", async () => {
    await mount();
    await press("Start");
    await pullAndLet(100);
    for (let i = 0; i < 400 && button("Call back"); i++) await frame(33);
    expect(text()).toContain("Month 2");
  });

  it("saves a new best when the game ends, guards Again for 500 ms, and starts a new game", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    store.set("bill-hunt-best", "2");
    await mount();
    await press("Start");
    await pullAndLet(100);
    engine.endWith = (s) => ({ ...s, phase: "over", score: 3, shot: null });
    await frame();
    expect(text()).toContain("Months lasted");
    expect(text()).toContain("New best!");
    expect(store.get("bill-hunt-best")).toBe("3");
    expect(button("Again")!.props.disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(500));
    expect(button("Again")!.props.disabled).toBe(false);
    engine.endWith = null;
    await press("Again");
    expect(text()).toContain("Month 1");
    expect(text()).not.toContain("New best!");
  });

  it("keeps the best that was not beaten", async () => {
    store.set("bill-hunt-best", "9");
    await mount();
    await press("Start");
    await pullAndLet(100);
    engine.endWith = (s) => ({ ...s, phase: "over", score: 3, shot: null });
    await frame();
    expect(text()).toContain("Best: 9");
    expect(store.get("bill-hunt-best")).toBe("9");
  });
});
