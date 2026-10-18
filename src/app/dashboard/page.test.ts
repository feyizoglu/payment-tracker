import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

import { LanguageProvider } from "@/lib/i18n";
import DashboardPage from "./page";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 15, 9, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DashboardPage month param", () => {
  it("opens the calendar on the month from the notification deep link", () => {
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, { initialLang: "en" }, createElement(DashboardPage))
    );

    expect(html).toContain("November 2026");
    expect(html).not.toContain("May 2026</h2>");
  });
});
