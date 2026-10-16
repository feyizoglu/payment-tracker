import { describe, it, expect } from "vitest";
import type { Occurrence } from "@ptracker/shared/types";
import { selectWidgetItems, widgetMonthUri, WIDGET_MAX_ROWS } from "./widget-items";

function occ(name: string, due: Date, over: Partial<Occurrence> = {}): Occurrence {
  return {
    kind: "recurring",
    sourceId: name,
    name,
    currency: "TRY",
    user_id: "u1",
    team_id: null,
    dueDate: due,
    amount: 100,
    isPaid: false,
    ...over,
  };
}

const TODAY = new Date(2026, 9, 16, 14, 30); // 16 Oct 2026, mid-afternoon

describe("selectWidgetItems", () => {
  it("puts overdue first, then the next 7 days, each by due date", () => {
    const { items } = selectWidgetItems(
      [
        occ("soon", new Date(2026, 9, 18)),
        occ("late-recent", new Date(2026, 9, 15)),
        occ("today", new Date(2026, 9, 16)),
        occ("late-old", new Date(2026, 8, 30)),
      ],
      TODAY
    );
    expect(items.map((i) => [i.name, i.overdue])).toEqual([
      ["late-old", true],
      ["late-recent", true],
      ["today", false],
      ["soon", false],
    ]);
  });

  it("includes day +7 and excludes day +8", () => {
    const { items } = selectWidgetItems(
      [occ("d7", new Date(2026, 9, 23)), occ("d8", new Date(2026, 9, 24))],
      TODAY
    );
    expect(items.map((i) => i.name)).toEqual(["d7"]);
  });

  it("drops paid occurrences", () => {
    const { items } = selectWidgetItems([occ("paid", new Date(2026, 9, 17), { isPaid: true })], TODAY);
    expect(items).toEqual([]);
  });

  it("caps the rows and counts the rest", () => {
    const many = Array.from({ length: WIDGET_MAX_ROWS + 2 }, (_, i) => occ(`p${i}`, new Date(2026, 9, 17)));
    const { items, moreCount } = selectWidgetItems(many, TODAY);
    expect(items).toHaveLength(WIDGET_MAX_ROWS);
    expect(moreCount).toBe(2);
  });

  it("keeps the fields the widget row needs, null amount included", () => {
    const { items } = selectWidgetItems([occ("x", new Date(2026, 9, 17), { amount: null, user_id: "u9", period: "2026-10-01" })], TODAY);
    expect(items[0]).toEqual({
      key: "recurring-x-2026-10-01-TRY",
      name: "x",
      dueDate: "2026-10-17",
      amount: null,
      currency: "TRY",
      userId: "u9",
      overdue: false,
    });
  });
});

describe("widgetMonthUri", () => {
  it("links to the payment's month with a tap marker", () => {
    expect(widgetMonthUri("2026-10-17", 123)).toBe("paymenttracker:///?month=2026-10&tap=123");
  });
});
