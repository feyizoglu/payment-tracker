import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/games/GamesShell", () => ({ default: () => null }));
vi.mock("@/components/games/clue/ClueGame", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { clueTitle: "One Clue" } }) }));

import GamesShell from "@/components/games/GamesShell";
import ClueGame from "@/components/games/clue/ClueGame";
import CluePage from "./page";

type Node = ReactElement<{ title?: string; backHref?: string; children?: ReactElement }>;

describe("CluePage", () => {
  it("shows One Clue in the games shell titled with the game's name, back to the games list", () => {
    const page = CluePage() as Node;

    expect(page.type).toBe(GamesShell);
    expect(page.props).toMatchObject({ title: "One Clue", backHref: "/games" });
    expect(page.props.children?.type).toBe(ClueGame);
  });
});
