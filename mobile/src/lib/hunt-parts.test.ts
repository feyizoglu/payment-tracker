import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useMemo: (fn: () => unknown) => fn() };
});
vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("react-native-reanimated", () => ({
  default: { View: () => null },
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
}));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ptracker/shared/i18n")>();
  return { ...actual, useLang: () => ({ t: actual.translationsFor("en"), lang: "en" }) };
});
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));

import { Pressable, Text, View } from "react-native";
import { COIN_CAP, COIN_R, HUNT_COLORS, HUNT_H, huntBillShade, type HuntItem, type HuntState } from "@ptracker/shared/bill-hunt";
import { AIM_DOTS, HuntSprites, HuntWorld, useHuntView } from "@/components/games/bills/hunt-world";
import { HuntOverlay } from "@/components/games/bills/hunt-overlay";
import { PrimaryButton } from "@/components/ui/primary-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;
type Style = Record<string, unknown>;

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}
const styleOf = (n: Node): Style => {
  const s = n.props.style;
  return (Array.isArray(s) ? Object.assign({}, ...s) : s) as Style;
};
type Render = (p: Props) => unknown;
/** Renders a child component element (Cell, Coin, AimDot, or the memoised sprite layer) one level down. */
const expand = (n: Node) => nodes((typeof n.type === "function" ? (n.type as Render) : (n.type as unknown as { type: Render }).type)(n.props));

const item = (over: Partial<HuntItem>): HuntItem => ({ id: 1, kind: "bill", col: 0, row: 0, value: 3, double: false, used: false, ...over });
const state = (over: Partial<HuntState>): HuntState => ({
  phase: "aiming", month: 5, score: 4, coins: 3, launcher: 35, items: [], nextId: 10, shot: null, version: 0, ...over,
});

describe("useHuntView", () => {
  it("copies every coin of the throw, parks the empty slots, and sets or parks the aim", () => {
    const view = useHuntView();
    const coins = [0, 1].map((i) => ({ x: 10 + i, y: 20 + i, vx: 0, vy: 0, down: false, cell: -1 }));
    view.sync(state({ phase: "throwing", shot: { coins, total: 2, fired: 2, t: 1, acc: 0, speed: 1, firstDown: null, gained: 0, angle: 1 } }), null);
    expect(view.coins.value).toHaveLength(COIN_CAP * 2);
    expect(view.coins.value.slice(0, 4)).toEqual([10, 20, 11, 21]);
    expect(view.coins.value.slice(4).every((v) => v === -1000)).toBe(true);
    expect(view.aim.value).toEqual([-1000, -1000, -1000, -1000]);
    view.sync(state({ launcher: 30 }), { x: 12, y: 3 });
    expect(view.aim.value).toEqual([30, HUNT_H - COIN_R, 12, 3]);
    expect(view.coins.value.every((v) => v === -1000)).toBe(true);
  });

  it("leaves the shared values alone when nothing in them changed", () => {
    const view = useHuntView();
    const coins = view.coins.value;
    const aim = view.aim.value;
    view.sync(state({}), null);
    expect(view.coins.value).toBe(coins);
    expect(view.aim.value).toBe(aim);
    view.sync(state({}), { x: 1, y: 2 });
    const aimed = view.aim.value;
    view.sync(state({}), { x: 1, y: 2 });
    expect(view.aim.value).toBe(aimed);
  });
});

describe("HuntWorld", () => {
  const world = (over: Partial<Parameters<typeof HuntWorld>[0]> = {}) =>
    nodes(HuntWorld({ view: useHuntView(), items: [], month: 5, launcher: 35, phase: "aiming", width: 300, height: 600, dark: true, ...over }));

  const sprites = (all: Node[]) => expand(all.find((n) => n.type === HuntSprites)!);

  it("paints the page in the theme's colour and keeps a slot for every possible coin and aim dot", () => {
    const all = world();
    expect(all[0].type).toBe(View);
    expect(styleOf(all[0]).backgroundColor).toBe(HUNT_COLORS.dark.bg);
    expect(sprites(all).filter((n) => "slot" in n.props)).toHaveLength(COIN_CAP);
    expect(sprites(all).filter((n) => "dot" in n.props)).toHaveLength(AIM_DOTS);
  });

  it("gives the sprite layer only props that stay the same while the board changes", () => {
    const view = useHuntView();
    const layer = (items: HuntItem[]) => world({ view, items }).find((n) => n.type === HuntSprites)!.props;
    expect(layer([item({ value: 3 })])).toEqual(layer([item({ value: 2 })]));
  });

  it("shows each bill's amount on its shade, edges a double bill, and the other items' symbols", () => {
    const items = [item({ value: 3 }), item({ id: 2, col: 2, value: 12, double: true }), item({ id: 3, col: 4, kind: "deflect", value: 0, used: true })];
    const cells = world({ items }).filter((n) => "item" in n.props).map(expand);
    expect(cells).toHaveLength(3);
    expect(styleOf(cells[0][0]).backgroundColor).toBe(huntBillShade(3, 5));
    expect(styleOf(cells[0][0]).borderWidth).toBe(0);
    expect(cells[0].find((n) => n.type === Text)!.props.children).toBe(3);
    expect(styleOf(cells[1][0]).borderWidth).toBeGreaterThan(0);
    expect(styleOf(cells[2][0]).backgroundColor).toBe(HUNT_COLORS.dark.powerUsed);
    expect(cells[2].find((n) => n.type === Text)!.props.children).toBe("🔀");
  });

  it("shows the waiting coin at the launcher only while aiming", () => {
    const waiting = (phase: HuntState["phase"]) =>
      world({ phase }).filter((n) => n.type === View && styleOf(n).backgroundColor === HUNT_COLORS.dark.coin);
    expect(waiting("aiming")).toHaveLength(1);
    expect(waiting("throwing")).toHaveLength(0);
  });

  it("moves a coin slot and the aim dots with the shared values", () => {
    const view = useHuntView();
    view.sync(state({ phase: "throwing", shot: { coins: [{ x: 10, y: 20, vx: 0, vy: 0, down: false, cell: -1 }], total: 1, fired: 1, t: 1, acc: 0, speed: 1, firstDown: null, gained: 0, angle: 1 } }), null);
    const all = sprites(nodes(HuntWorld({ view, items: [], month: 1, launcher: 35, phase: "throwing", width: 350, height: 1000, dark: false })));
    const coin = expand(all.find((n) => n.props.slot === 0)!)[0];
    expect(styleOf(coin)).toMatchObject({ left: (10 - COIN_R) * 5, top: (20 - COIN_R) * 5 });
    view.sync(state({ launcher: 30 }), { x: 30, y: 0 });
    const dot = expand(all.find((n) => n.props.dot === AIM_DOTS - 1)!)[0];
    expect(styleOf(dot)).toMatchObject({ left: 30 * 5 - 1.5, top: -1.5 });
  });
});

describe("HuntOverlay", () => {
  const base = {
    month: 3, coins: 7, score: 6, sped: false, best: 4, newBest: false, guard: false, ink: "#123456",
    onStart: vi.fn(), onSpeedUp: vi.fn(), onCallBack: vi.fn(), onAgain: vi.fn(), onBack: vi.fn(),
  };
  const render = (over: Partial<Parameters<typeof HuntOverlay>[0]> & { phase: Parameters<typeof HuntOverlay>[0]["phase"] }) =>
    nodes(HuntOverlay({ ...base, ...over }));
  const words = (all: Node[]) => all.filter((n) => n.type === Text).map((n) => [n.props.children].flat().join(""));

  it("offers Start with the best and the hint before the game", () => {
    const all = render({ phase: "ready" });
    expect(words(all)).toEqual(expect.arrayContaining(["Best: 4", "Pull back to aim, let go to throw."]));
    const start = all.find((n) => n.type === PrimaryButton)!;
    expect(start.props.label).toBe("Start");
    (start.props.onPress as () => void)();
    expect(base.onStart).toHaveBeenCalled();
    expect(words(render({ phase: "ready", best: null }))[0]).toBe(" ");
  });

  it("shows the month and the coins while aiming, and the throw buttons only while throwing", () => {
    expect(words(render({ phase: "aiming" }))).toEqual(["Month 3", "×7"]);
    expect(render({ phase: "aiming" }).some((n) => n.type === Pressable)).toBe(false);
    const throwing = render({ phase: "throwing", sped: true });
    const [fast, back] = throwing.filter((n) => n.type === Pressable);
    expect(fast.props.disabled).toBe(true);
    (back.props.onPress as () => void)();
    expect(base.onCallBack).toHaveBeenCalled();
    expect(words(throwing)).toEqual(expect.arrayContaining(["⏩ Speed up", "Call back"]));
  });

  it("shows the months lasted and a new best on the score card, with guarded buttons", () => {
    const all = render({ phase: "over", newBest: true, guard: true });
    expect(words(all)).toEqual(expect.arrayContaining(["Months lasted", "6", "New best!"]));
    expect(all.find((n) => n.type === PrimaryButton)!.props).toMatchObject({ label: "Again", disabled: true });
    expect(all.filter((n) => n.type === Pressable).at(-1)!.props.disabled).toBe(true);
    expect(words(render({ phase: "over" }))).toContain("Best: 4");
  });
});
