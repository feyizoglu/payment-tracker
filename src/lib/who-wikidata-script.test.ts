import { describe, it, expect, vi, afterEach } from "vitest";

const fs = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async () => ""),
  writeFile: vi.fn(async () => undefined),
}));

vi.mock("node:fs/promises", () => fs);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Who Am I? Wikidata script", () => {
  it("starts no run when it is imported", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await import("../../scripts/who-game/fetch-wikidata.mjs");
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
