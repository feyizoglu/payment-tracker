import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/games/GamesShell", () => ({ default: () => null }));
vi.mock("@/components/games/tower/TowerGame", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { towerTitle: "Book Tower" } }) }));

import GamesShell from "@/components/games/GamesShell";
import TowerGame from "@/components/games/tower/TowerGame";
import TowerPage from "./page";

type Node = ReactElement<{ title?: string; backHref?: string; children?: ReactElement }>;

describe("TowerPage", () => {
  it("shows Book Tower in the games shell titled with the game's name, back to the games list", () => {
    const page = TowerPage() as Node;

    expect(page.type).toBe(GamesShell);
    expect(page.props).toMatchObject({ title: "Book Tower", backHref: "/games" });
    expect(page.props.children?.type).toBe(TowerGame);
  });
});
