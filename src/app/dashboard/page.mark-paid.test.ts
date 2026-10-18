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
  CreditCard: () => null,
  Plus: () => null,
  LogOut: () => null,
  LayoutGrid: () => null,
  Calendar: () => null,
  Users: () => null,
  ChevronDown: () => null,
  CalendarRange: () => null,
}));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", name: "Test", email: "t@example.com", image: null } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("month=2026-11"),
}));
vi.mock("@/components/PushToggle", () => ({ default: () => null }));
vi.mock("@/components/PayUntil", () => ({ default: () => null }));
vi.mock("@/components/ThemePicker", () => ({ default: () => null }));
vi.mock("@/components/CalendarView", () => ({
  default: (props: { payments: Payment[]; onTogglePaid: (o: Occurrence) => Promise<void> }) => {
    calendar.props = props;
    return null;
  },
}));

const calendar = vi.hoisted(() => ({
  props: null as null | { payments: Payment[]; onTogglePaid: (o: Occurrence) => Promise<void> },
}));

import { LanguageProvider } from "@/lib/i18n";
import DashboardPage from "./page";

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
  start_date: "2026-09-01",
  day_of_month: 1,
  total_installments: 12,
  paid_installments: 2,
  created_at: "",
};

const installment: Occurrence = {
  kind: "installment",
  sourceId: "p-1",
  name: "Loan",
  currency: "TRY",
  user_id: "u-1",
  team_id: null,
  dueDate: new Date(2026, 10, 1),
  amount: 100,
  isPaid: false,
  installmentIndex: 2,
  totalInstallments: 12,
};

type Reply = { ok: boolean; json: () => Promise<unknown> };
const reply = (body: unknown, ok = true): Reply => ({ ok, json: async () => body });

function stubFetch(onPatch: () => Promise<Reply>) {
  const fetch = vi.fn(async (url: string, init?: { method?: string }) => {
    if (init?.method === "PATCH") return onPatch();
    if (url === "/api/payments?filter=all") return reply([loan]);
    return reply([]);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const fetchesOf = (fetch: ReturnType<typeof stubFetch>, url: string) =>
  fetch.mock.calls.filter(([u, init]) => u === url && !init).length;

function view() {
  if (!calendar.props) throw new Error("CalendarView not rendered");
  return calendar.props;
}

async function render() {
  root = createRoot(container());
  await act(async () =>
    root?.render(createElement(LanguageProvider, { initialLang: "en" }, createElement(DashboardPage)))
  );
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  calendar.props = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("DashboardPage togglePaid", () => {
  it("sends the next count and keeps the server's count without refetching", async () => {
    const fetch = stubFetch(async () => reply({ ...loan, paid_installments: 5 }));
    await render();

    await act(async () => view().onTogglePaid(installment));

    const patch = fetch.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patch?.[0]).toBe("/api/payments/p-1");
    expect(JSON.parse(String((patch?.[1] as { body?: string }).body))).toEqual({ paid_installments: 3 });
    expect(view().payments[0].paid_installments).toBe(5);
    expect(fetchesOf(fetch, "/api/payments?filter=all")).toBe(1);
  });

  it("refetches both lists and reverts to the server's count when the update is refused", async () => {
    const fetch = stubFetch(async () => reply({ error: "x" }, false));
    await render();

    await act(async () => view().onTogglePaid(installment));

    expect(fetchesOf(fetch, "/api/payments?filter=all")).toBe(2);
    expect(fetchesOf(fetch, "/api/recurring?filter=all")).toBe(2);
    expect(view().payments[0].paid_installments).toBe(2);
  });

  it("refetches both lists and reverts to the server's count when the request fails", async () => {
    const fetch = stubFetch(async () => {
      throw new Error("offline");
    });
    await render();

    await act(async () => view().onTogglePaid(installment));

    expect(fetchesOf(fetch, "/api/payments?filter=all")).toBe(2);
    expect(fetchesOf(fetch, "/api/recurring?filter=all")).toBe(2);
    expect(view().payments[0].paid_installments).toBe(2);
  });

  it("undoes the tick and settles when the refetch fails too", async () => {
    const fetch = stubFetch(async () => {
      throw new Error("offline");
    });
    await render();
    fetch.mockImplementation(async () => {
      throw new Error("offline");
    });

    await act(async () => expect(view().onTogglePaid(installment)).resolves.toBeUndefined());

    expect(view().payments[0].paid_installments).toBe(2);
  });
});
