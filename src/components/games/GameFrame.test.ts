import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { GAME_THEME } from "@/lib/imposter";
import GameFrame from "./GameFrame";

type Node = ReactElement<Record<string, unknown>>;

describe("GameFrame", () => {
  it("draws the game on its own dark background with the dark palette", () => {
    const tree = GameFrame({ children: "X" }) as Node;
    expect(tree.props.style).toEqual({ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text });
    expect(String(tree.props.className).split(" ")).toContain("dark");
    expect(tree.props.children).toBe("X");
  });

  it("takes a player's colour with dark text on it", () => {
    const tree = GameFrame({ color: "#FF6B6B", children: "X" }) as Node;
    expect(tree.props.style).toEqual({ backgroundColor: "#FF6B6B", color: GAME_THEME.ink });
  });
});
