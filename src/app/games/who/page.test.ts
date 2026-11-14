import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/games/GamesShell", () => ({ default: () => null }));
vi.mock("@/components/games/who/WhoGame", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { whoTitle: "Who Am I?" } }) }));

import GamesShell from "@/components/games/GamesShell";
import WhoGame from "@/components/games/who/WhoGame";
import WhoPage from "./page";

type Node = ReactElement<{ title?: string; backHref?: string; children?: ReactElement }>;

describe("WhoPage", () => {
  it("shows Who Am I? in the games shell titled with the game's name, back to the games list", () => {
    const page = WhoPage() as Node;

    expect(page.type).toBe(GamesShell);
    expect(page.props).toMatchObject({ title: "Who Am I?", backHref: "/games" });
    expect(page.props.children?.type).toBe(WhoGame);
  });
});
