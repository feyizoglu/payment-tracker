import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { Occurrence, Payment } from "@/types";

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
vi.mock("lucide-react", () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
  CheckCircle2: () => null,
  Circle: () => null,
  Trash2: () => null,
  Pencil: () => null,
}));

import { LanguageProvider } from "@/lib/i18n";
import CalendarView from "@/components/CalendarView";

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

const loan: Payment = {
  id: "p-1",
  team_id: null,
  user_id: "u-1",
  name: "Loan",
  amount: 100,
  currency: "TRY",
  start_date: "2026-11-01",
  day_of_month: 1,
  total_installments: 3,
  paid_installments: 0,
  created_at: "",
};

function tick() {
  const button = host.nodes.findLast(
    (n) => n.type === "button" && String(n.props.className).includes("hover:scale-110")
  );
  if (!button) throw new Error("tick button not rendered");
  return button.props as { disabled?: boolean; onClick: () => void };
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

describe("CalendarView tick", () => {
  it("hands the occurrence to onTogglePaid, disables the tick while pending and never calls onUpdated", async () => {
    let resolve: () => void = () => undefined;
    const onTogglePaid = vi.fn<(o: Occurrence) => Promise<void>>(() => new Promise<void>((r) => (resolve = r)));
    const onUpdated = vi.fn();
    root = createRoot(container());
    await act(async () =>
      root?.render(
        createElement(
          LanguageProvider,
          { initialLang: "en" },
          createElement(CalendarView, { payments: [loan], onUpdated, onTogglePaid, initialDate: new Date(2026, 10, 1) })
        )
      )
    );
    expect(tick().disabled).toBe(false);

    await act(async () => {
      tick().onClick();
    });
    expect(onTogglePaid).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "installment", sourceId: "p-1", installmentIndex: 0 })
    );
    expect(tick().disabled).toBe(true);

    await act(async () => resolve());
    await flush();
    expect(tick().disabled).toBe(false);
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("re-enables the tick when onTogglePaid rejects", async () => {
    const onTogglePaid = vi.fn<(o: Occurrence) => Promise<void>>(() => Promise.reject(new Error("offline")));
    root = createRoot(container());
    await act(async () =>
      root?.render(
        createElement(
          LanguageProvider,
          { initialLang: "en" },
          createElement(CalendarView, {
            payments: [loan],
            onUpdated: vi.fn(),
            onTogglePaid,
            initialDate: new Date(2026, 10, 1),
          })
        )
      )
    );

    await act(async () => {
      await expect((tick().onClick as () => Promise<void>)()).rejects.toThrow("offline");
    });
    await flush();

    expect(onTogglePaid).toHaveBeenCalledTimes(1);
    expect(tick().disabled).toBe(false);
  });
});
