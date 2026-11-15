import { describe, it, expect, vi } from "vitest";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("lucide-react", () => ({
  ChevronRight: () => null,
  Flame: () => null,
  Gauge: () => null,
  MessageSquareText: () => null,
  Moon: () => null,
  UserRoundSearch: () => null,
  VenetianMask: () => null,
}));
vi.mock("@/components/games/GamesShell", () => ({
  default: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
}));
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({} as Record<string, string>, { get: (_, key) => String(key) }) }),
}));

import GamesPage from "./page";

const html = () => renderToStaticMarkup(createElement(GamesPage));

describe("GamesPage", () => {
  it("links the word game after the Imposter game, then Wolf Night, Hot Potato, Who Am I? and Scale", () => {
    const hrefs = [...html().matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);

    expect(hrefs).toEqual(["/games/imposter", "/games/word", "/games/wolf", "/games/potato", "/games/who", "/games/scale"]);
  });

  it("shows the word game's title and description on its link", () => {
    const link = html().match(/<a href="\/games\/word"[^>]*>(.*?)<\/a>/)?.[1] ?? "";

    expect(link).toMatch(/>wordTitle<\/p><p[^>]*>wordDesc<\/p>/);
  });

  it("shows Wolf Night's title and description on its link", () => {
    const link = html().match(/<a href="\/games\/wolf"[^>]*>(.*?)<\/a>/)?.[1] ?? "";

    expect(link).toMatch(/>wolfTitle<\/p><p[^>]*>wolfDesc<\/p>/);
  });

  it("shows Hot Potato's title and description on its link", () => {
    const link = html().match(/<a href="\/games\/potato"[^>]*>(.*?)<\/a>/)?.[1] ?? "";

    expect(link).toMatch(/>potatoTitle<\/p><p[^>]*>potatoDesc<\/p>/);
  });

  it("shows Who Am I?'s title and description on its link", () => {
    const link = html().match(/<a href="\/games\/who"[^>]*>(.*?)<\/a>/)?.[1] ?? "";

    expect(link).toMatch(/>whoTitle<\/p><p[^>]*>whoDesc<\/p>/);
  });

  it("shows Scale's title and description on its link", () => {
    const link = html().match(/<a href="\/games\/scale"[^>]*>(.*?)<\/a>/)?.[1] ?? "";

    expect(link).toMatch(/>scaleTitle<\/p><p[^>]*>scaleDesc<\/p>/);
  });
});
