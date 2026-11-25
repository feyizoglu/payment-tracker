import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/games/GamesShell", () => ({ default: () => null }));
vi.mock("@/components/games/bills/HuntGame", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { huntTitle: "Bill Hunt" } }) }));

import GamesShell from "@/components/games/GamesShell";
import HuntGame from "@/components/games/bills/HuntGame";
import BillsPage from "./page";

type Node = ReactElement<{ title?: string; backHref?: string; children?: ReactElement }>;

describe("BillsPage", () => {
  it("shows Bill Hunt in the games shell titled with the game's name, back to the games list", () => {
    const page = BillsPage() as Node;

    expect(page.type).toBe(GamesShell);
    expect(page.props).toMatchObject({ title: "Bill Hunt", backHref: "/games" });
    expect(page.props.children?.type).toBe(HuntGame);
  });
});
