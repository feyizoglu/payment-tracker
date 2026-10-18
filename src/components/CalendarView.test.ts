import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageProvider } from "@/lib/i18n";
import CalendarView from "@/components/CalendarView";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 15, 9, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CalendarView initialDate", () => {
  it("opens on the initialDate month instead of the current one", () => {
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        { initialLang: "en" },
        createElement(CalendarView, { payments: [], onUpdated: () => {}, onTogglePaid: async () => {}, initialDate: new Date(2026, 10, 1) })
      )
    );

    expect(html).toContain("November 2026");
    expect(html).not.toContain("May 2026</h2>");
  });

  it("selects the first day of the initialDate month in another month", () => {
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        { initialLang: "en" },
        createElement(CalendarView, { payments: [], onUpdated: () => {}, onTogglePaid: async () => {}, initialDate: new Date(2026, 10, 1) })
      )
    );

    expect(html).toMatch(/<h3[^>]*>1 November 2026</);
    expect(html).not.toContain("15 May 2026");
  });

  it("selects today when initialDate is in the current month", () => {
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        { initialLang: "en" },
        createElement(CalendarView, { payments: [], onUpdated: () => {}, onTogglePaid: async () => {}, initialDate: new Date(2026, 4, 1) })
      )
    );

    expect(html).toMatch(/<h3[^>]*>15 May 2026</);
  });
});
