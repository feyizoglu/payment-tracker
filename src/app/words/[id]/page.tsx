"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import EventsHeader from "@/components/events/EventsHeader";
import { AudioButton, SenseList, StreakDots } from "@/components/words/WordParts";
import { useLang } from "@/lib/i18n";
import { vocabErrorText, type VocabWord } from "@/lib/vocab";
import { fillTemplate } from "@/lib/word-game";
import { changeWord, deleteWord, listWords, relookupWord, type WordChange } from "@/lib/words-client";

export default function WordCardPage() {
  const { status } = useSession();
  const { t } = useLang();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [word, setWord] = useState<VocabWord | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [meaning, setMeaning] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  const loaded = useCallback((res: Awaited<ReturnType<typeof listWords>>) => {
    setLoadFailed(!res.ok);
    if (!res.ok) return;
    const found = res.data.find((w) => w.id === id) ?? null;
    if (!found) return router.replace("/words");
    setWord(found);
  }, [id, router]);
  const load = () => {
    setLoadFailed(false);
    void listWords().then(loaded);
  };
  useEffect(() => {
    if (status === "authenticated") void listWords().then(loaded);
  }, [status, loaded]);

  async function change(c: WordChange) {
    setBusy(true);
    setError(null);
    const res = "relookup" in c && word ? await relookupWord(id, word.word) : await changeWord(id, c);
    setBusy(false);
    if (res.ok) {
      setWord(res.data);
      setEditing(false);
    } else setError(vocabErrorText(res.code, res.error, t));
  }

  async function remove() {
    if (!word || !window.confirm(fillTemplate(t.wordsDeleteConfirm, { word: word.word }))) return;
    const res = await deleteWord(id);
    if (res.ok || res.status === 404) router.push("/words");
    else setError(vocabErrorText(res.code, res.error, t));
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <EventsHeader active="words" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Link href="/words" className="text-sm text-gray-500">← {t.wordsBack}</Link>
        {loadFailed ? (
          <p className="text-sm text-gray-700">
            {t.wordsLoadFailed} <button type="button" onClick={load} className="font-semibold text-emerald-700 dark:text-emerald-400">{t.wordsRetry}</button>
          </p>
        ) : null}
        {word ? (
          <div className="space-y-4 rounded-xl bg-surface p-5">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{word.word}</h1>
              <AudioButton url={word.audio_url} />
              <span className="ml-auto"><StreakDots word={word} /></span>
            </div>
            {word.ipa ? <p className="text-gray-500">{word.ipa}</p> : null}
            {editing ? (
              <div className="flex gap-2">
                <input value={meaning} onChange={(e) => setMeaning(e.target.value)} maxLength={200} placeholder={t.wordsMeaningLabel} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                <button type="button" disabled={busy} onClick={() => change({ meaningTr: meaning })} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">{t.wordsSave}</button>
              </div>
            ) : (
              <button type="button" onClick={() => { setMeaning(word.meaning_tr ?? ""); setEditing(true); }} className="text-left">
                {word.meaning_tr ? (
                  <span className="text-lg text-gray-900">{word.meaning_tr} <span className="text-sm text-emerald-700 dark:text-emerald-400">{t.wordsMeaningEdit}</span></span>
                ) : (
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t.wordsMeaningAdd}</span>
                )}
              </button>
            )}
            {word.lookup === "found" ? <SenseList senses={word.senses} /> : (
              <p className="text-sm text-gray-700">
                {word.lookup === "not_found" ? t.wordsLookupMissing : t.wordsLookupFailed}{" "}
                <button type="button" disabled={busy} onClick={() => change({ relookup: true })} className="font-semibold text-emerald-700 dark:text-emerald-400">{t.wordsLookupRetry}</button>
              </p>
            )}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-sm">
              {word.learned_at ? <button type="button" disabled={busy} onClick={() => change({ unlearn: true })} className="text-gray-700">{t.wordsUnlearn}</button> : null}
              <button type="button" onClick={remove} className="text-red-600">{t.wordsDelete}</button>
            </div>
            {word.lookup === "found" ? <p className="text-xs text-gray-400">{t.wordsSource}</p> : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
