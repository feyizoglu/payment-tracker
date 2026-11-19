import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("nativewind", () => ({ vars: (v: Record<string, string>) => ({ applied: v }) }));

import { GAME_DARK_TOKENS, gameDarkVars } from "@/lib/game-theme";

function darkTokensInCss(): Record<string, string> {
  const css = readFileSync(path.resolve(__dirname, "../../tailwind.css"), "utf8");
  const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
  return Object.fromEntries([...dark.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe("game theme", () => {
  it("is the dark palette of tailwind.css, token for token", () => {
    expect(GAME_DARK_TOKENS).toEqual(darkTokensInCss());
  });

  it("is handed to NativeWind as variables", () => {
    expect(gameDarkVars).toEqual({ applied: GAME_DARK_TOKENS });
  });

  it("themes indigo-50, Secret Word's tile, in both colour schemes and on the game screens", () => {
    const css = readFileSync(path.resolve(__dirname, "../../tailwind.css"), "utf8");
    const light = css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)"));
    expect(light).toMatch(/--indigo-50:\s*238 242 255;/);
    expect(darkTokensInCss()["--indigo-50"]).toBe("30 27 75");
    expect(GAME_DARK_TOKENS["--indigo-50"]).toBe("30 27 75");
    const config = readFileSync(path.resolve(__dirname, "../../tailwind.config.js"), "utf8");
    expect(config).toMatch(/indigo: \{ \.\.\.defaults\.indigo, \.\.\.themed\("indigo", \[50\]\) \}/);
    const games = readFileSync(path.resolve(__dirname, "../app/games/index.tsx"), "utf8");
    expect(games).toMatch(/bg-indigo-50[\s\S]*?🔤[\s\S]*?secretTitle/);
  });
});
