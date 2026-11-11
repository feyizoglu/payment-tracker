import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement, type ReactElement } from "react";
import {
  CATEGORY_LABEL_KEYS,
  DEFAULT_SETUP,
  IMPOSTER_CATEGORIES,
  IMPOSTER_WORDS,
  type GameState,
  type ImposterSetup,
} from "@/lib/imposter";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const state = vi.hoisted(() => ({
  form: null as null | { value: unknown; onChange: (v: unknown) => void; onStart: () => void },
  passPhoneRenders: 0,
  pass: null as null | { name: string; revealed: boolean; onReveal: () => void; children?: unknown },
  discuss: null as null | { onFinish: () => void },
  result: null as null | { state: GameState; onEnd: () => void; onNextRound: () => void },
}));

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "imposterCategoryHint" ? "hint {category}" : String(key)),
    }),
    lang: "tr",
  }),
}));
vi.mock("./ImposterSetupForm", () => ({
  default: (props: { value: unknown; onChange: (v: unknown) => void; onStart: () => void }) => {
    state.form = props;
    return null;
  },
}));
vi.mock("./PassPhone", () => ({
  default: (props: { name: string; revealed: boolean; onReveal: () => void; children?: unknown }) => {
    state.passPhoneRenders++;
    state.pass = props;
    return null;
  },
}));
vi.mock("./ImposterDiscuss", () => ({
  default: (props: { onFinish: () => void }) => {
    state.discuss = props;
    return null;
  },
}));
vi.mock("./ImposterResult", () => ({
  default: (props: { state: GameState; onEnd: () => void; onNextRound: () => void }) => {
    state.result = props;
    return null;
  },
}));

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

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function buttons(): Node[] {
  return nodes(state.pass?.children).filter((n) => n.type === "button");
}

async function click(node: Node | undefined) {
  await act(async () => (node!.props.onClick as () => void)());
}

async function reveal() {
  await act(async () => state.pass!.onReveal());
}

async function start(setup: ImposterSetup) {
  await render();
  await act(async () => state.form?.onChange(setup));
  await act(async () => state.form?.onStart());
}

async function dealAll(count: number) {
  for (let i = 0; i < count; i++) {
    await reveal();
    await click(buttons().find((b) => text(b) === "imposterHideNext"));
  }
}

const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

beforeEach(() => {
  state.form = null;
  state.passPhoneRenders = 0;
  state.pass = null;
  state.discuss = null;
  state.result = null;
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

describe("ImposterGame rounds", () => {
  const category = IMPOSTER_CATEGORIES[0];
  const entry = IMPOSTER_WORDS[category][0].tr;

  beforeEach(() => {
    let clock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  });

  it("shows the imposter card with the category hint", async () => {
    await start(valid);
    await reveal();
    expect(state.pass?.name).toBe("Ann");
    const card = text(state.pass?.children);
    expect(card).toContain("imposterYouAre");
    expect(card).toContain(`hint ${CATEGORY_LABEL_KEYS[category]}`);
    expect(card).not.toContain(entry.word);
  });

  it("shows the pair word to an imposter who knows the role", async () => {
    await start({ ...valid, mode: "similar-word", imposterKnows: true });
    await reveal();
    const card = text(state.pass?.children);
    expect(card).toContain("imposterYouAre");
    expect(card).toContain(entry.pair);
  });

  it("shows the crew word to the next player after hide and next", async () => {
    await start(valid);
    await dealAll(1);
    expect(state.pass?.name).toBe("Bob");
    expect(state.pass?.revealed).toBe(false);
    await reveal();
    const card = text(state.pass?.children);
    expect(card).toContain(entry.word);
    expect(card).not.toContain("imposterYouAre");
  });

  it("offers every player except the voter and records each vote", async () => {
    await start({ ...valid, voting: true });
    await dealAll(3);
    await act(async () => state.discuss!.onFinish());
    await reveal();
    expect(state.pass?.name).toBe("Ann");
    expect(buttons().map(text)).toEqual(["Bob", "Cem"]);
    await click(buttons().find((b) => text(b) === "Bob"));
    expect(state.pass?.name).toBe("Bob");
    await reveal();
    expect(buttons().map(text)).toEqual(["Ann", "Cem"]);
    await click(buttons().find((b) => text(b) === "Ann"));
    await reveal();
    await click(buttons().find((b) => text(b) === "Ann"));
    expect(state.result?.state.votes).toEqual([1, 0, 0]);
  });

  it("returns to the setup form with the played setup on end", async () => {
    await start({ ...valid, players: [" Ann", "Bob ", "Cem"] });
    await dealAll(3);
    await act(async () => state.discuss!.onFinish());
    await act(async () => state.result!.onEnd());
    expect(state.form?.value).toEqual({ ...valid, players: ["Ann", "Bob", "Cem"] });
  });
});
