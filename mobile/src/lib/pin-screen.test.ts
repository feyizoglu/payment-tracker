import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { EMPTY_LOCK, type AppLockState } from "@ptracker/shared/app-lock";

const NOW = 1_800_000_000_000;

const state = vi.hoisted(() => ({
  lock: null as unknown,
  update: vi.fn(async (_next: unknown) => undefined),
  texts: [] as string[],
  pressables: new Map<string, () => void>(),
  input: null as null | { onChangeText: (v: string) => void },
  button: null as null | { onPress: () => Promise<void> },
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  return {
    View: ({ children }: { children?: unknown }) => h(Fragment, null, children as never),
    Text: ({ children }: { children?: unknown }) => {
      state.texts.push([children].flat().join(""));
      return null;
    },
    TextInput: (props: { onChangeText: (v: string) => void }) => {
      state.input = props;
      return null;
    },
    Pressable: ({ children, onPress }: { children: { props: { children: string } }; onPress: () => void }) => {
      state.pressables.set(children.props.children, onPress);
      return null;
    },
  };
});
vi.mock("@ptracker/shared/i18n", () => ({
  localeFor: () => "tr-TR",
  useLang: () => ({
    lang: "tr",
    t: {
      pinWrong: "WRONG",
      pinEnter: "",
      pinUnlock: "UNLOCK",
      pinForgot: "FORGOT",
      pinResetCancel: "CANCEL",
      pinResetPending: "pending {time}",
      pinLockedOut: "{s}",
      pinLockedOutMin: "{m}",
    },
  }),
}));
vi.mock("@/components/ui/field", () => ({ inputBoxClass: "" }));
vi.mock("@/components/ui/primary-button", () => ({
  PrimaryButton: (props: { onPress: () => Promise<void> }) => {
    state.button = props;
    return null;
  },
}));
vi.mock("@/lib/app-lock-context", () => ({
  useAppLock: () => ({ ready: true, lock: state.lock, update: state.update }),
}));
vi.mock("@/lib/app-lock-storage", () => ({ sha256Hex: vi.fn(async (text: string) => `h(${text})`) }));

import { PinScreen } from "@/components/lock/pin-screen";
import { sha256Hex } from "@/lib/app-lock-storage";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot: (container: unknown) => Root;
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const onUnlock = vi.fn();

function container() {
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...listeners }, ...listeners };
}

const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h(s1234)", salt: "s" };

async function render(lock: AppLockState, showForgot = true) {
  state.lock = lock;
  root = createRoot(container());
  await act(async () => root?.render(createElement(PinScreen, { title: "Lock", onUnlock, showForgot })));
}

async function type(pin: string) {
  await act(async () => state.input?.onChangeText(pin));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.texts = [];
  state.pressables = new Map();
  state.input = null;
  state.button = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PinScreen submit wrong PIN", () => {
  it("saves one more failure, shows the error and does not unlock", async () => {
    await render({ ...withPin, failures: 2 });
    await type("9999");
    state.texts = [];
    await act(async () => state.button?.onPress());
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ failures: 3 }));
    expect(state.texts).toContain("WRONG");
    expect(onUnlock).not.toHaveBeenCalled();
  });
});

describe("PinScreen checkingRef", () => {
  it("checks the PIN once when unlock is pressed twice during a check", async () => {
    let finish: (v: string) => void = () => undefined;
    vi.mocked(sha256Hex).mockImplementationOnce(
      () =>
        new Promise<string>((r) => {
          finish = r;
        })
    );
    await render(withPin);
    await type("9999");
    const press = state.button!.onPress;
    await act(async () => {
      void press();
      void press();
    });
    await act(async () => finish("wrong"));
    expect(sha256Hex).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledTimes(1);
  });
});

describe("PinScreen submit right PIN", () => {
  it("unlocks with the counters reset and leaves saving to the caller", async () => {
    await render({ ...withPin, failures: 3 });
    await type("1234");
    await act(async () => state.button?.onPress());
    expect(onUnlock).toHaveBeenCalledWith({ ...withPin, failures: 0, lockedUntil: 0, resetAt: 0 });
    expect(state.update).not.toHaveBeenCalled();
  });
});

describe("PinScreen clampLockout effect", () => {
  it("caps a lockout further than 15 minutes ahead", async () => {
    await render({ ...withPin, failures: 9, lockedUntil: NOW + 60 * 60_000 });
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ lockedUntil: NOW + 15 * 60_000 }));
  });
});

describe("PinScreen applyReset tick", () => {
  it("clears the lock once the requested reset time has passed", async () => {
    await render({ ...withPin, resetAt: NOW - 1 });
    expect(state.update).toHaveBeenCalledWith(EMPTY_LOCK);
  });
});

describe("PinScreen forgot", () => {
  it("requests a reset one hour from now", async () => {
    await render(withPin);
    await act(async () => state.pressables.get("FORGOT")?.());
    expect(state.update).toHaveBeenCalledWith({ ...withPin, resetAt: NOW + 60 * 60_000 });
  });

  it("offers no reset when showForgot is false", async () => {
    await render(withPin, false);
    expect(state.pressables.has("FORGOT")).toBe(false);
  });
});

describe("PinScreen cancel reset", () => {
  it("cancels a pending reset", async () => {
    await render({ ...withPin, resetAt: NOW + 30 * 60_000 });
    await act(async () => state.pressables.get("CANCEL")?.());
    expect(state.update).toHaveBeenCalledWith({ ...withPin, resetAt: 0 });
  });
});
