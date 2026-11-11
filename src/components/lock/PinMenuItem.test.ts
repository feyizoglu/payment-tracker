import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.states)) hooks.states[i] = typeof initial === "function" ? initial() : initial;
      const set = (next: unknown) => {
        hooks.states[i] = typeof next === "function" ? next(hooks.states[i]) : next;
      };
      return [hooks.states[i], set];
    },
  };
});
vi.mock("lucide-react", () => ({ KeyRound: () => null, X: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { pinTitle: "PIN", cancel: "CLOSE" } }) }));
vi.mock("./PinSettings", () => ({ default: () => null }));

import PinMenuItem from "./PinMenuItem";
import PinSettings from "./PinSettings";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function render(): Node {
  hooks.index = 0;
  return PinMenuItem() as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function find(predicate: (n: Node) => boolean) {
  return nodes(render()).find(predicate);
}

const settings = () => find((n) => n.type === PinSettings);
const backdrop = () => find((n) => n.type === "div" && String(n.props.className).includes("fixed"));
const panel = () => find((n) => n.type === "div" && String(n.props.className).includes("max-w-sm"));

function open() {
  (find((n) => n.type === "button")!.props.onClick as () => void)();
}

beforeEach(() => {
  hooks.states = [];
});

describe("PinMenuItem dialog", () => {
  it("renders the PIN settings only after the menu item is clicked", () => {
    expect(settings()).toBeUndefined();
    open();
    expect(settings()).toBeDefined();
  });

  it("closes from the X button", () => {
    open();
    (find((n) => n.props["aria-label"] === "CLOSE")!.props.onClick as () => void)();
    expect(settings()).toBeUndefined();
  });

  it("closes from the backdrop", () => {
    open();
    (backdrop()!.props.onClick as () => void)();
    expect(settings()).toBeUndefined();
  });

  it("closes when the settings ask to", () => {
    open();
    (settings()!.props.onClose as () => void)();
    expect(settings()).toBeUndefined();
  });

  it("keeps a click inside the panel from reaching the backdrop", () => {
    open();
    const stopPropagation = vi.fn();
    (panel()!.props.onClick as (e: unknown) => void)({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(settings()).toBeDefined();
  });
});
