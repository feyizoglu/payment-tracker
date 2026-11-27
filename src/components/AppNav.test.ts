import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const mocks = vi.hoisted(() => ({ open: false, setOpen: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: () => [mocks.open, mocks.setOpen] };
});

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: { dashboard: "DASH", economy: "ECON", events: "EVENTS", games: "GAMES", wordsTitle: "WORDS", menu: "MENU" },
  }),
}));

import Link from "next/link";
import AppNav, { type AppSection } from "./AppNav";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function findAll(node: unknown, match: (el: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, out);
    return out;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return out;
  const el = node as Node;
  if (match(el)) out.push(el);
  findAll(el.props.children, match, out);
  return out;
}

const render = (active: AppSection = "events") => AppNav({ active }) as unknown as Node;
const toggle = (tree: Node) => findAll(tree, (el) => el.type === "button")[0];
const panel = (tree: Node) => findAll(tree, (el) => el.type === "nav" && el.props.id !== undefined)[0];
const inline = (tree: Node) => findAll(tree, (el) => el.type === "nav" && el.props.id === undefined)[0];
const links = (node: unknown) => findAll(node, (el) => el.type === Link);
const backdrop = (tree: Node) => findAll(tree, (el) => el.type === "div" && el.props["aria-hidden"] === "true");

beforeEach(() => {
  mocks.open = false;
  mocks.setOpen.mockClear();
});

describe("AppNav", () => {
  it("links the five sections in order, inline and in the menu panel", () => {
    mocks.open = true;
    const tree = render();
    const expected = [
      ["/dashboard", "DASH"],
      ["/economy", "ECON"],
      ["/events", "EVENTS"],
      ["/games", "GAMES"],
      ["/words", "WORDS"],
    ];
    for (const nav of [inline(tree), panel(tree)]) {
      expect(links(nav).map((l) => [l.props.href, l.props.children])).toEqual(expected);
    }
  });

  it.each([
    ["dashboard", "/dashboard", "text-blue-700"],
    ["economy", "/economy", "text-green-700"],
    ["events", "/events", "text-purple-700"],
    ["games", "/games", "text-purple-700"],
    ["words", "/words", "text-purple-700"],
  ] as const)("marks %s as the current page in its colour, the others idle", (section, href, colour) => {
    mocks.open = true;
    const tree = render(section);
    for (const nav of [inline(tree), panel(tree)]) {
      for (const link of links(nav)) {
        const current = link.props.href === href;
        expect(link.props["aria-current"]).toBe(current ? "page" : undefined);
        expect(link.props.className).toContain(current ? colour : "text-gray-500");
        if (current) expect(link.props.className).toContain("font-semibold");
      }
    }
  });

  it("shows the menu button and panel only below lg, and the inline links only from lg", () => {
    const tree = render();
    expect(toggle(tree).props.className).toContain("lg:hidden");
    expect(panel(tree).props.className).toContain("lg:hidden");
    expect(inline(tree).props.className).toContain("hidden lg:flex");
  });

  it("labels the menu button and points it at the panel", () => {
    const tree = render();
    const button = toggle(tree);
    expect(button.props["aria-label"]).toBe("MENU");
    expect(button.props["aria-controls"]).toBe(panel(tree).props.id);
    expect(button.props.type).toBe("button");
  });

  it("keeps the panel hidden and no backdrop while closed", () => {
    const tree = render();
    expect(toggle(tree).props["aria-expanded"]).toBe(false);
    expect(panel(tree).props.hidden).toBe(true);
    expect(backdrop(tree)).toHaveLength(0);
  });

  it("shows the panel and a backdrop while open", () => {
    mocks.open = true;
    const tree = render();
    expect(toggle(tree).props["aria-expanded"]).toBe(true);
    expect(panel(tree).props.hidden).toBe(false);
    expect(backdrop(tree)).toHaveLength(1);
  });

  it("opens and closes from the menu button", () => {
    (toggle(render()).props.onClick as () => void)();
    expect(mocks.setOpen).toHaveBeenLastCalledWith(true);
    mocks.open = true;
    (toggle(render()).props.onClick as () => void)();
    expect(mocks.setOpen).toHaveBeenLastCalledWith(false);
  });

  it("closes when a section in the panel is chosen", () => {
    mocks.open = true;
    const [, economy] = links(panel(render()));
    (economy.props.onClick as () => void)();
    expect(mocks.setOpen).toHaveBeenCalledWith(false);
  });

  it("closes on a tap outside the panel", () => {
    mocks.open = true;
    (backdrop(render())[0].props.onClick as () => void)();
    expect(mocks.setOpen).toHaveBeenCalledWith(false);
  });

  it("closes on Escape and ignores other keys", () => {
    mocks.open = true;
    const tree = render();
    const onKeyDown = tree.props.onKeyDown as (e: { key: string }) => void;
    onKeyDown({ key: "Enter" });
    expect(mocks.setOpen).not.toHaveBeenCalled();
    onKeyDown({ key: "Escape" });
    expect(mocks.setOpen).toHaveBeenCalledWith(false);
  });

  it("shows the PayTrack word only from sm, next to the logo", () => {
    const [word] = findAll(render(), (el) => el.type === "span" && el.props.children === "PayTrack");
    expect(word.props.className).toContain("hidden sm:inline");
  });
});
