import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import {
  DEFAULT_SETUP,
  initialGameState,
  pickOptions,
  playerColor,
  type GameState,
  type Night,
  type Role,
  type WolfSetup,
} from "@/lib/wolf-game";

const KEYS: Record<string, string> = {
  wolfOtherWolves: "others {names}",
  wolfHeal: "heal {name}",
  wolfTaskWitch: "victim {name}",
};
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => KEYS[String(key)] ?? String(key) }) }),
}));

import WolfCard from "./WolfCard";
import WolfChoose from "./WolfChoose";
import WolfNarrator from "./WolfNarrator";
import WolfPicker from "./WolfPicker";
import WolfRoster from "./WolfRoster";
import WolfRulesButton from "./WolfRulesButton";
import WolfWitch from "./WolfWitch";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onPick = vi.fn();
const onHeal = vi.fn();
const onNext = vi.fn();
const onRules = vi.fn();
const onStart = vi.fn();
const NAMES = ["Ann", "Bob", "Cem", "Dan", "Eda", "Fay", "Gil"];

function game(roles: Role[], over: Partial<GameState> = {}, setup: Partial<WolfSetup> = {}): GameState {
  const s = { ...DEFAULT_SETUP, players: NAMES.slice(0, roles.length), ...setup };
  return { ...initialGameState(s), phase: "night", roles, alive: roles.map(() => true), ...over };
}

function night(over: Partial<Night> = {}, n = 5): Night {
  return {
    number: 1,
    lap: "main",
    order: Array.from({ length: n }, (_, i) => i),
    visit: 0,
    stage: "choose",
    picks: Array.from({ length: n }, () => null),
    line: 0,
    victim: null,
    seen: null,
    protect: null,
    heal: false,
    poison: null,
    ...over,
  };
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

const click = (node: Node | undefined) => (node!.props.onClick as () => void)();
const find = (tree: Node, type: unknown) => nodes(tree).find((n) => n.type === type);
const lastButton = (tree: Node) => nodes(tree).filter((n) => n.type === "button").at(-1)!;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WolfPicker", () => {
  it("draws one button per player in their colour, marks the pick and calls back with the seat", () => {
    const tree = WolfPicker({
      options: [
        { seat: 0, enabled: true },
        { seat: 2, enabled: false },
      ],
      names: NAMES,
      selected: 0,
      onPick,
      note: (seat) => `note${seat}`,
    }) as Node;
    const buttons = nodes(tree).filter((n) => n.type === "button");
    expect(buttons.map(text)).toEqual(["✓ Annnote0", "Cemnote2"]);
    expect(buttons.map((b) => [b.props.disabled, b.props["aria-pressed"]])).toEqual([
      [false, true],
      [true, false],
    ]);
    expect((buttons[1].props.style as { backgroundColor: string }).backgroundColor).toBe(playerColor(2));
    click(buttons[0]);
    expect(onPick).toHaveBeenCalledWith(0);
  });
});

describe("WolfCard", () => {
  it("shows the dealt role and tells a wolf who the other wolves are", () => {
    const s = game(["wolf", "villager", "wolf", "seer", "villager"], { phase: "deal", turn: 0 });
    expect(text(WolfCard({ state: s }))).toBe("wolfYourRolewolfRoleWolfwolfDescWolfothers Cem");
  });

  it("draws every role's card with the same parts", () => {
    const classes = (s: GameState) => new Set(nodes(WolfCard({ state: s }) as Node).map((n) => n.props.className));
    const roles: Role[] = ["wolf", "villager", "seer", "doctor", "villager"];
    const wolf = classes(game(roles, { phase: "deal", turn: 0 }));
    for (const turn of [1, 2, 3]) expect(classes(game(roles, { phase: "deal", turn }))).toEqual(wolf);
  });

  it("shows the visitor's task at night", () => {
    const s = game(["villager", "wolf", "seer", "doctor", "villager"], { night: night({ visit: 2, stage: "card" }) });
    expect(text(WolfCard({ state: s }))).toBe("wolfNightNwolfRoleSeerwolfTaskSeer");
  });
});

describe("WolfChoose", () => {
  const roles: Role[] = ["villager", "wolf", "seer", "doctor", "wolf"];
  const render = (s: GameState) => WolfChoose({ state: s, onPick, onHeal, onNext }) as Node;

  it("asks every role the same question and offers whom that role may pick", () => {
    for (const visit of [0, 1, 2, 3]) {
      const s = game(roles, { night: night({ visit }) });
      const tree = render(s);
      expect(text(tree)).toContain("wolfChoosePlayer");
      expect(text(tree)).not.toContain("wolfTask");
      expect(find(tree, WolfPicker)!.props.options).toEqual(pickOptions(s));
      expect(find(tree, WolfPicker)!.props.onPick).toBe(onPick);
    }
  });

  it("shows the pick, the seer's answer at once, and allows Next only after a pick", () => {
    expect(lastButton(render(game(roles, { night: night({ visit: 2 }) }))).props.disabled).toBe(true);
    const seen = render(game(roles, { night: night({ visit: 2, picks: [null, null, 1, null, null], seen: 1 }) }));
    expect(text(seen)).toContain("Bob: wolfIsWolf");
    expect(lastButton(seen).props.disabled).toBe(false);
    click(lastButton(seen));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(text(render(game(roles, { night: night({ visit: 0, picks: [3, null, null, null, null] }) })))).toContain(
      "wolfChosen"
    );
  });

  it("gives the witch her potions on the witch lap", () => {
    const s = game(["wolf", "seer", "witch", "villager", "villager"], { night: night({ lap: "witch", visit: 2, victim: 4 }) });
    const tree = render(s);
    expect(find(tree, WolfWitch)!.props).toMatchObject({ state: s, onHeal, onPick });
    expect(find(tree, WolfPicker)).toBeUndefined();
    expect(lastButton(tree).props.disabled).toBe(false);
  });
});

describe("WolfWitch", () => {
  const roles: Role[] = ["wolf", "seer", "witch", "villager", "villager"];
  const render = (s: GameState) => WolfWitch({ state: s, onHeal, onPick }) as Node;

  it("shows the victim and offers Heal and Poison while those potions are left", () => {
    const s = game(roles, { night: night({ lap: "witch", visit: 2, victim: 4 }) });
    const tree = render(s);
    expect(text(tree)).toContain("victim Eda");
    const heal = nodes(tree).find((n) => n.type === "button")!;
    expect([text(heal), heal.props["aria-pressed"]]).toEqual(["heal Eda", false]);
    click(heal);
    expect(onHeal).toHaveBeenCalledTimes(1);
    expect(find(tree, WolfPicker)!.props.options).toEqual(pickOptions(s));
  });

  it("marks the heal and leaves out the potions that are used", () => {
    const healed = render(
      game(roles, { night: night({ lap: "witch", visit: 2, victim: 4, heal: true }), potions: { heal: true, poison: false } })
    );
    expect(text(nodes(healed).find((n) => n.type === "button"))).toBe("✓ heal Eda");
    expect(find(healed, WolfPicker)).toBeUndefined();
    const empty = render(game(roles, { night: night({ lap: "witch", visit: 2, victim: 4 }), potions: { heal: false, poison: false } }));
    expect(text(empty)).toContain("wolfNoPotions");
    expect(nodes(empty).some((n) => n.type === "button")).toBe(false);
  });
});

describe("WolfRoster", () => {
  it("lists every player with their role and starts the night", () => {
    const s = game(["wolf", "seer", "villager", "villager", "doctor"], { phase: "deal", turn: 5 }, { night: "narrator" });
    const tree = WolfRoster({ state: s, onStart }) as Node;
    expect(nodes(tree).filter((n) => n.type === "li").map(text)).toEqual([
      "AnnwolfRoleWolf",
      "BobwolfRoleSeer",
      "CemwolfRoleVillager",
      "DanwolfRoleVillager",
      "EdawolfRoleDoctor",
    ]);
    click(lastButton(tree));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("WolfNarrator", () => {
  const roles: Role[] = ["wolf", "seer", "doctor", "witch", "villager"];
  const narrated = (over: Partial<Night>, state: Partial<GameState> = {}) =>
    game(roles, { night: night({ stage: "card", ...over }), ...state }, { night: "narrator", specials: ["seer", "doctor", "witch"] });
  const render = (s: GameState) => WolfNarrator({ state: s, onPick, onHeal, onNext, onRules }) as Node;

  it("reads the line, shows each player's role and needs the wolves' victim before Next", () => {
    const tree = render(narrated({ line: 1 }));
    expect(text(tree)).toContain("wolfLineWolves");
    const picker = find(tree, WolfPicker)!;
    expect(picker.props.selected).toBeNull();
    expect((picker.props.note as (seat: number) => string)(0)).toBe("wolfRoleWolf");
    expect(lastButton(tree).props.disabled).toBe(true);
    expect(lastButton(render(narrated({ line: 1, victim: 4 }))).props.disabled).toBe(false);
  });

  it("shows the seer's answer for the narrator to show with a thumb", () => {
    const out = text(render(narrated({ line: 2, victim: 4, seen: 0 })));
    expect(out).toContain("wolfIsWolf");
    expect(out).toContain("wolfSeerThumb");
  });

  it("reads a removed role's line with the marker and no choice", () => {
    const tree = render(narrated({ line: 2, victim: 4 }, { alive: [true, false, true, true, true] }));
    expect(text(tree)).toContain("wolfLineSeer");
    expect(text(tree)).toContain("wolfLineRemoved");
    expect(find(tree, WolfPicker)).toBeUndefined();
    expect(lastButton(tree).props.disabled).toBe(false);
  });

  it("calls Next Nothing on the witch's line until she heals or poisons", () => {
    const witch = render(narrated({ line: 4, victim: 4 }));
    expect(find(witch, WolfWitch)).toBeDefined();
    expect(text(lastButton(witch))).toBe("wolfNothing");
    expect(text(lastButton(render(narrated({ line: 4, victim: 4, heal: true }))))).toBe("wolfNext");
  });

  it("opens the rules", () => {
    expect(find(render(narrated({ line: 0 })), WolfRulesButton)!.props.onClick).toBe(onRules);
  });
});
