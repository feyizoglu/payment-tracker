import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { EMPTY_LOCK, type AppLockState } from "@ptracker/shared/app-lock";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));
const s = vi.hoisted(() => ({
  lock: null as unknown,
  update: vi.fn(async (_next: unknown) => undefined),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
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
vi.mock("react-native", () => ({
  View: () => null,
  Text: () => null,
  TextInput: () => null,
  Pressable: () => null,
  Switch: () => null,
}));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: { pinSaved: "SAVED", pinRemove: "REMOVE", pinChange: "CHANGE", pinInvalid: "INVALID", pinMismatch: "MISMATCH" },
  }),
}));
vi.mock("@/lib/app-lock-context", () => ({ useAppLock: () => ({ ready: true, lock: s.lock, update: s.update }) }));
vi.mock("@/lib/app-lock-storage", () => ({
  randomSalt: () => "salt",
  sha256Hex: async (text: string) => `h(${text})`,
}));
vi.mock("@/components/ui/field", () => ({ Field: () => null, inputBoxClass: "" }));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/lock/pin-screen", () => ({ PinScreen: () => null }));

import { Pressable, Switch, TextInput } from "react-native";
import { PrimaryButton } from "@/components/ui/primary-button";
import { PinScreen } from "@/components/lock/pin-screen";
import { PinSettings } from "@/components/lock/pin-settings";
import { PinSetup } from "@/components/lock/pin-setup";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h", salt: "s" };

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

function settings(): Node {
  hooks.index = 0;
  return PinSettings() as Node;
}

async function verified() {
  await (find(settings(), PinScreen)!.props.onUnlock as (next: AppLockState) => Promise<void>)(withPin);
  s.update.mockClear();
  return settings();
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  s.lock = withPin;
});

describe("PinSettings save", () => {
  it("stores the salted hash of a new PIN and shows the controls next", async () => {
    s.lock = EMPTY_LOCK;
    await (find(settings(), PinSetup)!.props.onDone as (pin: string) => Promise<void>)("1234");
    expect(s.update).toHaveBeenCalledWith(expect.objectContaining({ pinHash: "h(salt1234)", salt: "salt" }));
    s.lock = s.update.mock.calls[0][0];
    const tree = settings();
    expect(find(tree, Switch)).toBeDefined();
    expect(text(tree)).toContain("SAVED");
  });
});

describe("PinSettings remove", () => {
  it("clears the lock", async () => {
    (find(await verified(), Pressable, "REMOVE")!.props.onPress as () => void)();
    expect(s.update).toHaveBeenCalledWith(EMPTY_LOCK);
  });
});

describe("PinSettings economy toggle", () => {
  it("turns the economy lock on", async () => {
    (find(await verified(), Switch)!.props.onValueChange as (on: boolean) => void)(true);
    expect(s.update).toHaveBeenCalledWith({ ...withPin, economyLock: true });
  });
});

describe("PinSetup submit", () => {
  const onDone = vi.fn(async () => undefined);

  function setup(): Node {
    hooks.index = 0;
    return PinSetup({ onDone }) as Node;
  }

  async function submit(pin: string, repeat: string) {
    const [first, second] = nodes(setup()).filter((n) => n.type === TextInput);
    (first.props.onChangeText as (v: string) => void)(pin);
    (second.props.onChangeText as (v: string) => void)(repeat);
    await (find(setup(), PrimaryButton)!.props.onPress as () => Promise<void>)();
    return text(setup());
  }

  it("rejects a three-digit PIN", async () => {
    expect(await submit("123", "123")).toContain("INVALID");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("rejects a repeat that does not match", async () => {
    expect(await submit("1234", "1235")).toContain("MISMATCH");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("hands over a valid matching PIN", async () => {
    await submit("1234", "1234");
    expect(onDone).toHaveBeenCalledWith("1234");
  });
});
