import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecurringPayment } from "@/types";
import { LanguageProvider } from "@/lib/i18n";
import DateRangeReport from "@/components/DateRangeReport";

// The report moved from raw installments to occurrences and took an optional
// `recurrings` prop, so a recurring reminder must now show up in the list AND in the
// due/remaining totals. Vitest runs in a node environment with no jsdom, so the
// component is exercised by server-rendering it (createElement because JSX cannot live
// in a .ts file). Only the default range matters here, which the frozen clock pins to
// 2026-08-13 → 2026-09-13.

function makeRecurring(over: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    id: "r1",
    team_id: null,
    user_id: "u1",
    name: "Kira",
    currency: "TRY",
    day_of_month: 20,
    start_month: "2026-08-01",
    end_month: "2026-08-01", // a single occurrence inside the default range
    created_at: "2026-08-01T00:00:00Z",
    entries: [
      {
        id: "e1",
        recurring_id: "r1",
        period: "2026-08-01",
        amount: 500,
        is_paid: false,
        paid_at: null,
        due_date: null,
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
    ...over,
  };
}

// The three summary cards (due, paid, remaining) are the only `break-all` values in the
// markup, in that order.
function summary(html: string): string[] {
  return [...html.matchAll(/break-all">([^<]*)</g)].map((m) => m[1]);
}

// Amounts follow the rendered language, so the provider's language is part of the
// fixture: the default is English (dot decimals), "tr" gives Turkish (comma decimals).
function render(recurrings?: RecurringPayment[], initialLang: "en" | "tr" = "en"): string {
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      { initialLang },
      createElement(DateRangeReport, { payments: [], recurrings, onClose: () => {} })
    )
  );
}

describe("DateRangeReport recurring reminders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 13, 9, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists a recurring reminder that falls inside the range", () => {
    expect(render([makeRecurring()])).toContain("Kira");
  });

  it("counts an unpaid recurring reminder in the total due", () => {
    const [due] = summary(render([makeRecurring()]));
    expect(due).toBe("₺500.00");
  });

  it("counts an unpaid recurring reminder in the remaining total, not the paid total", () => {
    const [, paid, remaining] = summary(render([makeRecurring()]));
    expect(paid).toBe("₺0.00");
    expect(remaining).toBe("₺500.00");
  });

  it("counts a paid recurring reminder in the paid total instead of the remaining one", () => {
    const paid = makeRecurring({
      entries: [
        {
          id: "e1",
          recurring_id: "r1",
          period: "2026-08-01",
          amount: 500,
          is_paid: true,
          paid_at: "2026-08-20T00:00:00Z",
          due_date: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });
    const [due, paidTotal, remaining] = summary(render([paid]));
    expect(due).toBe("₺500.00");
    expect(paidTotal).toBe("₺500.00");
    expect(remaining).toBe("₺0.00");
  });

  it("renders the empty state when the optional recurrings prop is omitted", () => {
    const html = render(undefined);
    expect(html).not.toContain("Kira");
  });

  it("formats the totals in the selected language", () => {
    // The report used to print Turkish decimal commas regardless of language.
    const [dueEn] = summary(render([makeRecurring()], "en"));
    const [dueTr] = summary(render([makeRecurring()], "tr"));
    expect(dueEn).toBe("₺500.00");
    expect(dueTr).toBe("₺500,00");
  });
});
