import type { WhoCard } from "./types";
import { worldMusic } from "./people/world-music";
import { worldScreen } from "./people/world-screen";
import { worldSports } from "./people/world-sports";
import { worldScience } from "./people/world-science";
import { worldArts } from "./people/world-arts";
import { worldHistory } from "./people/world-history";
import { trMusic } from "./people/tr-music";
import { trScreen } from "./people/tr-screen";
import { trSports } from "./people/tr-sports";
import { trOther } from "./people/tr-other";
import { animation } from "./characters/animation";
import { screenBooks } from "./characters/screen-books";
import { mythTales } from "./characters/myth-tales";

export * from "./types";

/** Each curated file, keyed by its id prefix. Ids are positions within a file. */
export const WHO_PEOPLE_FILES: Readonly<Record<string, readonly WhoCard[]>> = {
  "p-world-music": worldMusic,
  "p-world-screen": worldScreen,
  "p-world-sports": worldSports,
  "p-world-science": worldScience,
  "p-world-arts": worldArts,
  "p-world-history": worldHistory,
  "p-tr-music": trMusic,
  "p-tr-screen": trScreen,
  "p-tr-sports": trSports,
  "p-tr-other": trOther,
};

export const WHO_CHARACTER_FILES: Readonly<Record<string, readonly WhoCard[]>> = {
  "c-animation": animation,
  "c-screen-books": screenBooks,
  "c-myth-tales": mythTales,
};

export const WHO_PEOPLE: readonly WhoCard[] = Object.values(WHO_PEOPLE_FILES).flat();
export const WHO_CHARACTERS: readonly WhoCard[] = Object.values(WHO_CHARACTER_FILES).flat();
