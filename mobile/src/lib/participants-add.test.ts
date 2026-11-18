import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { EventDetail } from "@ptracker/shared/types";

type FieldProps = { label: string; onChangeText: (v: string) => void };
type ButtonProps = { onPress: () => void; disabled?: boolean };

const state = vi.hoisted(() => ({
  texts: [] as unknown[],
  fields: new Map<string, { label: string; onChangeText: (v: string) => void }>(),
  buttons: [] as { onPress: () => void; disabled?: boolean }[],
  t: {
    eventIsClosed: "EVENT_CLOSED",
    updateFailed: "UPDATE_FAILED",
    loadFailed: "LOAD_FAILED",
    addByEmail: "ADD_BY_EMAIL",
    addByName: "ADD_BY_NAME",
  },
  auth: {
    api: {
      get: async (_path: string) => [] as unknown,
      post: async (_path: string, _body: unknown) => undefined as unknown,
    },
    user: { id: "u1", email: "a@b.c", name: "A" },
  },
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return {
    Pressable: pass,
    Text: ({ children }: { children?: unknown }) => {
      state.texts.push(children);
      return null;
    },
    View: pass,
  };
});
vi.mock("expo-router", () => ({ router: { back: vi.fn() } }));
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t: state.t }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("@/components/ui/primary-button", () => ({
  PrimaryButton: (props: ButtonProps) => {
    state.buttons.push(props);
    return null;
  },
}));
vi.mock("@/components/ui/select-field", () => ({ SelectField: () => null }));
vi.mock("@/components/ui/text-field", () => ({
  TextField: (props: FieldProps) => {
    state.fields.set(props.label, props);
    return null;
  },
}));

import { ApiError } from "@/lib/api";
import { Participants } from "@/components/events/participants";

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

const event = {
  id: "e1",
  name: "Trip",
  event_date: null,
  created_by: "u1",
  status: "open",
  created_at: "",
  participants: [{ id: "p1", event_id: "e1", user_id: "u1", display_name: "Ann", created_at: "" }],
  expenses: [],
  settlements: [],
} as unknown as EventDetail;

async function render(onChanged: () => void) {
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(Participants, { event, editable: true, onChanged })));
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.texts = [];
  state.fields.clear();
  state.buttons = [];
  state.auth.api.get = vi.fn(async () => []);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("Participants add", () => {
  it("shows the closed-event error in the user's language and refreshes on a 409", async () => {
    state.auth.api.post = vi.fn(async () => {
      throw new ApiError(409, "Event is closed");
    });
    const onChanged = vi.fn();
    await render(onChanged);
    await act(async () => state.fields.get("ADD_BY_EMAIL")?.onChangeText("dan@b.c"));
    const enabled = state.buttons.findLast((b) => !b.disabled);
    state.texts = [];
    await act(async () => enabled?.onPress());
    await flush();
    expect(state.auth.api.post).toHaveBeenCalledTimes(1);
    expect(state.auth.api.post).toHaveBeenCalledWith("/api/events/e1/participants", { email: "dan@b.c" });
    expect(state.texts).toContain("EVENT_CLOSED");
    expect(state.texts).not.toContain("Event is closed");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
