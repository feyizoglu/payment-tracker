import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { DEFAULT_SETUP, type ImposterSetup } from "@/lib/imposter";

const state = vi.hoisted(() => ({
  form: null as null | { value: unknown; onChange: (v: unknown) => void; onStart: () => void },
  passPhoneRenders: 0,
}));

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: "tr" }),
}));
vi.mock("./ImposterSetupForm", () => ({
  default: (props: { value: unknown; onChange: (v: unknown) => void; onStart: () => void }) => {
    state.form = props;
    return null;
  },
}));
vi.mock("./PassPhone", () => ({
  default: () => {
    state.passPhoneRenders++;
    return null;
  },
}));
vi.mock("./ImposterDiscuss", () => ({ default: () => null }));
vi.mock("./ImposterResult", () => ({ default: () => null }));

import ImposterGame from "./ImposterGame";

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

async function render() {
  root = createRoot(container());
  await act(async () => root?.render(createElement(ImposterGame)));
}

const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

beforeEach(() => {
  state.form = null;
  state.passPhoneRenders = 0;
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("loadSetup", () => {
  it("falls back to the default setup when storage cannot be read", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: vi.fn(),
    });
    await render();
    expect(state.form?.value).toEqual(DEFAULT_SETUP);
  });
});

describe("saveSetup", () => {
  it("starts the game when storage cannot be written", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("full");
      },
    });
    await render();
    await act(async () => state.form?.onChange(valid));
    await act(async () => state.form?.onStart());
    expect(state.passPhoneRenders).toBeGreaterThan(0);
  });
});
