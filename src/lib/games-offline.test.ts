import { describe, it, expect } from "vitest";
import { GAMES_CACHE, GAMES_PAGES, gamesCacheUrls } from "@/lib/games-offline";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sw = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");

describe("games offline helper", () => {
  it("uses the same cache name and pages as the service worker", () => {
    expect(sw).toContain(`const GAMES_CACHE = "${GAMES_CACHE}";`);
    expect(sw).toContain(`const GAMES_PAGES = ${JSON.stringify(GAMES_PAGES).replace(/,/g, ", ")};`);
  });

  it("lists the games pages plus the same-origin static files the page loaded", () => {
    const origin = "https://paytrack.example";
    const entries = [
      { name: `${origin}/_next/static/chunks/a.js` },
      { name: `${origin}/_next/static/media/font.woff2` },
      { name: `${origin}/api/auth/session` },
      { name: "https://other.example/_next/static/chunks/b.js" },
      { name: `${origin}/_next/static/chunks/a.js` },
    ];
    expect(gamesCacheUrls(entries, origin)).toEqual([
      "/games",
      "/games/imposter",
      "/_next/static/chunks/a.js",
      "/_next/static/media/font.woff2",
    ]);
  });
});
