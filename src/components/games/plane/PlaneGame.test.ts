import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { PLANE_COLORS, type PlaneState } from "@/lib/paper-plane";

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
const observed: { fn: (() => void) | null; options: unknown; disconnected: boolean } = { fn: null, options: null, disconnected: false };

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
  host.attach.canvas = null;
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
  observed.fn = null;
  observed.disconnected = false;
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(fn: () => void) {
        observed.fn = fn;
      }
      observe(_target: unknown, options: unknown) {
        observed.options = options;
      }
      disconnect() {
        observed.disconnected = true;
      }
    }
  );
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
async function tap(button = 0) {
  await act(async () => (area().props.onPointerDown as (e: unknown) => void)({ button, preventDefault() {} }));
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
function fakeCanvas() {
  const calls: { name: string; args: unknown[] }[] = [];
  const state: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(state, {
    get: (t, k) => (k in t ? t[k] : (...args: unknown[]) => calls.push({ name: String(k), args })),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
  return { canvas: { clientWidth: 300, clientHeight: 600, width: 0, height: 0, getContext: () => ctx }, calls };
}

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

  it("ignores a right or middle click", async () => {
    await mount();
    await tap(2);
    await tap(1);
    expect(text()).toContain("Tap to start");
    await tap();
    expect(lastRender().some((n) => n.type === "p" && n.props.children === 0)).toBe(true);
  });

  it("plays again on Space after a crash, once the guard is off", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await mount();
    await tap();
    engine.endWith = (s) => ({ ...s, phase: "over", score: 1 });
    await frame();
    engine.endWith = null;
    const space = () => act(async () => listeners.get("keydown")!({ code: "Space", repeat: false, preventDefault() {} }));
    await space();
    expect(again()).toBeDefined();
    await act(async () => vi.advanceTimersByTime(500));
    await space();
    expect(text()).toContain("Tap to start");
  });

  it("reads a wrong saved best as 0", async () => {
    store.set("paper-plane-best", "x");
    await mount();
    expect(text()).toContain("Best: 0");
  });
  it("starts with a best of 0 when the browser refuses to read storage", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
    });
    await mount();
    expect(text()).toContain("Best: 0");
    await tap();
    await frame();
    expect(text()).toBe("0");
  });

  it("claims no new best and saves nothing when the browser refuses to read storage", async () => {
    let wrote = false;
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => (wrote = true),
    });
    await mount();
    await tap();
    engine.endWith = (s) => ({ ...s, phase: "over", score: 4 });
    await frame();
    expect(text()).not.toContain("New best!");
    expect(text()).toContain("Best: 4");
    expect(wrote).toBe(false);
  });

  it("keeps the session's best on the card when the browser refuses to read storage", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
    });
    await mount();
    await tap();
    engine.endWith = (s) => ({ ...s, phase: "over", score: 10 });
    await frame();
    await act(async () => vi.advanceTimersByTime(500));
    engine.endWith = null;
    await act(async () => (again().props.onClick as () => void)());
    await tap();
    engine.endWith = (s) => ({ ...s, phase: "over", score: 4 });
    await frame();
    expect(text()).toContain("Best: 10");
  });

  it("claims a new best against the best read at the start when the read at the end fails", async () => {
    let reads = 0;
    const written: string[] = [];
    vi.stubGlobal("localStorage", {
      getItem: () => {
        reads += 1;
        if (reads > 1) throw new Error("SecurityError");
        return "20";
      },
      setItem: (_k: string, v: string) => written.push(v),
    });
    await mount();
    await tap();
    engine.endWith = (s) => ({ ...s, phase: "over", score: 25 });
    await frame();
    expect(text()).toContain("New best!");
    expect(written).toEqual(["25"]);
  });

  it("does not claim a lower score after a best the browser could not save", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    await mount();
    await tap();
    engine.endWith = (s) => ({ ...s, phase: "over", score: 10 });
    await frame();
    expect(text()).toContain("New best!");
    await act(async () => vi.advanceTimersByTime(500));
    engine.endWith = null;
    await act(async () => (again().props.onClick as () => void)());
    await tap();
    engine.endWith = (s) => ({ ...s, phase: "over", score: 5 });
    await frame();
    expect(text()).not.toContain("New best!");
    expect(text()).toContain("Best: 10");
  });

  it("guards the game-over buttons from the card's first frame", async () => {
    await mount();
    await tap();
    const before = host.nodes.length;
    engine.endWith = (s) => ({ ...s, phase: "over", score: 1 });
    await frame();
    const firstCard = host.nodes.slice(before).find((n) => n.type === "button");
    expect(firstCard?.props.disabled).toBe(true);
  });

  it("still shows the new best and frees Again when the browser refuses to save", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    await mount();
    await tap();
    engine.endWith = (s) => ({ ...s, phase: "over", score: 3 });
    await frame();
    expect(text()).toContain("New best!");
    await act(async () => vi.advanceTimersByTime(500));
    expect(again().props.disabled).toBe(false);
  });

  it("sizes the canvas for the screen's pixel ratio", async () => {
    const { canvas, calls } = fakeCanvas();
    host.attach.canvas = canvas;
    (window as unknown as { devicePixelRatio: number }).devicePixelRatio = 2;
    await mount();
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(1200);
    expect(calls.find((c) => c.name === "setTransform")?.args).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it("fits a fresh game's world to the canvas", async () => {
    const { canvas, calls } = fakeCanvas();
    host.attach.canvas = canvas;
    await mount();
    expect(calls.filter((c) => c.name === "translate")[1]?.args[0]).toBeCloseTo(90);
  });

  it("refits a game not started yet when the window is resized, and keeps a game in play", async () => {
    const { canvas, calls } = fakeCanvas();
    host.attach.canvas = canvas;
    await mount();
    const planeAt = () => calls.filter((c) => c.name === "translate").at(-1)?.args[0];
    canvas.clientWidth = 480;
    await act(async () => listeners.get("resize")!());
    expect(planeAt()).toBeCloseTo(24 * 6);
    canvas.clientWidth = 300;
    await act(async () => listeners.get("resize")!());
    await tap();
    canvas.clientWidth = 480;
    await act(async () => listeners.get("resize")!());
    expect(planeAt()).toBeCloseTo(90 + 15 * 6);
  });

  it("leaves Space to a focused button or link", async () => {
    await mount();
    let prevented = false;
    const target = { closest: (sel: string) => (sel.includes("button") ? {} : null) };
    await act(async () => listeners.get("keydown")!({ code: "Space", repeat: false, target, preventDefault: () => (prevented = true) }));
    expect(prevented).toBe(false);
    expect(text()).toContain("Tap to start");
  });

  it("ignores a held Space on the ready page", async () => {
    await mount();
    await act(async () => listeners.get("keydown")!({ code: "Space", repeat: true, preventDefault() {} }));
    expect(text()).toContain("Tap to start");
  });

  it("ignores keys other than Space on the ready page", async () => {
    await mount();
    await act(async () => listeners.get("keydown")!({ code: "Enter", repeat: false, preventDefault() {} }));
    expect(text()).toContain("Tap to start");
  });

  it("pauses when the window loses focus", async () => {
    await mount();
    await tap();
    await act(async () => listeners.get("blur")!());
    expect(text()).toContain("Tap to continue");
  });

  it("writes its texts in the dark page's ink", async () => {
    (document as unknown as { documentElement: { classList: { contains: () => boolean } } }).documentElement.classList.contains = () => true;
    await mount();
    const ready = lastRender().find((n) => n.type === "div" && String(n.props.className).includes("flex-col"))!;
    expect((ready.props.style as { color: string }).color).toBe(PLANE_COLORS.dark.score);
    await tap();
    const score = lastRender().find((n) => n.type === "p")!;
    expect((score.props.style as { color: string }).color).toBe(PLANE_COLORS.dark.score);
  });

  it("follows a theme switch made while the page is open", async () => {
    const { canvas, calls } = fakeCanvas();
    host.attach.canvas = canvas;
    let dark = false;
    (document as unknown as { documentElement: { classList: { contains: () => boolean } } }).documentElement.classList.contains = () => dark;
    await mount();
    expect(observed.options).toEqual({ attributes: true, attributeFilter: ["class"] });
    const ink = () => (lastRender().find((n) => n.type === "div" && String(n.props.className).includes("flex-col"))!.props.style as { color: string }).color;
    expect(ink()).toBe(PLANE_COLORS.light.score);
    dark = true;
    calls.length = 0;
    await act(async () => observed.fn!());
    expect(ink()).toBe(PLANE_COLORS.dark.score);
    expect(calls.find((c) => c.name === "fillRect")).toBeDefined();
    await act(async () => root?.unmount());
    root = null;
    expect(observed.disconnected).toBe(true);
  });

  it("guards the Back link for 500 ms after the game ends", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await mount();
    await tap();
    engine.endWith = (s) => ({ ...s, phase: "over", score: 0 });
    await frame();
    const back = () => lastRender().find((n) => n.type === "a" && n.props.href === "/games")!;
    expect(back().props["aria-disabled"]).toBe(true);
    expect(String(back().props.className)).toContain("pointer-events-none");
    await act(async () => vi.advanceTimersByTime(500));
    expect(back().props["aria-disabled"]).toBe(false);
    expect(String(back().props.className)).not.toContain("pointer-events-none");
  });
});
