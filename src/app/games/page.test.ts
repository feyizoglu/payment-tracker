import { describe, it, expect, vi } from "vitest";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("lucide-react", () => ({ ChevronRight: () => null, MessageSquareText: () => null, VenetianMask: () => null }));
vi.mock("@/components/games/GamesShell", () => ({
  default: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
}));
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({} as Record<string, string>, { get: (_, key) => String(key) }) }),
}));

import GamesPage from "./page";

const html = () => renderToStaticMarkup(createElement(GamesPage));

describe("GamesPage", () => {
  it("links the word game after the Imposter game", () => {
    const hrefs = [...html().matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);

    expect(hrefs).toEqual(["/games/imposter", "/games/word"]);
  });

  it("shows the word game's title and description on its link", () => {
    const link = html().match(/<a href="\/games\/word"[^>]*>(.*?)<\/a>/)?.[1] ?? "";

    expect(link).toMatch(/>wordTitle<\/p><p[^>]*>wordDesc<\/p>/);
  });
});
