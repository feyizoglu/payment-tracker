import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/games/GamesShell", () => ({ default: () => null }));
vi.mock("@/components/games/secret/SecretGame", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: { secretTitle: "Secret Word" } }) }));

import GamesShell from "@/components/games/GamesShell";
import SecretGame from "@/components/games/secret/SecretGame";
import SecretPage from "./page";

type Node = ReactElement<{ title?: string; backHref?: string; children?: ReactElement }>;

describe("SecretPage", () => {
  it("shows Secret Word in the games shell titled with the game's name, back to the games list", () => {
    const page = SecretPage() as Node;

    expect(page.type).toBe(GamesShell);
    expect(page.props).toMatchObject({ title: "Secret Word", backHref: "/games" });
    expect(page.props.children?.type).toBe(SecretGame);
  });
});
