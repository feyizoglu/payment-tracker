import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: "en" }),
}));

import { SECRET_COLORS, newSecretRound } from "@/lib/secret-word";
import { SecretKeyboard, SecretLegend, SecretLetter } from "@/components/games/secret/SecretParts";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function expand(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  if (typeof el.type === "function") return expand((el.type as (p: Props) => unknown)(el.props));
  return [el, ...expand(el.props.children)];
}

const c = SECRET_COLORS.light;
const round = newSecretRound({ id: "animals-1", word: "HORSE", category: "animals" }, "en");
const keys = (marks: Record<string, "hit" | "near" | "miss"> = {}) =>
  expand(SecretKeyboard({ round, marks, palette: c, onKey: () => undefined })).filter((n) => n.type === "button");
const style = (mark: "hit" | "near") => (SecretLetter({ slot: { letter: "K", mark }, palette: c }) as Node).props.style;

describe("SecretKeyboard", () => {
  it("keeps the focus off a clicked key", () => {
    const all = keys();
    expect(all.length).toBeGreaterThan(2);
    for (const k of all) {
      const e = { preventDefault: vi.fn() };
      (k.props.onMouseDown as (e: unknown) => void)(e);
      expect(e.preventDefault).toHaveBeenCalledTimes(1);
    }
  });

  it("styles hit and near keys", () => {
    const all = keys({ K: "hit", A: "near" });
    const look = (l: string) => all.find((k) => k.props.children === l)!.props.style;
    expect(look("K")).toMatchObject({ backgroundColor: c.hit, color: c.onHit });
    expect(look("A")).toMatchObject({ backgroundColor: c.key, boxShadow: `inset 0 -4px 0 ${c.near}` });
  });
});

describe("SecretLetter", () => {
  it("fills a hit and underlines a near letter", () => {
    expect(style("hit")).toMatchObject({ backgroundColor: c.hit, color: c.onHit, borderRadius: 9999 });
    expect(style("near")).toMatchObject({ color: c.ink, borderBottom: `4px solid ${c.near}` });
  });
});

describe("SecretLegend", () => {
  it("shows a hit, a near and a miss sample with their labels", () => {
    const items = (SecretLegend({ palette: c }) as Node).props.children as Node[];
    const shown = items.map((item) => {
      const [sample, label] = item.props.children as [Node, string];
      return [sample.type, (sample.props.slot as { mark: string }).mark, label];
    });
    expect(shown).toEqual([
      [SecretLetter, "hit", "secretLegendHit"],
      [SecretLetter, "near", "secretLegendNear"],
      [SecretLetter, "miss", "secretLegendMiss"],
    ]);
  });
});
