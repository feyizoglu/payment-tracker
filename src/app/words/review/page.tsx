"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import EventsHeader from "@/components/events/EventsHeader";
import { AudioButton } from "@/components/words/WordParts";
import { useLang } from "@/lib/i18n";
import type { VocabWord } from "@/lib/vocab";
import { answerReview, currentWord, revealReview, reviewDone, startReview, type ReviewState } from "@/lib/vocab-review";
import { fillTemplate } from "@/lib/word-game";
import { changeWord, listWords } from "@/lib/words-client";

export default function WordsReviewPage() {
  const { status } = useSession();
  const { t } = useLang();
  const router = useRouter();
  const [state, setState] = useState<ReviewState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [answerFailed, setAnswerFailed] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  const loaded = useCallback((res: Awaited<ReturnType<typeof listWords>>) => {
    setLoadFailed(!res.ok);
    if (res.ok) setState(startReview(res.data));
  }, []);
  const start = () => {
    setLoadFailed(false);
    void listWords().then(loaded);
  };
  useEffect(() => {
    if (status === "authenticated") void listWords().then(loaded);
  }, [status, loaded]);

  function answer(word: VocabWord, know: boolean) {
    setState((s) => (s ? answerReview(s, know) : s));
    void changeWord(word.id, { answer: know ? "know" : "dontKnow" }).then((res) => setAnswerFailed(!res.ok));
  }

  const word = state ? currentWord(state) : null;
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <EventsHeader active="words" />
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <Link href="/words" className="text-sm text-gray-500">← {t.wordsBack}</Link>
        {loadFailed ? (
          <p className="text-sm text-gray-700">{t.wordsLoadFailed} <button type="button" onClick={start} className="font-semibold text-emerald-700 dark:text-emerald-400">{t.wordsRetry}</button></p>
        ) : null}
        {answerFailed ? <p className="text-sm text-red-600">{t.wordsAnswerFailed}</p> : null}
        {state && state.words.length === 0 ? <p className="text-gray-700">{t.wordsNothingToReview}</p> : null}
        {state && word ? (
          <div className="space-y-4 rounded-xl bg-surface p-6 text-center">
            <p className="text-xs text-gray-400">{state.index + 1} / {state.words.length}</p>
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-3xl font-bold text-gray-900">{word.word}</h1>
              <AudioButton url={word.audio_url} />
            </div>
            {word.ipa ? <p className="text-gray-500">{word.ipa}</p> : null}
            {state.revealed ? (
              <div className="space-y-2 text-left">
                {word.meaning_tr ? <p className="text-center text-lg text-gray-900">{word.meaning_tr}</p> : null}
                {word.senses[0] ? (
                  <p className="text-sm text-gray-700">
                    {word.senses[0].definition}
                    {word.senses[0].example ? <span className="block italic text-gray-500">“{word.senses[0].example}”</span> : null}
                  </p>
                ) : null}
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => answer(word, false)} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm">{t.wordsDontKnow}</button>
                  <button type="button" onClick={() => answer(word, true)} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white">{t.wordsKnow}</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setState((s) => (s ? revealReview(s) : s))} className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white">{t.wordsShow}</button>
            )}
          </div>
        ) : null}
        {state && state.words.length > 0 && reviewDone(state) ? (
          <div className="space-y-3 rounded-xl bg-surface p-6 text-center">
            <p className="text-lg font-semibold text-gray-900">
              {fillTemplate(t.wordsRoundDone, { known: String(state.known), total: String(state.words.length), learned: String(state.learned) })}
            </p>
            <button type="button" onClick={start} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">{t.wordsAnotherRound}</button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
