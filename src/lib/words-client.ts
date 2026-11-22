import type { VocabWord } from "@/lib/vocab";
import { lookupWord, type LookupResult } from "@/lib/word-lookup";

export type WordsResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string | undefined; error: string; word?: VocabWord };

export type WordChange = { meaningTr: string } | { answer: "know" | "dontKnow" } | { unlearn: true } | { relookup: true | LookupResult };

async function call<T>(url: string, init?: RequestInit): Promise<WordsResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
  } catch {
    return { ok: false, status: 0, code: undefined, error: "" };
  }
  const body = await res.json().catch(() => null);
  if (res.ok) return { ok: true, data: body as T };
  return {
    ok: false,
    status: res.status,
    code: typeof body?.code === "string" ? body.code : undefined,
    error: typeof body?.error === "string" ? body.error : "",
    ...(body?.word ? { word: body.word as VocabWord } : {}),
  };
}

export const listWords = () => call<VocabWord[]>("/api/words");
export const addWord = async (word: string, meaningTr: string) => {
  const dictionary = await lookupWord(word);
  return call<VocabWord>("/api/words", { method: "POST", body: JSON.stringify({ word, meaningTr, dictionary }) });
};
export const changeWord = (id: string, change: WordChange) =>
  call<VocabWord>(`/api/words/${id}`, { method: "PATCH", body: JSON.stringify(change) });
export const relookupWord = async (id: string, word: string) => changeWord(id, { relookup: await lookupWord(word) });
export const deleteWord = (id: string) => call<{ ok: true }>(`/api/words/${id}`, { method: "DELETE" });
