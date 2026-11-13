import type { Lang } from "../i18n";
import type { WordCard, WordCategory } from "./types";
import { animals as tr_animals } from "./tr/animals";
import { food as tr_food } from "./tr/food";
import { jobs as tr_jobs } from "./tr/jobs";
import { places as tr_places } from "./tr/places";
import { objects as tr_objects } from "./tr/objects";
import { sports as tr_sports } from "./tr/sports";
import { home as tr_home } from "./tr/home";
import { nature as tr_nature } from "./tr/nature";
import { body as tr_body } from "./tr/body";
import { transport as tr_transport } from "./tr/transport";
import { arts as tr_arts } from "./tr/arts";
import { actions as tr_actions } from "./tr/actions";
import { idioms as tr_idioms } from "./tr/idioms";
import { animals as en_animals } from "./en/animals";
import { food as en_food } from "./en/food";
import { jobs as en_jobs } from "./en/jobs";
import { places as en_places } from "./en/places";
import { objects as en_objects } from "./en/objects";
import { sports as en_sports } from "./en/sports";
import { home as en_home } from "./en/home";
import { nature as en_nature } from "./en/nature";
import { body as en_body } from "./en/body";
import { transport as en_transport } from "./en/transport";
import { arts as en_arts } from "./en/arts";
import { actions as en_actions } from "./en/actions";
import { idioms as en_idioms } from "./en/idioms";

export * from "./types";

export const WORD_GAME_WORDS: Record<Lang, Record<WordCategory, WordCard[]>> = {
  tr: {
    animals: tr_animals,
    food: tr_food,
    jobs: tr_jobs,
    places: tr_places,
    objects: tr_objects,
    sports: tr_sports,
    home: tr_home,
    nature: tr_nature,
    body: tr_body,
    transport: tr_transport,
    arts: tr_arts,
    actions: tr_actions,
    idioms: tr_idioms,
  },
  en: {
    animals: en_animals,
    food: en_food,
    jobs: en_jobs,
    places: en_places,
    objects: en_objects,
    sports: en_sports,
    home: en_home,
    nature: en_nature,
    body: en_body,
    transport: en_transport,
    arts: en_arts,
    actions: en_actions,
    idioms: en_idioms,
  },
};
