import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/games/GamesShell", () => ({ default: () => null }));
vi.mock("@/components/games/wolf/WolfGame", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { wolfTitle: "Wolf Night" } }) }));

import GamesShell from "@/components/games/GamesShell";
import WolfGame from "@/components/games/wolf/WolfGame";
import WolfPage from "./page";

type Node = ReactElement<{ title?: string; backHref?: string; children?: ReactElement }>;

describe("WolfPage", () => {
  it("shows the wolf game in the games shell titled with the game's name, back to the games list", () => {
    const page = WolfPage() as Node;

    expect(page.type).toBe(GamesShell);
    expect(page.props).toMatchObject({ title: "Wolf Night", backHref: "/games" });
    expect(page.props.children?.type).toBe(WolfGame);
  });
});
