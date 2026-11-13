import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/games/GamesShell", () => ({ default: () => null }));
vi.mock("@/components/games/word/WordGame", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { wordTitle: "Describe It" } }) }));

import GamesShell from "@/components/games/GamesShell";
import WordGame from "@/components/games/word/WordGame";
import WordGamePage from "./page";

type Node = ReactElement<{ title?: string; backHref?: string; children?: ReactElement }>;

describe("WordGamePage", () => {
  it("shows the word game in the games shell titled with the game's name, back to the games list", () => {
    const page = WordGamePage() as Node;

    expect(page.type).toBe(GamesShell);
    expect(page.props).toMatchObject({ title: "Describe It", backHref: "/games" });
    expect(page.props.children?.type).toBe(WordGame);
  });
});
