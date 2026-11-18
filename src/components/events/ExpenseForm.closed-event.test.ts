import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { EventDetail, EventExpense } from "@/types";

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
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }));

import { LanguageProvider } from "@/lib/i18n";
import ExpenseForm from "@/components/events/ExpenseForm";

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

const participant = (id: string, display_name: string) => ({ id, event_id: "e1", user_id: null, display_name, created_at: "" });

const event = {
  id: "e1",
  name: "Trip",
  event_date: null,
  created_by: "u1",
  status: "open",
  created_at: "",
  participants: [participant("p1", "Ann"), participant("p2", "Ben")],
  expenses: [],
  settlements: [],
} as unknown as EventDetail;

const stored: EventExpense = {
  id: "x1",
  event_id: "e1",
  description: "Dinner",
  amount_minor: 1000,
  currency: "TRY",
  paid_by: "p1",
  spent_on: "2026-10-16",
  created_by: "u1",
  created_at: "",
  shares: [
    { participant_id: "p1", amount_minor: 500 },
    { participant_id: "p2", amount_minor: 500 },
  ],
};

function form() {
  const node = host.nodes.findLast((n) => n.type === "form");
  if (!node) throw new Error("form not rendered");
  return node.props as { onSubmit: (e: { preventDefault: () => void }) => Promise<void> };
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

describe("ExpenseForm submit", () => {
  it("shows the closed-event error in the user's language on a 409", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "Event is closed" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    root = createRoot(container());
    await act(async () =>
      root?.render(
        createElement(
          LanguageProvider,
          { initialLang: "en" },
          createElement(ExpenseForm, { event, expense: stored, onDone, onCancel: () => {} })
        )
      )
    );
    await act(async () => {
      await form().onSubmit({ preventDefault: () => {} });
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/events/e1/expenses/x1", expect.objectContaining({ method: "PUT" }));
    expect(errorText()?.props.children).toBe("This event is closed");
    expect(onDone).not.toHaveBeenCalled();
  });
});
