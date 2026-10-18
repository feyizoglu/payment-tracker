import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { Occurrence, Payment } from "@ptracker/shared/types";

const state = vi.hoisted(() => ({
  texts: [] as unknown[],
  params: {} as { month?: string; tap?: string },
  header: null as null | {
    year: number;
    month: number;
    onNext: () => void;
    onToggleView: (v: string) => void;
  },
  calendar: null as null | { selectedDay: Date | null; onSelectDay: (d: Date) => void },
  list: null as null | { occurrences: Occurrence[]; onTogglePaid: (o: Occurrence) => Promise<void> },
  auth: {
    api: { get: async () => [] as unknown[], patch: async () => undefined, put: async () => undefined },
    user: { id: "u1", email: "a@b.c", name: "A" },
  },
}));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return {
    ActivityIndicator: () => null,
    Pressable: pass,
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
    router: { push: vi.fn() },
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
    useLocalSearchParams: () => state.params,
  };
});
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t: {} }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/widget-refresh", () => ({ refreshWidget: vi.fn() }));
vi.mock("@/components/tab-screen", async () => {
  const { Fragment, createElement: h } = await import("react");
  return { TabScreen: ({ children }: { children?: unknown }) => h(Fragment, null, children as never) };
});
vi.mock("@/components/month-header", () => ({
  MonthHeader: (props: NonNullable<typeof state.header>) => {
    state.header = props;
    return null;
  },
}));
vi.mock("@/components/month-list", () => ({
  MonthList: (props: NonNullable<typeof state.list>) => {
    state.list = props;
    return null;
  },
}));
vi.mock("@/components/payments-calendar", () => ({
  PaymentsCalendar: (props: NonNullable<typeof state.calendar>) => {
    state.calendar = props;
    return null;
  },
}));

import Payments from "@/app/(app)/index";
import { refreshWidget } from "@/lib/widget-refresh";

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

async function render() {
  if (!root) root = createRoot(container());
  await act(async () => root?.render(createElement(Payments)));
  await flush();
}

function header() {
  if (!state.header) throw new Error("MonthHeader not rendered");
  return state.header;
}

function calendar() {
  if (!state.calendar) throw new Error("PaymentsCalendar not rendered");
  return state.calendar;
}

async function browseAwayAndSelectDay() {
  await act(async () => header().onToggleView("calendar"));
  await act(async () => header().onNext());
  await act(async () => calendar().onSelectDay(new Date(2026, 3, 5)));
}

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  state.params = { month: "2026-03", tap: "n1" };
  state.header = null;
  state.calendar = null;
  state.list = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("Payments month/tap effect", () => {
  it("opens on the month a tapped reminder names", async () => {
    await render();
    expect({ year: header().year, month: header().month }).toEqual({ year: 2026, month: 2 });
  });

  it("moves the cursor back to the month on a second tap for the same month", async () => {
    await render();
    await browseAwayAndSelectDay();
    expect(header().month).toBe(3);
    state.params = { month: "2026-03", tap: "n2" };
    await render();
    expect({ year: header().year, month: header().month }).toEqual({ year: 2026, month: 2 });
  });

  it("clears the selected day on a second tap for the same month", async () => {
    await render();
    await browseAwayAndSelectDay();
    expect(calendar().selectedDay).not.toBeNull();
    state.params = { month: "2026-03", tap: "n2" };
    await render();
    expect(calendar().selectedDay).toBeNull();
  });

  it("leaves the browsed month alone when the params are unchanged", async () => {
    await render();
    await browseAwayAndSelectDay();
    state.params = { month: "2026-03", tap: "n1" };
    await render();
    expect(header().month).toBe(3);
  });
});

describe("Payments load", () => {
  beforeEach(() => {
    vi.mocked(refreshWidget).mockClear();
  });

  it("redraws the home screen widget after the payments load", async () => {
    await render();
    expect(refreshWidget).toHaveBeenCalled();
  });

  it("leaves the widget alone when the payments fail to load", async () => {
    const get = state.auth.api.get;
    state.auth.api.get = async () => {
      throw new Error("boom");
    };
    try {
      await render();
      expect(refreshWidget).not.toHaveBeenCalled();
    } finally {
      state.auth.api.get = get;
    }
  });
});

describe("Payments mark paid", () => {
  const loan: Payment = {
    id: "p-1",
    team_id: null,
    user_id: "u1",
    name: "Loan",
    amount: 100,
    currency: "TRY",
    start_date: "2026-01-15",
    day_of_month: 15,
    total_installments: 12,
    paid_installments: 2,
    created_at: "",
  };
  const original = { ...state.auth.api };
  const get = vi.fn(async (url: string) => (url === "/api/payments?filter=all" ? [loan] : []));
  const paymentFetches = () => get.mock.calls.filter(([url]) => url === "/api/payments?filter=all").length;

  function list() {
    if (!state.list) throw new Error("MonthList not rendered");
    return state.list;
  }

  const march = () => list().occurrences.find((o) => o.sourceId === "p-1")!;

  beforeEach(() => {
    get.mockClear();
    vi.mocked(refreshWidget).mockClear();
    Object.assign(state.auth.api, { get });
  });

  afterEach(() => {
    Object.assign(state.auth.api, original);
  });

  it("shows the tick before the request resolves and keeps the server's count without refetching", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    const patch = vi.fn(() => new Promise((r) => (resolve = r)));
    Object.assign(state.auth.api, { patch });
    await render();
    expect(march().isPaid).toBe(false);

    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = list().onTogglePaid(march());
    });
    expect(patch).toHaveBeenCalledWith("/api/payments/p-1", { paid_installments: 3 });
    expect(march().isPaid).toBe(true);

    await act(async () => {
      resolve({ ...loan, paid_installments: 5 });
      await pending;
    });
    await act(async () => header().onNext());
    expect(list().occurrences.find((o) => o.sourceId === "p-1")).toMatchObject({ installmentIndex: 3, isPaid: true });
    expect(refreshWidget).toHaveBeenCalledTimes(2);
    expect(paymentFetches()).toBe(1);
  });

  it("refetches and drops the tick when the request fails", async () => {
    const patch = vi.fn(async () => {
      throw new Error("offline");
    });
    Object.assign(state.auth.api, { patch });
    await render();

    await act(async () => {
      await list().onTogglePaid(march());
    });
    await flush();

    expect(paymentFetches()).toBe(2);
    expect(march().isPaid).toBe(false);
  });

  it("keeps the failure message on screen after the reload succeeds", async () => {
    const patch = vi.fn(async () => {
      throw new Error("Forbidden");
    });
    Object.assign(state.auth.api, { patch });
    await render();

    await act(async () => {
      await list().onTogglePaid(march());
    });
    state.texts = [];
    await render();

    expect(state.texts).toContain("Forbidden");
  });

  it("undoes the tick when the reload fails too", async () => {
    const patch = vi.fn(async () => {
      throw new Error("offline");
    });
    Object.assign(state.auth.api, { patch });
    await render();
    get.mockImplementation(async () => {
      throw new Error("offline");
    });

    await act(async () => {
      await list().onTogglePaid(march());
    });
    get.mockImplementation(async (url: string) => (url === "/api/payments?filter=all" ? [loan] : []));

    expect(march().isPaid).toBe(false);
  });
});
