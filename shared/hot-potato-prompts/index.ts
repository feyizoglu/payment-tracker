import type { Lang } from "../i18n";
import type { PotatoPrompt } from "./types";
import { tr } from "./tr";
import { en } from "./en";

export * from "./types";

export const HOT_POTATO_PROMPTS: Record<Lang, PotatoPrompt[]> = { tr, en };
