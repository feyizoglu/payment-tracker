import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));
const mocks = vi.hoisted(() => ({ signOutWithPushCleanup: vi.fn() }));

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
vi.mock("lucide-react", () => ({ LogOut: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { signOut: "SIGN_OUT", loadFailed: "LOAD_FAILED" } }) }));
vi.mock("@/lib/web-push-client", () => ({ signOutWithPushCleanup: mocks.signOutWithPushCleanup }));

import SignOutMenuItem from "./SignOutMenuItem";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function render(): Node {
  hooks.index = 0;
  return SignOutMenuItem() as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function button(): Node {
  return nodes(render()).find((n) => n.type === "button")!;
}

function click() {
  return (button().props.onClick as () => Promise<void>)();
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  mocks.signOutWithPushCleanup.mockResolvedValue(undefined);
});

describe("SignOutMenuItem", () => {
  it("renders the sign-out button without an error", () => {
    expect(text(button())).toBe("SIGN_OUT");
    expect(button().props.className).toContain("text-red-500");
    expect(text(render())).not.toContain("LOAD_FAILED");
  });

  it("signs out through signOutWithPushCleanup", async () => {
    await click();
    expect(mocks.signOutWithPushCleanup).toHaveBeenCalledTimes(1);
    expect(text(render())).not.toContain("LOAD_FAILED");
  });

  it("catches a failed sign-out and shows the error under the button", async () => {
    mocks.signOutWithPushCleanup.mockRejectedValue(new Error("Sign-out failed"));
    await expect(click()).resolves.toBeUndefined();
    const all = nodes(render());
    const error = all.find((n) => text(n) === "LOAD_FAILED" && n.type === "p")!;
    expect(String(error.props.className)).toContain("text-red-600");
    expect(all.indexOf(error)).toBeGreaterThan(all.findIndex((n) => n.type === "button"));
  });

  it("clears the error when the next attempt succeeds", async () => {
    mocks.signOutWithPushCleanup.mockRejectedValueOnce(new Error("Sign-out failed"));
    await click();
    expect(text(render())).toContain("LOAD_FAILED");
    await click();
    expect(mocks.signOutWithPushCleanup).toHaveBeenCalledTimes(2);
    expect(text(render())).not.toContain("LOAD_FAILED");
  });
});
