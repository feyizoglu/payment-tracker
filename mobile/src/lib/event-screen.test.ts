import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { EventDetail } from "@ptracker/shared/types";

type AlertButton = { text: string; style?: string; onPress?: () => void };
type PressableProps = { onPress?: () => void; onLongPress?: () => void; disabled?: boolean };

const state = vi.hoisted(() => ({
  texts: [] as unknown[],
  pressables: [] as { onPress?: () => void; onLongPress?: () => void; disabled?: boolean }[],
  alert: (_title: string, _message: string, _buttons: AlertButton[]) => undefined as void,
  t: {
    eventIsClosed: "EVENT_CLOSED",
    updateFailed: "UPDATE_FAILED",
    loadFailed: "LOAD_FAILED",
    delete: "Delete",
    cancel: "Cancel",
  },
  auth: {
    api: {
      get: async (_path: string) => undefined as unknown,
      del: async (_path: string) => undefined as unknown,
    },
    user: { id: "u1", email: "a@b.c", name: "A" },
  },
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return {
    ActivityIndicator: () => null,
    Alert: { alert: (title: string, message: string, buttons: AlertButton[]) => state.alert(title, message, buttons) },
    Pressable: (props: PressableProps & { children?: unknown }) => {
      state.pressables.push(props);
      return h(Fragment, null, props.children as never);
    },
    RefreshControl: () => null,
    ScrollView: pass,
    Text: ({ children }: { children?: unknown }) => {
      state.texts.push(children);
      return null;
    },
    View: pass,
  };
});
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: { back: vi.fn(), push: vi.fn() },
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
    useLocalSearchParams: () => ({ id: "e1" }),
  };
});
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
vi.mock("@ptracker/shared/i18n", () => ({ localeFor: () => "en-US", useLang: () => ({ lang: "en", t: state.t }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("@/components/events/participants", () => ({ Participants: () => null }));
vi.mock("@/components/events/settle-up", () => ({ SettleUp: () => null }));
vi.mock("@/components/ui/danger-link", () => ({ DangerLink: () => null }));

import { ApiError } from "@/lib/api";
import EventScreen from "@/app/event/[id]";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot: (container: unknown) => Root;
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

function container() {
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...listeners }, ...listeners };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

const participant = (id: string, user_id: string | null, display_name: string) => ({
  id,
  event_id: "e1",
  user_id,
  display_name,
  created_at: "",
});

const event = {
  id: "e1",
  name: "Trip",
  event_date: null,
  created_by: "u2",
  status: "open",
  created_at: "",
  participants: [participant("p1", "u1", "Ann"), participant("p2", "u2", "Ben")],
  expenses: [
    {
      id: "x1",
      event_id: "e1",
      description: "Dinner",
      amount_minor: 1000,
      currency: "TRY",
      paid_by: "p1",
      spent_on: "2026-01-01",
      created_by: "u1",
      created_at: "",
      shares: [
        { participant_id: "p1", amount_minor: 500 },
        { participant_id: "p2", amount_minor: 500 },
      ],
    },
  ],
  settlements: [],
} as unknown as EventDetail;

async function render() {
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(EventScreen)));
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.texts = [];
  state.pressables = [];
  state.alert = vi.fn();
  state.auth.api.get = vi.fn(async () => event);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("EventScreen deleteExpense", () => {
  it("shows the closed-event error in the user's language and reloads on a 409", async () => {
    state.auth.api.del = vi.fn(async () => {
      throw new ApiError(409, "Event is closed");
    });
    await render();
    expect(state.auth.api.get).toHaveBeenCalledTimes(1);
    const row = state.pressables.findLast((p) => p.onLongPress);
    await act(async () => row?.onLongPress?.());
    const buttons = vi.mocked(state.alert).mock.calls[0][2];
    const destructive = buttons.find((b) => b.style === "destructive");
    state.texts = [];
    await act(async () => destructive?.onPress?.());
    await flush();
    expect(state.auth.api.del).toHaveBeenCalledWith("/api/events/e1/expenses/x1");
    expect(state.texts).toContain("EVENT_CLOSED");
    expect(state.texts).not.toContain("Event is closed");
    expect(state.auth.api.get).toHaveBeenCalledTimes(2);
  });
});
