import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement, useEffect } from "react";
import {
  DEFAULT_SETUP,
  NARRATOR_COLOR,
  SETUP_STORAGE_KEY,
  canPick,
  playerColor,
  type GameState,
  type WolfSetup,
} from "@/lib/wolf-game";

type Props = Record<string, unknown>;

const ui = vi.hoisted(() => ({
  screen: "",
  frameColor: undefined as string | undefined,
  turnMounts: 0,
  props: {} as Record<string, Props | undefined>,
}));
// A mocked screen records that it is showing and the props it got.
const screen = vi.hoisted(() => (name: string) => (props: Props) => {
  ui.screen = name;
  ui.props[name] = props;
  return null;
});

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));
vi.mock("../GameFrame", () => ({
  default: (props: { color?: string; children?: unknown }) => {
    ui.frameColor = props.color;
    ui.props.rules = undefined;
    return props.children;
  },
}));
vi.mock("../DealTurn", () => ({
  default: function DealTurn(props: Props) {
    useEffect(() => {
      ui.turnMounts++;
    }, []);
    return screen("turn")(props);
  },
}));
vi.mock("../PassPhone", () => ({
  default: (props: Props & { revealed: boolean; children?: unknown }) => {
    screen("pass")(props);
    return props.revealed ? props.children : null;
  },
}));
vi.mock("./WolfRulesButton", () => ({
  default: (props: Props) => {
    ui.props.rules = props;
    return null;
  },
}));
vi.mock("./WolfSetupWizard", () => ({ default: screen("form") }));
vi.mock("./WolfThisGame", () => ({ default: screen("thisGame") }));
vi.mock("./WolfCard", () => ({ default: () => null }));
vi.mock("./WolfChoose", () => ({ default: screen("choose") }));
vi.mock("./WolfRoster", () => ({ default: screen("roster") }));
vi.mock("./WolfNarrator", () => ({ default: screen("narrator") }));
vi.mock("./WolfRemoval", () => ({ default: screen("removal") }));
vi.mock("./WolfDay", () => ({ default: screen("day") }));
vi.mock("./WolfEnd", () => ({ default: screen("end") }));

import WolfGame from "./WolfGame";

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

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = (name: string) => ui.props[name] as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

async function render() {
  root = createRoot(container());
  await act(async () => root?.render(createElement(WolfGame)));
}

async function call(fn: () => void) {
  await act(async () => fn());
}

// Math.random is 0: the deal seats Ann seer, Bob doctor, Cem and Dan villagers, Eda wolf.
const valid: WolfSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem", "Dan", "Eda"] };

async function start(setup: WolfSetup = valid) {
  await render();
  await call(() => p("form").onChange(setup));
  await call(() => p("form").onStart());
}

async function dealAll(count: number) {
  for (let i = 0; i < count; i++) {
    await call(() => p("turn").onReveal());
    await call(() => p("turn").onNext());
  }
}

// The phone goes round once: every visitor holds the card and picks the first player allowed.
async function passNight() {
  for (let guard = 0; ui.screen === "turn" || ui.screen === "choose"; guard++) {
    if (guard > 30) throw new Error("the night did not end");
    if (ui.screen === "turn") {
      await call(() => p("turn").onReveal());
      await call(() => p("turn").onNext());
    } else {
      const s: GameState = p("choose").state;
      await call(() => p("choose").onPick(s.alive.findIndex((_, i) => canPick(s, i))));
      await call(() => p("choose").onNext());
    }
  }
}

beforeEach(() => {
  ui.screen = "";
  ui.frameColor = undefined;
  ui.turnMounts = 0;
  ui.props = {};
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  let clock = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WolfGame This game screen", () => {
  it("comes after the wizard, before any card is dealt", async () => {
    await start();
    expect(ui.screen).toBe("thisGame");
    expect(p("thisGame").setup).toEqual(valid);
    expect(p("thisGame").onClose).toBeUndefined();
    expect(p("turn")).toBeUndefined();
    await call(() => p("thisGame").onDeal());
    expect([ui.screen, p("turn").name]).toEqual(["turn", "Ann"]);
  });

  it("comes after Start with last settings", async () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(valid), setItem: vi.fn() });
    await render();
    expect(p("form").quickStart).toBe(true);
    await call(() => p("form").onStart());
    expect(ui.screen).toBe("thisGame");
  });

  it("comes again before the deal of Play again", async () => {
    await start();
    await call(() => p("thisGame").onDeal());
    await dealAll(5);
    await passNight();
    expect(ui.screen).toBe("removal");
    await call(() => p("removal").onContinue());
    await call(() => p("day").onVote());
    await call(() => p("day").onVoteOut(4));
    await call(() => p("removal").onContinue());
    expect([ui.screen, p("end").state.winner]).toEqual(["end", "village"]);
    await call(() => p("end").onPlayAgain());
    expect(ui.screen).toBe("thisGame");
    expect(p("thisGame").onDeal).toBeTypeOf("function");
  });

  it("goes back to the setup with the same settings", async () => {
    await start();
    await call(() => p("thisGame").onBack());
    expect([ui.screen, p("form").value]).toEqual(["form", valid]);
  });
});

describe("WolfGame turns", () => {
  it("deals each card on that player's colour, a fresh card for each player", async () => {
    await start();
    await call(() => p("thisGame").onDeal());
    expect(ui.frameColor).toBe(playerColor(0));
    const first = ui.turnMounts;
    await dealAll(1);
    expect([p("turn").name, ui.frameColor, ui.turnMounts]).toEqual(["Bob", playerColor(1), first + 1]);
  });

  it("opens the rules over a card without the Deal button and comes back to the same card", async () => {
    await start();
    await call(() => p("thisGame").onDeal());
    await dealAll(1);
    await call(() => p("rules").onClick());
    expect(ui.screen).toBe("thisGame");
    expect(p("thisGame").onDeal).toBeUndefined();
    await call(() => p("thisGame").onClose());
    expect([ui.screen, p("turn").name]).toEqual(["turn", "Bob"]);
  });

  it("goes on from a night card with Continue to the choice on the visitor's colour", async () => {
    await start();
    await call(() => p("thisGame").onDeal());
    await dealAll(5);
    expect([p("turn").nextLabel, ui.frameColor]).toEqual(["wolfContinue", playerColor(0)]);
    expect(p("rules")).toBeDefined();
    await call(() => p("turn").onReveal());
    await call(() => p("turn").onNext());
    expect([ui.screen, ui.frameColor]).toEqual(["choose", playerColor(0)]);
  });

  it("gives the narrator the phone and the roster after the last card", async () => {
    await start({ ...valid, night: "narrator" });
    await call(() => p("thisGame").onDeal());
    await dealAll(5);
    expect([ui.screen, ui.frameColor, p("pass").name]).toEqual(["pass", NARRATOR_COLOR, "wolfTheNarrator"]);
    expect(p("rules")).toBeDefined();
    await call(() => p("pass").onReveal());
    expect(ui.screen).toBe("roster");
    await call(() => p("roster").onStart());
    expect([ui.screen, ui.frameColor]).toEqual(["narrator", undefined]);
  });
});

describe("WolfGame storage", () => {
  it("saves the setup on screen when a game starts", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem });
    await start();
    expect(setItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY, JSON.stringify(valid));
  });

  it("starts from the defaults when storage cannot be read", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: vi.fn(),
    });
    await render();
    expect([p("form").value, p("form").quickStart]).toEqual([DEFAULT_SETUP, false]);
  });
});
