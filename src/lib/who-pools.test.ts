import { describe, it, expect } from "vitest";
import { WHO_CHARACTERS, WHO_PEOPLE } from "./who-cards";
import { WHO_THINGS } from "./who-things";
import { WHO_DECK_MIN, whoPool, type WhoSetup } from "./who-game";

// The real card lists, not fixtures: trimming a list must not quietly make a setup unplayable.
const sources = { people: WHO_PEOPLE, characters: WHO_CHARACTERS, things: WHO_THINGS };

type Choice = Pick<WhoSetup, "kinds" | "region" | "level">;
const KIND_SETS: Choice["kinds"][] = [
  ["people"],
  ["characters"],
  ["things"],
  ["people", "characters"],
  ["people", "characters", "things"],
];

describe("Who Am I? pools from the real cards", () => {
  it("deals a full deck for the default setup in each language", () => {
    expect(whoPool({ kinds: ["people", "characters"], region: "mixed", level: "mixed" }, sources, "tr").length).toBeGreaterThan(
      1000
    );
    expect(whoPool({ kinds: ["people", "characters"], region: "world", level: "mixed" }, sources, "en").length).toBeGreaterThan(
      1000
    );
  });

  it("leaves only Turkish easy characters below the deck minimum", () => {
    const small = (["tr", "en"] as const).flatMap((lang) =>
      KIND_SETS.flatMap((kinds) =>
        (["tr", "world", "mixed"] as const).flatMap((region) =>
          (["easy", "hard", "mixed"] as const).flatMap((level) =>
            whoPool({ kinds, region, level }, sources, lang).length < WHO_DECK_MIN
              ? [`${lang} ${kinds.join("+")} ${region} ${level}`]
              : []
          )
        )
      )
    );
    expect(small).toEqual(["tr characters tr easy", "en characters tr easy"]);
  });
});
