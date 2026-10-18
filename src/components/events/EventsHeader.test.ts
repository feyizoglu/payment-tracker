import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  signOutWithPushCleanup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: () => [true, vi.fn()] };
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
});

describe("EventsHeader", () => {
  it("mounts the reminders toggle", () => {
    const tree = EventsHeader();

    expect(findAll(tree, (el) => el.type === PushToggle)).toHaveLength(1);
  });

  it("signs out through signOutWithPushCleanup", () => {
    const tree = EventsHeader();
    const [signOutButton] = findAll(tree, (el) => el.type === "button" && hasText(el.props.children, "SIGN_OUT"));

    (signOutButton.props.onClick as () => void)();

    expect(mocks.signOutWithPushCleanup).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
