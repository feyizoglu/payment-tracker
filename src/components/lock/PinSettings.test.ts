import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { EMPTY_LOCK, type AppLockState } from "@/lib/app-lock";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));
const store = vi.hoisted(() => ({
  lock: null as unknown,
  writeLock: vi.fn(),
  sha256Hex: vi.fn(async (text: string) => `h(${text})`),
  randomSalt: () => "salt",
}));

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
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: { pinSaved: "SAVED", pinRemove: "REMOVE", pinChange: "CHANGE", pinEconomyLock: "ECO" } }),
}));
vi.mock("@/lib/app-lock-store", () => ({
  useAppLock: () => store.lock,
  writeLock: store.writeLock,
  sha256Hex: store.sha256Hex,
  randomSalt: store.randomSalt,
}));
vi.mock("./PinScreen", () => ({ default: () => null }));
vi.mock("./PinSetup", () => ({ default: () => null }));

import PinSettings from "./PinSettings";
import PinScreen from "./PinScreen";
import PinSetup from "./PinSetup";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onClose = vi.fn();
const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h", salt: "s" };

function render(): Node {
  hooks.index = 0;
  return PinSettings({ onClose }) as Node;
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

function find(tree: Node, type: unknown, label?: string) {
  return nodes(tree).find((n) => n.type === type && (label === undefined || text(n) === label));
}

function verified() {
  const screen = find(render(), PinScreen)!;
  (screen.props.onUnlock as (next: AppLockState) => void)(store.lock as AppLockState);
  store.writeLock.mockClear();
  return render();
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  store.lock = withPin;
});

describe("PinSettings verify gate", () => {
  it("asks for the current PIN without a reset option before showing the controls", () => {
    const tree = render();
    expect(tree.type).toBe(PinScreen);
    expect(tree.props.showForgot).toBe(false);
    expect(find(tree, "input")).toBeUndefined();
    expect(find(tree, "button")).toBeUndefined();
  });

  it("stores the checked state and shows the controls after the PIN", () => {
    const next = { ...withPin, failures: 0 };
    (render().props.onUnlock as (next: AppLockState) => void)(next);
    expect(store.writeLock).toHaveBeenCalledWith(next);
    const tree = render();
    expect(find(tree, "input")).toBeDefined();
    expect(find(tree, "button", "CHANGE")).toBeDefined();
    expect(find(tree, "button", "REMOVE")).toBeDefined();
  });
});

describe("PinSettings save", () => {
  it("stores a salted hash and shows the saved notice", async () => {
    store.lock = EMPTY_LOCK;
    const setup = find(render(), PinSetup)!;
    await (setup.props.onDone as (pin: string) => Promise<void>)("1234");
    expect(store.writeLock).toHaveBeenCalledWith(expect.objectContaining({ pinHash: "h(salt1234)", salt: "salt" }));
    store.lock = store.writeLock.mock.calls[0][0];
    expect(text(render())).toContain("SAVED");
  });
});

describe("PinSettings remove", () => {
  it("clears the lock and closes", () => {
    (find(verified(), "button", "REMOVE")!.props.onClick as () => void)();
    expect(store.writeLock).toHaveBeenCalledWith(EMPTY_LOCK);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("PinSettings economy toggle", () => {
  it("turns the economy lock on", () => {
    (find(verified(), "input")!.props.onChange as (e: unknown) => void)({ target: { checked: true } });
    expect(store.writeLock).toHaveBeenCalledWith({ ...withPin, economyLock: true });
  });
});
