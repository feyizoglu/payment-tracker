import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/games/GamesShell", () => ({ default: () => null }));
vi.mock("@/components/games/potato/PotatoGame", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { potatoTitle: "Hot Potato" } }) }));

import GamesShell from "@/components/games/GamesShell";
import PotatoGame from "@/components/games/potato/PotatoGame";
import PotatoPage from "./page";

type Node = ReactElement<{ title?: string; backHref?: string; children?: ReactElement }>;

describe("PotatoPage", () => {
  it("shows Hot Potato in the games shell titled with the game's name, back to the games list", () => {
    const page = PotatoPage() as Node;

    expect(page.type).toBe(GamesShell);
    expect(page.props).toMatchObject({ title: "Hot Potato", backHref: "/games" });
    expect(page.props.children?.type).toBe(PotatoGame);
  });
});
