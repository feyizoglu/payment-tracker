import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";

const hooks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC = "AQID";
  return { states: [] as unknown[], index: 0, effects: [] as (() => unknown)[] };
});

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
    useEffect: (effect: () => unknown) => {
      hooks.effects.push(effect);
    },
  };
});

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: {
      remindersBlocked: "BLOCKED",
      remindersFailed: "FAILED",
      iosInstallHint: "IOS_HINT",
      enableReminders: "Enable",
      disableReminders: "Disable",
    },
  }),
}));

import PushToggle from "./PushToggle";

type Props = Record<string, unknown> & { children?: unknown };
type Tree = ReactElement<Props> | null;

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

function render(): Tree {
  hooks.index = 0;
  return PushToggle() as Tree;
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

async function mount(): Promise<Tree> {
  render();
  const effects = hooks.effects.splice(0);
  for (const effect of effects) effect();
  await flush();
  return render();
}

function button(tree: Tree): ReactElement<Props> {
  const children = tree!.props.children as ReactElement<Props>[];
  return children[0];
}

function message(tree: Tree): unknown {
  const children = tree!.props.children as unknown[];
  const status = children[1] as ReactElement<Props> | false | null;
  return status ? status.props.children : null;
}

async function click(): Promise<Tree> {
  const onClick = button(render()).props.onClick as () => Promise<void>;
  await onClick();
  await flush();
  return render();
}

function makeSubscription() {
  return {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

let registration: {
  pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
};
let register: ReturnType<typeof vi.fn>;
let requestPermission: ReturnType<typeof vi.fn>;

function stubBrowser({ ios = false }: { ios?: boolean } = {}) {
  registration = {
    pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() },
  };
  register = vi.fn().mockResolvedValue(registration);
  requestPermission = vi.fn().mockResolvedValue("granted");
  const Notification = { requestPermission };
  vi.stubGlobal("navigator", {
    userAgent: ios ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" : "Mozilla/5.0 (X11; Linux x86_64)",
    platform: ios ? "iPhone" : "Linux x86_64",
    maxTouchPoints: ios ? 5 : 0,
    serviceWorker: { register, ready: Promise.resolve(registration) },
  });
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false }),
    PushManager: function PushManager() {},
    Notification,
    atob: globalThis.atob,
  });
  vi.stubGlobal("Notification", Notification);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 201 })));
}

beforeEach(() => {
  hooks.states = [];
  hooks.effects = [];
  stubBrowser();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PushToggle init", () => {
  it("registers /sw.js and shows off without a subscription", async () => {
    const tree = await mount();

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(button(tree).props["aria-pressed"]).toBe(false);
  });

  it("shows on when the browser already has a subscription", async () => {
    registration.pushManager.getSubscription.mockResolvedValue(makeSubscription());

    const tree = await mount();

    expect(button(tree).props["aria-pressed"]).toBe(true);
  });

  it("stays hidden when registering the service worker fails", async () => {
    register.mockRejectedValue(new Error("insecure"));

    expect(await mount()).toBeNull();
  });

  it("shows the iOS hint state on an iOS browser tab", async () => {
    vi.unstubAllGlobals();
    stubBrowser({ ios: true });

    const tree = await mount();

    expect(tree).not.toBeNull();
    expect(button(tree).props["aria-pressed"]).toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });
});

describe("PushToggle subscribe", () => {
  it("subscribes, POSTs the subscription and switches on", async () => {
    const sub = makeSubscription();
    registration.pushManager.subscribe.mockResolvedValue(sub);
    await mount();

    const tree = await click();

    expect(registration.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    });
    expect(fetch).toHaveBeenCalledWith("/api/web-push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    expect(button(tree).props["aria-pressed"]).toBe(true);
  });

  it("rolls back the browser subscription when the POST fails", async () => {
    const sub = makeSubscription();
    registration.pushManager.subscribe.mockResolvedValue(sub);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
    await mount();

    const tree = await click();

    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(button(tree).props["aria-pressed"]).toBe(false);
    expect(message(tree)).toBe("FAILED");
  });

  it("shows the blocked message and does not subscribe when permission is denied", async () => {
    requestPermission.mockResolvedValue("denied");
    await mount();

    const tree = await click();

    expect(message(tree)).toBe("BLOCKED");
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(button(tree).props["aria-pressed"]).toBe(false);
  });
});

describe("PushToggle unsubscribe", () => {
  it("unsubscribes, DELETEs the endpoint and switches off", async () => {
    const sub = makeSubscription();
    registration.pushManager.getSubscription.mockResolvedValue(sub);
    await mount();

    const tree = await click();

    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/web-push",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ endpoint: ENDPOINT }) })
    );
    expect(button(tree).props["aria-pressed"]).toBe(false);
  });
});

describe("PushToggle ios-hint toggle", () => {
  it("toggles the install hint and never asks for permission", async () => {
    vi.unstubAllGlobals();
    stubBrowser({ ios: true });
    await mount();

    const shown = await click();
    expect(message(shown)).toBe("IOS_HINT");

    const hidden = await click();
    expect(message(hidden)).toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
