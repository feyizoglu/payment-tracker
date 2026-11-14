import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const fs = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async () => ""),
  writeFile: vi.fn<(file: string, data: string) => Promise<undefined>>(async () => undefined),
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

type Row = Record<string, { value: string; type?: string }>;
type Answer = { status?: number; body?: string; headers?: Record<string, string> } | Error;

const SCRIPT = fileURLToPath(new URL("../../scripts/who-game/fetch-wikidata.mjs", import.meta.url));
const MYTH_SEEDS = [
  "Q721568", "Q178638", "Q29576829", "Q29576866", "Q2048393", "Q2996714", "Q2629889", "Q2366098", "Q2481517",
  "Q388126", "Q723668", "Q21013704",
];
const CHARACTER_CLASSES = "VALUES ?r { wd:Q95074 wd:Q3966183 }";
const entity = (qid: string) => `http://www.wikidata.org/entity/${qid}`;
const bindings = (rows: Row[]) => JSON.stringify({ results: { bindings: rows } });

describe("the Who Am I? Wikidata script run", () => {
  const argv = process.argv;
  let calls: { query: string; at: number }[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    calls = [];
  });

  afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const run = async (answer: (query: string, n: number) => Answer | undefined) => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
      const query = init.body.get("query") ?? "";
      calls.push({ query, at: Date.now() });
      const result = answer(query, calls.filter((c) => c.query === query).length) ?? { body: bindings([]) };
      if (result instanceof Error) throw result;
      return {
        ok: (result.status ?? 200) < 400,
        status: result.status ?? 200,
        headers: new Headers(result.headers),
        text: async () => result.body ?? "",
      };
    }));
    process.argv = [argv[0], SCRIPT, "/tmp/who-data-test"];
    await import("../../scripts/who-game/fetch-wikidata.mjs");
    const written = (name: string) => fs.writeFile.mock.calls.find(([file]) => String(file).endsWith(`/${name}`));
    for (let i = 0; i < 200 && !written("_run.json"); i += 1) await vi.advanceTimersByTimeAsync(60_000);
    const output = (name: string) => JSON.parse(String(written(name)?.[1]));
    return { run: output("_run.json"), output, fetched: (part: string) => calls.filter((c) => c.query.includes(part)) };
  };

  it("splits a failing chunked query down to single values and records each one that still fails", async () => {
    const { run: meta } = await run((query) => (query.includes('CONCAT("label_"') ? { status: 400, body: "bad query" } : undefined));
    expect(meta.failures).toHaveLength(MYTH_SEEDS.length);
    expect(meta.failures.every((f: { values: string[] }) => f.values.length === 1)).toBe(true);
    expect(meta.failures.flatMap((f: { values: string[] }) => f.values).sort()).toEqual([...MYTH_SEEDS].sort());
    expect(meta.failures).toContainEqual({ query: "characters details 1/1aaaa", values: ["Q721568"], error: "HTTP 400: bad query" });
  });

  it("retries a 429 after the Retry-After seconds", async () => {
    const { run: meta, fetched } = await run((query, n) =>
      query.includes(CHARACTER_CLASSES) && n === 1 ? { status: 429, headers: { "retry-after": "2" } } : undefined);
    const tries = fetched(CHARACTER_CLASSES);
    expect(tries).toHaveLength(2);
    expect(tries[1].at - tries[0].at).toBe(2000);
    expect(meta.failures).toEqual([]);
  });

  it("does not retry a 400", async () => {
    const { run: meta, fetched } = await run((query) => (query.includes(CHARACTER_CLASSES) ? { status: 400, body: "bad" } : undefined));
    expect(fetched(CHARACTER_CLASSES)).toHaveLength(1);
    expect(meta.failures).toContainEqual({ query: "closure character classes", error: "HTTP 400: bad" });
  });

  it("retries a 200 whose body is truncated JSON", async () => {
    const { run: meta, fetched } = await run((query, n) =>
      query.includes(CHARACTER_CLASSES) && n === 1 ? { body: '{"results":{"bind' } : undefined);
    expect(fetched(CHARACTER_CLASSES)).toHaveLength(2);
    expect(meta.failures).toEqual([]);
  });

  it("retries a rejected fetch up to four times, then records the failure", async () => {
    const { run: meta, fetched } = await run((query) => (query.includes(CHARACTER_CLASSES) ? new TypeError("fetch failed") : undefined));
    expect(fetched(CHARACTER_CLASSES)).toHaveLength(4);
    expect(meta.failures).toContainEqual({ query: "closure character classes", error: "TypeError: fetch failed" });
  });

  it("keeps a soldier who is also an explorer and excludes a soldier-only person", async () => {
    const detail = (qid: string, k: string, v: string, type = "uri") => ({ item: { value: entity(qid) }, k: { value: k }, v: { type, value: type === "uri" ? entity(v) : v } });
    const { output } = await run((query) => {
      if (query.includes("VALUES ?r { wd:Q189290 wd:Q4991371 }")) return { body: bindings([{ c: { value: entity("Q4991371") } }]) };
      if (query.includes("wdt:P106 ?cls") && query.includes("VALUES ?cls") && /wd:Q11900058[ }]/.test(query)) {
        return {
          body: bindings(["Q1001", "Q1002"].map((qid, i) => ({ item: { value: entity(qid) }, sl: { value: String(100 - i) }, cls: { value: entity("Q11900058") } }))),
        };
      }
      if (query.includes('BIND("occ" AS ?k)') && query.includes("wd:Q1001")) {
        return {
          body: bindings([
            detail("Q1001", "p31", "Q5"),
            detail("Q1001", "occ", "Q11900058"),
            detail("Q1001", "occ", "Q4991371"),
            detail("Q1001", "sl", "100", "literal"),
            detail("Q1001", "label_en", "Explorer Soldier", "literal"),
            detail("Q1002", "p31", "Q5"),
            detail("Q1002", "occ", "Q4991371"),
            detail("Q1002", "sl", "99", "literal"),
            detail("Q1002", "label_en", "Plain Soldier", "literal"),
          ]),
        };
      }
      return undefined;
    });
    expect(output("world-history.json").map((r: { qid: string }) => r.qid)).toEqual(["Q1001"]);
    expect(output("_excluded-people.json")).toEqual([
      { qid: "Q1002", label: "Plain Soldier", sitelinks: 99, region: "world", group: "explorers-aviators", reason: "Q4991371" },
    ]);
  });
});
