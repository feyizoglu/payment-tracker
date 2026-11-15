import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/games/GamesShell", () => ({ default: () => null }));
vi.mock("@/components/games/scale/ScaleGame", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { scaleTitle: "Scale" } }) }));

import GamesShell from "@/components/games/GamesShell";
import ScaleGame from "@/components/games/scale/ScaleGame";
import ScalePage from "./page";

type Node = ReactElement<{ title?: string; backHref?: string; children?: ReactElement }>;

describe("ScalePage", () => {
  it("shows Scale in the games shell titled with the game's name, back to the games list", () => {
    const page = ScalePage() as Node;

    expect(page.type).toBe(GamesShell);
    expect(page.props).toMatchObject({ title: "Scale", backHref: "/games" });
    expect(page.props.children?.type).toBe(ScaleGame);
  });
});
