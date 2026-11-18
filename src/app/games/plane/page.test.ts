import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/games/GamesShell", () => ({ default: () => null }));
vi.mock("@/components/games/plane/PlaneGame", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { planeTitle: "Paper Plane" } }) }));

import GamesShell from "@/components/games/GamesShell";
import PlaneGame from "@/components/games/plane/PlaneGame";
import PlanePage from "./page";

type Node = ReactElement<{ title?: string; backHref?: string; children?: ReactElement }>;

describe("PlanePage", () => {
  it("shows Paper Plane in the games shell titled with the game's name, back to the games list", () => {
    const page = PlanePage() as Node;

    expect(page.type).toBe(GamesShell);
    expect(page.props).toMatchObject({ title: "Paper Plane", backHref: "/games" });
    expect(page.props.children?.type).toBe(PlaneGame);
  });
});
