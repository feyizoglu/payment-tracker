import { describe, it, expect, vi } from "vitest";
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
}));

import { LanguageProvider } from "@/lib/i18n";
import EconomyPage from "./page";

describe("EconomyPage nav", () => {
  it("marks Economy as the current section in the shared nav", () => {
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, { initialLang: "en" }, createElement(EconomyPage))
    );
    const current = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? [];

    expect(current).toHaveLength(2);
    for (const tag of current) expect(tag).toContain('href="/economy"');
  });
});
