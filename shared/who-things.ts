// The Describe It lists Who Am I? deals as things. Only these six files, so the game does not
// load the other categories.

import type { WhoThings } from "./who-game";
import { animals as trAnimals } from "./word-game-words/tr/animals";
import { jobs as trJobs } from "./word-game-words/tr/jobs";
import { objects as trObjects } from "./word-game-words/tr/objects";
import { animals as enAnimals } from "./word-game-words/en/animals";
import { jobs as enJobs } from "./word-game-words/en/jobs";
import { objects as enObjects } from "./word-game-words/en/objects";

export const WHO_THINGS: WhoThings = {
  tr: { animals: trAnimals, jobs: trJobs, objects: trObjects },
  en: { animals: enAnimals, jobs: enJobs, objects: enObjects },
};
