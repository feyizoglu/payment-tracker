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
        createElement(CalendarView, { payments: [], onUpdated: () => {}, initialDate: new Date(2026, 10, 1) })
      )
    );

    expect(html).toContain("November 2026");
    expect(html).not.toContain("May 2026</h2>");
  });
});
