"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import EventsHeader from "@/components/events/EventsHeader";
import { StreakDots } from "@/components/words/WordParts";
import { useLang } from "@/lib/i18n";
import { filterWords, isValidWord, normalizeWord, vocabErrorText, vocabProgress, vocabWordKey, type VocabFilter, type VocabWord } from "@/lib/vocab";
import { fillTemplate } from "@/lib/word-game";
import { canRace } from "@/lib/word-race";
import { addWord, listWords } from "@/lib/words-client";

export default function WordsPage() {
  const { status } = useSession();
  const { t } = useLang();
  const router = useRouter();
  const [words, setWords] = useState<VocabWord[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<VocabFilter>("all");
  const [query, setQuery] = useState("");
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  const loaded = useCallback((res: Awaited<ReturnType<typeof listWords>>) => {
    if (res.ok) setWords(res.data);
    setLoadFailed(!res.ok);
  }, []);
  const load = () => {
    setLoadFailed(false);
    void listWords().then(loaded);
  };
  useEffect(() => {
    if (status === "authenticated") void listWords().then(loaded);
  }, [status, loaded]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const clean = normalizeWord(word);
    if (!isValidWord(clean)) return setError(t.wordsInvalidWord);
    const known = (words ?? []).find((w) => w.word_key === vocabWordKey(clean));
    if (known) return router.push(`/words/${known.id}`);
    setSaving(true);
    setError(null);
    const res = await addWord(clean, meaning);
    setSaving(false);
    if (res.ok) return router.push(`/words/${res.data.id}`);
    if (res.code === "duplicate" && res.word) return router.push(`/words/${res.word.id}`);
    setError(vocabErrorText(res.code, res.error, t));
  }

  const progress = vocabProgress(words ?? []);
  const shown = filterWords(words ?? [], filter, query);
  const unlearned = progress.total - progress.learned;
  const raceReady = canRace(words ?? []);
  const filters: [VocabFilter, string][] = [["all", t.wordsFilterAll], ["learning", t.wordsFilterLearning], ["learned", t.wordsFilterLearned]];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <EventsHeader active="words" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <h1 className="text-xl font-semibold text-gray-900">{t.wordsTitle}</h1>
        {loadFailed ? (
          <div className="rounded-xl bg-surface p-4 text-sm text-gray-700">
            {t.wordsLoadFailed}{" "}
            <button type="button" onClick={load} className="font-semibold text-emerald-700 dark:text-emerald-400">{t.wordsRetry}</button>
          </div>
        ) : null}
        <div className="space-y-2 rounded-xl bg-surface p-4">
          <p className="text-sm text-gray-700">{fillTemplate(t.wordsProgress, { n: String(progress.total), learned: String(progress.learned) })}</p>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-emerald-600" style={{ width: `${progress.total ? (progress.learned / progress.total) * 100 : 0}%` }} />
          </div>
          {unlearned > 0 ? (
            <Link href="/words/review" className="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
              {fillTemplate(t.wordsReview, { n: String(unlearned) })}
            </Link>
          ) : (
            <span className="inline-block rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-400">{fillTemplate(t.wordsReview, { n: "0" })}</span>
          )}
          <div>
            {raceReady ? (
              <Link href="/words/race" className="inline-block rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {t.wordRaceStart}
              </Link>
            ) : (
              <span className="inline-block rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-400">{t.wordRaceStart}</span>
            )}
            {words && !raceReady ? <p className="pt-1 text-xs text-gray-500">{t.wordRaceNeedWords}</p> : null}
          </div>
        </div>
        <form onSubmit={save} className="space-y-2 rounded-xl bg-surface p-4">
          <p className="text-sm font-semibold text-gray-900">{t.wordsAdd}</p>
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder={t.wordsWordLabel} maxLength={60} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder={t.wordsMeaningLabel} maxLength={200} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" disabled={saving || !word.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? t.wordsSaving : t.wordsSave}
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.wordsSearch} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          {filters.map(([f, label]) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-sm ${filter === f ? "bg-emerald-50 font-semibold text-emerald-700 dark:text-emerald-400" : "text-gray-500"}`}>
              {label}
            </button>
          ))}
        </div>
        {words && words.length === 0 ? <p className="text-sm text-gray-500">{t.wordsEmpty}</p> : null}
        {words && words.length > 0 && shown.length === 0 ? <p className="text-sm text-gray-500">{t.wordsNoMatch}</p> : null}
        <ul className="divide-y divide-gray-100 rounded-xl bg-surface">
          {shown.map((w) => (
            <li key={w.id}>
              <Link href={`/words/${w.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="font-semibold text-gray-900">{w.word}</span>
                  {w.ipa ? <span className="ml-2 text-sm text-gray-500">{w.ipa}</span> : null}
                  {w.meaning_tr ? <span className="block text-sm text-gray-700">{w.meaning_tr}</span> : null}
                </span>
                <StreakDots word={w} />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
