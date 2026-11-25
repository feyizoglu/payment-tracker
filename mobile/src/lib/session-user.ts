import { getToken } from "./storage";

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decodeBase64Url(text: string): string {
  let out = "";
  let value = 0;
  let bits = 0;
  for (const ch of text) {
    const digit = BASE64URL.indexOf(ch);
    if (digit < 0) break;
    value = (value << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return out;
}

/**
 * The account the stored session belongs to: the subject of the app token in the secure store.
 * Read locally, so it is known offline after a cold start, when the profile has not loaded.
 */
export async function sessionUserId(): Promise<string | null> {
  try {
    const payload = (await getToken())?.split(".")[1];
    if (!payload) return null;
    const sub: unknown = JSON.parse(decodeBase64Url(payload))?.sub;
    return typeof sub === "string" && sub !== "" ? sub : null;
  } catch {
    return null;
  }
}
