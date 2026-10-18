import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { EventDetail } from "@ptracker/shared/types";

type PressableProps = { onPress: () => void; disabled?: boolean };

const state = vi.hoisted(() => ({
  pressables: new Set<{ current: { onPress: () => void; disabled?: boolean } }>(),
  auth: {
    api: { get: async () => [] as unknown[], del: async () => undefined as unknown },
    user: { id: "u1", email: "a@b.c", name: "A" } as { id: string; email: string; name: string } | null,
  },
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h, useEffect, useRef } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  function Pressable(props: PressableProps & { children?: unknown }) {
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
  return { Pressable, Text: () => null, View: pass };
});
vi.mock("expo-router", () => ({ router: { back: vi.fn() } }));
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t: {} }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/ui/select-field", () => ({ SelectField: () => null }));
vi.mock("@/components/ui/text-field", () => ({ TextField: () => null }));

import { router } from "expo-router";
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

const participant = (id: string, user_id: string, display_name: string) => ({
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
  participants: [participant("p1", "u1", "Ann"), participant("p2", "u2", "Ben"), participant("p3", "u3", "Cem")],
  expenses: [],
  settlements: [],
} as unknown as EventDetail;

async function render(userId: string, onChanged: () => void = () => {}) {
  state.auth.user = { id: userId, email: `${userId}@b.c`, name: userId };
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(Participants, { event, editable: true, onChanged })));
  await flush();
}

const pressables = () => [...state.pressables].map((r) => r.current);

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.pressables.clear();
  state.auth.api.del = vi.fn(async () => undefined);
  vi.mocked(router.back).mockClear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("Participants remove buttons", () => {
  it("gives a non-creator a remove button only on their own chip", async () => {
    await render("u2");
    expect(pressables()).toHaveLength(1);
  });

  it("gives the creator a remove button on every other participant", async () => {
    await render("u1");
    expect(pressables()).toHaveLength(2);
  });
});

describe("Participants remove", () => {
  it("goes back instead of refreshing when the viewer leaves", async () => {
    const onChanged = vi.fn();
    await render("u2", onChanged);
    await act(async () => pressables()[0].onPress());
    await flush();
    expect(state.auth.api.del).toHaveBeenCalledWith("/api/events/e1/participants/p2");
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("refreshes instead of going back when the creator removes someone else", async () => {
    const onChanged = vi.fn();
    await render("u1", onChanged);
    await act(async () => pressables()[0].onPress());
    await flush();
    expect(state.auth.api.del).toHaveBeenCalledWith("/api/events/e1/participants/p2");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });
});
