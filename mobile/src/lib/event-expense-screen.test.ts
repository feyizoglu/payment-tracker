import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { EventDetail } from "@ptracker/shared/types";

type FormScreenProps = { onSubmit: () => void; error: string | null };
type TextFieldProps = { label: string; onChangeText: (v: string) => void };

const state = vi.hoisted(() => ({
  params: { eventId: "e1" } as { eventId: string; expenseId?: string },
  form: null as null | { onSubmit: () => void; error: string | null },
  fields: new Map<string, { label: string; onChangeText: (v: string) => void }>(),
  t: {
    eventIsClosed: "EVENT_CLOSED",
    updateFailed: "UPDATE_FAILED",
    loadFailed: "LOAD_FAILED",
    description: "DESCRIPTION",
    amount: "AMOUNT",
  },
  auth: {
    api: {
      get: async (_path: string) => undefined as unknown,
      post: async (_path: string, _body: unknown) => undefined as unknown,
      put: async (_path: string, _body: unknown) => undefined as unknown,
    },
    user: { id: "u1", email: "a@b.c", name: "A" },
  },
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return { Pressable: pass, Text: () => null, TextInput: () => null, View: pass };
});
vi.mock("expo-router", () => ({
  router: { back: vi.fn() },
  useLocalSearchParams: () => state.params,
}));
vi.mock("@ptracker/shared/i18n", () => ({ localeFor: () => "en-US", useLang: () => ({ lang: "en", t: state.t }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("@/components/ui/form-screen", async () => {
  const { Fragment, createElement: h } = await import("react");
  return {
    FormScreen: (props: FormScreenProps & { children?: unknown }) => {
      state.form = props;
      return h(Fragment, null, props.children as never);
    },
  };
});
vi.mock("@/components/ui/text-field", () => ({
  TextField: (props: TextFieldProps) => {
    state.fields.set(props.label, props);
    return null;
  },
}));
vi.mock("@/components/ui/field", async () => {
  const { Fragment, createElement: h } = await import("react");
  return { Field: ({ children }: { children?: unknown }) => h(Fragment, null, children as never), inputBoxClass: "" };
});
vi.mock("@/components/ui/select-field", () => ({ SelectField: () => null }));
vi.mock("@/components/ui/date-field", () => ({ DateField: () => null }));
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));

import { router } from "expo-router";
import { ApiError } from "@/lib/api";
import EventExpenseScreen from "@/app/event-expense";

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
  created_by: "u1",
  status: "open",
  created_at: "",
  participants: [participant("p1", "u1", "Ann"), participant("p2", null, "Ben")],
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
  await act(async () => root?.render(createElement(EventExpenseScreen)));
  await flush();
}

async function type(label: string, value: string) {
  await act(async () => state.fields.get(label)?.onChangeText(value));
}

async function submit() {
  await act(async () => state.form?.onSubmit());
  await flush();
}

const closed = async () => {
  throw new ApiError(409, "Event is closed");
};

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.form = null;
  state.fields.clear();
  state.auth.api.get = vi.fn(async () => event);
  state.auth.api.post = vi.fn(async () => undefined);
  state.auth.api.put = vi.fn(async () => undefined);
  vi.mocked(router.back).mockClear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("EventExpenseScreen submit", () => {
  it("shows the closed-event error in the user's language when adding fails with a 409", async () => {
    state.params = { eventId: "e1" };
    state.auth.api.post = vi.fn(closed);
    await render();
    expect(state.form?.error).toBeNull();
    await type("DESCRIPTION", "Taxi");
    await type("AMOUNT", "12");
    await submit();
    expect(state.auth.api.post).toHaveBeenCalledTimes(1);
    expect(state.form?.error).toBe("EVENT_CLOSED");
    expect(state.form?.error).not.toBe("Event is closed");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("shows the closed-event error in the user's language when editing fails with a 409", async () => {
    state.params = { eventId: "e1", expenseId: "x1" };
    state.auth.api.put = vi.fn(closed);
    await render();
    expect(state.form?.error).toBeNull();
    await submit();
    expect(state.auth.api.put).toHaveBeenCalledWith("/api/events/e1/expenses/x1", expect.anything());
    expect(state.form?.error).toBe("EVENT_CLOSED");
    expect(router.back).not.toHaveBeenCalled();
  });
});
