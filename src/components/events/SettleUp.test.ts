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

import { LanguageProvider } from "@/lib/i18n";
import SettleUp from "@/components/events/SettleUp";

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
  expenses: [
    {
      id: "x1", event_id: "e1", description: "Dinner", amount_minor: 1000, currency: "TRY", paid_by: "p1",
      spent_on: "", created_by: "u1", created_at: "",
      shares: [{ participant_id: "p1", amount_minor: 500 }, { participant_id: "p2", amount_minor: 500 }],
    },
  ],
  settlements: [],
} as unknown as EventDetail;

function paidButton() {
  const button = host.nodes.findLast((n) => n.type === "button" && String(n.props.className).includes("bg-green-600"));
  if (!button) throw new Error("Paid button not rendered");
  return button.props as { onClick: () => void };
}

const errorText = () => host.nodes.findLast((n) => n.type === "p" && String(n.props.className).includes("text-red-600"));

async function renderAndPay(response: { status: number; body: unknown }) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(response.body), { status: response.status }));
  vi.stubGlobal("fetch", fetchMock);
  const onChanged = vi.fn();
  root = createRoot(container());
  await act(async () =>
    root?.render(createElement(LanguageProvider, { initialLang: "en" }, createElement(SettleUp, { event, isOpen: true, onChanged })))
  );
  await act(async () => {
    paidButton().onClick();
  });
  return { fetchMock, onChanged };
}

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  host.nodes.length = 0;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("SettleUp Paid", () => {
  it("records the suggested transfer and refreshes the event", async () => {
    const { fetchMock, onChanged } = await renderAndPay({ status: 201, body: { id: "s1" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/events/e1/settlements",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ from_participant: "p2", to_participant: "p1", amount_minor: 500, currency: "TRY" }),
      })
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("shows the server's message and refreshes the stale suggestion when the debt was already paid", async () => {
    const { onChanged } = await renderAndPay({ status: 409, body: { error: "Amount is more than the current debt" } });
    expect(errorText()?.props.children).toBe("Amount is more than the current debt");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("shows the error without refreshing on any other failure", async () => {
    const { onChanged } = await renderAndPay({ status: 500, body: { error: "Internal error" } });
    expect(errorText()?.props.children).toBe("Internal error");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
