import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { EventDetail } from "@ptracker/shared/types";

type AlertButton = { text: string; style?: string; onPress?: () => void };

const state = vi.hoisted(() => ({
  texts: [] as unknown[],
  pressables: new Set<{ current: { onPress: () => void; disabled?: boolean } }>(),
  alert: (_title: string, _message: string, _buttons: AlertButton[]) => undefined as void,
  auth: {
    api: {
      post: async (_path: string, _body: unknown) => undefined as unknown,
      del: async (_path: string) => undefined as unknown,
    },
  },
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h, useEffect, useRef } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  function Pressable(props: { onPress: () => void; disabled?: boolean; children?: unknown }) {
    const ref = useRef(props);
    ref.current = props;
    useEffect(() => {
      state.pressables.add(ref);
      return () => {
        state.pressables.delete(ref);
      };
    }, []);
    return h(Fragment, null, props.children as never);
  }
  return {
    Alert: { alert: (title: string, message: string, buttons: AlertButton[]) => state.alert(title, message, buttons) },
    Pressable,
    Text: ({ children }: { children?: unknown }) => {
      state.texts.push(children);
      return null;
    },
    TextInput: () => null,
    View: pass,
  };
});
vi.mock("@ptracker/shared/i18n", () => ({
  localeFor: () => "en-US",
  useLang: () => ({
    lang: "en",
    t: {
      amountAboveDebt: "AMOUNT_ABOVE_DEBT",
      eventIsClosed: "EVENT_CLOSED",
      updateFailed: "UPDATE_FAILED",
      invalidAmount: "INVALID_AMOUNT",
      undo: "Undo",
      undoPaymentConfirm: "Undo?",
      cancel: "Cancel",
    },
  }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("@/components/ui/field", () => ({ inputBoxClass: "" }));

import { ApiError } from "@/lib/api";
import { SettleUp } from "@/components/events/settle-up";

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

const participant = (id: string, display_name: string) => ({
  id,
  event_id: "e1",
  user_id: null,
  display_name,
  created_at: "",
});

const expense = {
  id: "x1",
  event_id: "e1",
  description: "Dinner",
  amount_minor: 10000,
  currency: "TRY",
  paid_by: "p1",
  spent_on: "2026-01-01",
  created_by: "u1",
  created_at: "",
  shares: [
    { participant_id: "p1", amount_minor: 5000 },
    { participant_id: "p2", amount_minor: 5000 },
  ],
};

const settlement = {
  id: "s1",
  event_id: "e1",
  from_participant: "p2",
  to_participant: "p1",
  amount_minor: 5000,
  currency: "TRY",
  created_by: "u1",
  created_at: "",
};

const makeEvent = (settlements: (typeof settlement)[]) =>
  ({
    id: "e1",
    name: "Trip",
    event_date: null,
    created_by: "u1",
    status: "open",
    created_at: "",
    participants: [participant("p1", "Ann"), participant("p2", "Ben")],
    expenses: [expense],
    settlements,
  }) as unknown as EventDetail;

async function render(event: EventDetail, onChanged: () => void) {
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(SettleUp, { event, isOpen: true, onChanged })));
  await flush();
}

const pressables = () => [...state.pressables].map((r) => r.current);

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.texts = [];
  state.pressables.clear();
  state.alert = vi.fn();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("SettleUp record", () => {
  it("shows the above-debt error in the user's language and refreshes on a 409", async () => {
    state.auth.api.post = vi.fn(async () => {
      throw new ApiError(409, "Amount is more than the current debt");
    });
    const onChanged = vi.fn();
    await render(makeEvent([]), onChanged);
    expect(pressables()).toHaveLength(1);
    state.texts = [];
    await act(async () => pressables()[0].onPress());
    await flush();
    expect(state.auth.api.post).toHaveBeenCalledTimes(1);
    expect(state.texts).toContain("AMOUNT_ABOVE_DEBT");
    expect(state.texts).not.toContain("Amount is more than the current debt");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe("SettleUp undo", () => {
  it("shows the closed-event error in the user's language and refreshes on a 409", async () => {
    state.auth.api.del = vi.fn(async () => {
      throw new ApiError(409, "Event is closed");
    });
    const onChanged = vi.fn();
    await render(makeEvent([settlement]), onChanged);
    expect(pressables()).toHaveLength(1);
    await act(async () => pressables()[0].onPress());
    const buttons = vi.mocked(state.alert).mock.calls[0][2];
    const destructive = buttons.find((b) => b.style === "destructive");
    state.texts = [];
    await act(async () => destructive?.onPress?.());
    await flush();
    expect(state.auth.api.del).toHaveBeenCalledWith("/api/events/e1/settlements/s1");
    expect(state.texts).toContain("EVENT_CLOSED");
    expect(state.texts).not.toContain("Event is closed");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
