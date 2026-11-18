import type { Translations } from "./i18n";
import { eventErrorText } from "./event-errors";

/** A failed API response's message: the user's-language text for a known event error, else the raw message or `fallback`. */
export async function responseErrorText(res: Response, t: Translations, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return eventErrorText(data?.error, t) ?? (typeof data?.error === "string" ? data.error : fallback);
}
