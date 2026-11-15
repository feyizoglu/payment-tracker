import type { Lang } from "../i18n";
import type { ScalePair } from "./types";
import { tr } from "./tr";
import { en } from "./en";

export * from "./types";

export const SCALE_PAIRS: Record<Lang, ScalePair[]> = { tr, en };
