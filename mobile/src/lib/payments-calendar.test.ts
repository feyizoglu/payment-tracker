import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { Occurrence } from "@ptracker/shared/types";

interface Rec {
  type: "View" | "Text" | "Pressable";
  props: Record<string, unknown>;
}

const rendered = vi.hoisted(() => ({ records: [] as Rec[] }));

vi.mock("react-native", async () => {
  const { Fragment, createElement: h } = await import("react");
  const host =
    (type: Rec["type"], renderChildren: boolean) =>
    (props: Record<string, unknown>) => {
      rendered.records.push({ type, props });
      return renderChildren ? h(Fragment, null, props.children as never) : null;
    };
  return { View: host("View", true), Pressable: host("Pressable", true), Text: host("Text", false) };
});
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({ t: { noPaymentsThisDay: "none" }, lang: "en" }),
}));
vi.mock("@/components/occurrence-row", () => ({ OccurrenceRow: () => null }));

import { PaymentsCalendar } from "@/components/payments-calendar";
import type { People } from "./people";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot: (container: unknown) => Root;
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Cell {
  date: Date;
  inMonth: boolean;
  views: Record<string, unknown>[];
}

let root: Root | null = null;
const onSelectDay = vi.fn<(d: Date) => void>();

function container() {
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...listeners }, ...listeners };
}

async function renderCalendar(year: number, month: number, occurrences: Occurrence[], people: People = {}) {
  rendered.records = [];
  root = createRoot(container());
  await act(async () =>
    root?.render(
      createElement(PaymentsCalendar, {
        year,
        month,
        occurrences,
        people,
        selectedDay: null,
        onSelectDay,
        busyKey: null,
        onTogglePaid: () => undefined,
        onEdit: () => undefined,
        onEditSeries: () => undefined,
      })
    )
  );
  return cells();
}

function cells(): Cell[] {
  const out: Cell[] = [];
  for (const rec of rendered.records) {
    if (rec.type === "Pressable") {
      onSelectDay.mockClear();
      (rec.props.onPress as () => void)();
      out.push({ date: onSelectDay.mock.calls[0][0], inMonth: rec.props.disabled === false, views: [] });
    } else if (rec.type === "View" && out.length > 0) {
      out[out.length - 1].views.push(rec.props);
    }
  }
  return out;
}

function cellFor(all: Cell[], year: number, month: number, day: number): Cell {
  const cell = all.find(
    (c) => c.date.getFullYear() === year && c.date.getMonth() === month && c.date.getDate() === day
  );
  if (!cell) throw new Error(`no cell for ${year}-${month + 1}-${day}`);
  return cell;
}

function circleClass(cell: Cell): string {
  return String(cell.views[0].className);
}

function dotColors(cell: Cell): string[] {
  return cell.views
    .map((v) => (v.style as { backgroundColor?: string } | undefined)?.backgroundColor)
    .filter((c): c is string => typeof c === "string");
}

function occ(sourceId: string, day: Date, userId: string, isPaid: boolean): Occurrence {
  return {
    kind: "recurring",
    sourceId,
    name: sourceId,
    currency: "TRY",
    user_id: userId,
    team_id: null,
    dueDate: day,
    amount: 10,
    isPaid,
    period: "2026-07",
  };
}

beforeEach(() => {
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 6, 2, 12));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PaymentsCalendar today highlight", () => {
  it("highlights today's cell when today is in the shown month", async () => {
    const all = await renderCalendar(2026, 6, []);
    expect(circleClass(cellFor(all, 2026, 6, 2))).toContain("bg-brand");
  });

  it("does not highlight any other day of the shown month", async () => {
    const all = await renderCalendar(2026, 6, []);
    const highlighted = all.filter((c) => circleClass(c).includes("bg-brand"));
    expect(highlighted.map((c) => c.date.getDate())).toEqual([2]);
  });

  it("does not highlight today when it only appears as a trailing day of the previous month", async () => {
    const all = await renderCalendar(2026, 5, []);
    const today = cellFor(all, 2026, 6, 2);
    expect(today.inMonth).toBe(false);
    expect(circleClass(today)).not.toContain("bg-brand");
  });
});

describe("PaymentsCalendar dot colour", () => {
  const people: People = { u2: { name: "B", color: "#123456" } };

  it("paints a paid occurrence green even when its person has a colour", async () => {
    const all = await renderCalendar(2026, 6, [occ("s1", new Date(2026, 6, 10), "u2", true)], people);
    expect(dotColors(cellFor(all, 2026, 6, 10))).toEqual(["#86EFAC"]);
  });

  it("paints an unpaid occurrence in its person's colour", async () => {
    const all = await renderCalendar(2026, 6, [occ("s1", new Date(2026, 6, 10), "u2", false)], people);
    expect(dotColors(cellFor(all, 2026, 6, 10))).toEqual(["#123456"]);
  });
});

describe("PaymentsCalendar dot cap", () => {
  it("draws at most four dots for a day with five occurrences", async () => {
    const day = new Date(2026, 6, 20);
    const five = ["a", "b", "c", "d", "e"].map((id) => occ(id, day, "u1", false));
    const all = await renderCalendar(2026, 6, five);
    expect(dotColors(cellFor(all, 2026, 6, 20))).toHaveLength(4);
  });

  it("draws one dot per occurrence below the cap", async () => {
    const day = new Date(2026, 6, 20);
    const three = ["a", "b", "c"].map((id) => occ(id, day, "u1", false));
    const all = await renderCalendar(2026, 6, three);
    expect(dotColors(cellFor(all, 2026, 6, 20))).toHaveLength(3);
  });
});
