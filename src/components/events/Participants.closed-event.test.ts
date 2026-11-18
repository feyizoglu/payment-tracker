import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { EventDetail } from "@/types";

const host = vi.hoisted(() => {
  const nodes: Array<{ type: string; props: Record<string, unknown> }> = [];
  const keep = (c: unknown): unknown =>
    Array.isArray(c) ? c.map(keep) : typeof c === "string" || typeof c === "number" ? null : c;
  const Host = ({ __type, ...props }: { __type: string; children?: unknown }) => {
    nodes.push({ type: __type, props });
    return keep(props.children) ?? null;
  };
  const wrap =
    (fn: (...args: unknown[]) => unknown) =>
    (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) =>
      typeof type === "string" ? fn(Host, { ...props, __type: type }, ...rest) : fn(type, props, ...rest);
  return { nodes, wrap };
});

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsx: host.wrap(actual.jsx), jsxs: host.wrap(actual.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsxDEV: host.wrap(actual.jsxDEV) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("lucide-react", () => ({ Plus: () => null, X: () => null }));

import { LanguageProvider } from "@/lib/i18n";
import Participants from "@/components/events/Participants";

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

function emailInput() {
  const node = host.nodes.findLast((n) => n.type === "input" && n.props.type === "email");
  if (!node) throw new Error("email input not rendered");
  return node.props as { onChange: (e: { target: { value: string } }) => void };
}

function enabledAddButton() {
  const node = host.nodes.findLast((n) => n.type === "button" && n.props["aria-label"] === "Add participant" && !n.props.disabled);
  if (!node) throw new Error("no enabled add button");
  return node.props as { onClick: () => void };
}

const errorText = () => host.nodes.findLast((n) => n.type === "p" && String(n.props.className).includes("text-red-600"));

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  host.nodes.length = 0;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("Participants add", () => {
  it("shows the closed-event error in the user's language on a 409", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ error: "Event is closed" }), { status: 409 })
        : new Response(JSON.stringify([]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    root = createRoot(container());
    await act(async () =>
      root?.render(
        createElement(
          LanguageProvider,
          { initialLang: "en" },
          createElement(Participants, { event, myId: "u1", editable: true, onChanged: () => {} })
        )
      )
    );
    await act(async () => emailInput().onChange({ target: { value: "dan@b.c" } }));
    await act(async () => {
      enabledAddButton().onClick();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/events/e1/participants",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "dan@b.c" }) })
    );
    expect(errorText()?.props.children).toBe("This event is closed");
  });
});

describe("Participants remove", () => {
  const withGuest = {
    ...event,
    participants: [
      ...event.participants,
      { id: "p2", event_id: "e1", user_id: "u2", display_name: "Bob", created_at: "" },
    ],
  } as unknown as EventDetail;

  async function removeBob(error: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error }), { status: 409 }))
    );
    root = createRoot(container());
    await act(async () =>
      root?.render(
        createElement(
          LanguageProvider,
          { initialLang: "en" },
          createElement(Participants, { event: withGuest, myId: "u1", editable: true, onChanged: () => {} })
        )
      )
    );
    const button = host.nodes.findLast((n) => n.type === "button" && n.props["aria-label"] === "Delete");
    if (!button) throw new Error("no remove button");
    await act(async () => {
      (button.props as { onClick: () => void }).onClick();
    });
    return errorText()?.props.children;
  }

  it("says the event is closed when it was closed after the page loaded", async () => {
    expect(await removeBob("Event is closed")).toBe("This event is closed");
  });

  it("keeps the cannot-remove message for any other 409", async () => {
    expect(await removeBob("Participant has expenses or payments")).toBe(
      "This person has expenses or payments"
    );
  });
});
