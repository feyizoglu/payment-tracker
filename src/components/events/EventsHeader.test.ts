import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  signOutWithPushCleanup: vi.fn().mockResolvedValue(undefined),
  menuOpen: true,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: () => [mocks.menuOpen, vi.fn()] };
});

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Ada", email: "ada@example.com" } } }),
  signOut: mocks.signOut,
}));

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    lang: "en",
    setLang: vi.fn(),
    t: { dashboard: "Dashboard", economy: "Economy", events: "Events", signOut: "SIGN_OUT" },
  }),
}));

vi.mock("@/components/PushToggle", () => ({ default: function PushToggle() { return null; } }));

vi.mock("@/lib/web-push-client", () => ({ signOutWithPushCleanup: mocks.signOutWithPushCleanup }));

import EventsHeader from "./EventsHeader";
import PushToggle from "@/components/PushToggle";
import SignOutMenuItem from "@/components/SignOutMenuItem";

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

function hasText(node: unknown, text: string): boolean {
  if (node === text) return true;
  if (Array.isArray(node)) return node.some((child) => hasText(child, text));
  if (node && typeof node === "object" && "props" in node) return hasText((node as Node).props.children, text);
  return false;
}

beforeEach(() => {
  mocks.signOut.mockClear();
  mocks.signOutWithPushCleanup.mockClear();
  mocks.menuOpen = true;
});

describe("EventsHeader", () => {
  it("mounts the reminders toggle", () => {
    const tree = EventsHeader();

    expect(findAll(tree, (el) => el.type === PushToggle)).toHaveLength(1);
  });

  it("offers sign-out through the shared menu item, which handles a failed sign-out itself", () => {
    const tree = EventsHeader();

    expect(findAll(tree, (el) => el.type === SignOutMenuItem)).toHaveLength(1);
    expect(findAll(tree, (el) => el.type === "button" && hasText(el.props.children, "SIGN_OUT"))).toHaveLength(0);
    expect(mocks.signOutWithPushCleanup).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("signs out through signOutWithPushCleanup when the menu item is clicked", async () => {
    const [item] = findAll(EventsHeader(), (el) => el.type === SignOutMenuItem);
    const rendered = (item.type as () => unknown)();
    const [signOutButton] = findAll(rendered, (el) => el.type === "button" && hasText(el.props.children, "SIGN_OUT"));

    await (signOutButton.props.onClick as () => Promise<void>)();

    expect(mocks.signOutWithPushCleanup).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("keeps sign-out out of the header while the user menu is closed", () => {
    mocks.menuOpen = false;

    expect(findAll(EventsHeader(), (el) => el.type === SignOutMenuItem)).toHaveLength(0);
  });

  it("highlights the nav item of the current section", () => {
    const linkClass = (tree: unknown, href: string) =>
      findAll(tree, (el) => el.props?.href === href)[0].props.className as string;

    const events = EventsHeader();
    expect(linkClass(events, "/events")).toContain("font-semibold");
    expect(linkClass(events, "/games")).not.toContain("font-semibold");

    const games = EventsHeader({ active: "games" });
    expect(linkClass(games, "/games")).toContain("font-semibold");
    expect(linkClass(games, "/events")).not.toContain("font-semibold");
  });
});
