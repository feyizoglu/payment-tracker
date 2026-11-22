import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { useLang } from "@ptracker/shared/i18n";
import type { VocabWord } from "@ptracker/shared/vocab";
import { answerReview, currentWord, revealReview, reviewDone, startReview, type ReviewState } from "@ptracker/shared/vocab-review";
import { fillTemplate } from "@ptracker/shared/word-game";
import { TabScreen } from "@/components/tab-screen";
import { PrimaryButton } from "@/components/ui/primary-button";
import { AudioButton } from "@/components/words/word-parts";
import { useAuth } from "@/lib/auth-context";

export default function WordsReviewScreen() {
  const { t } = useLang();
  const { api } = useAuth();
  const [state, setState] = useState<ReviewState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [answerFailed, setAnswerFailed] = useState(false);

  const start = useCallback(async () => {
    setLoadFailed(false);
    try {
      setState(startReview(await api.get<VocabWord[]>("/api/words")));
    } catch {
      setLoadFailed(true);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      if (!state) void start();
    }, [start, state])
  );

  function answer(word: VocabWord, know: boolean) {
    setState((s) => (s ? answerReview(s, know) : s));
    api.patch(`/api/words/${word.id}`, { answer: know ? "know" : "dontKnow" }).then(
      () => setAnswerFailed(false),
      () => setAnswerFailed(true)
    );
  }

  const word = state ? currentWord(state) : null;
  return (
    <TabScreen>
      <View className="flex-row items-center gap-2 border-b border-gray-100 px-4 py-3">
        <Pressable onPress={() => router.back()} className="pr-2" accessibilityLabel={t.wordsBack}>
          <Text className="text-xl text-gray-600">‹</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-gray-900">{t.wordsTitle}</Text>
      </View>
      <ScrollView contentContainerClassName="gap-4 p-4">
        {loadFailed ? (
          <Pressable onPress={() => void start()}>
            <Text className="text-sm text-gray-700">{t.wordsLoadFailed} <Text className="font-semibold text-emerald-700">{t.wordsRetry}</Text></Text>
          </Pressable>
        ) : null}
        {answerFailed ? <Text className="text-sm text-red-600">{t.wordsAnswerFailed}</Text> : null}
        {state && state.words.length === 0 ? <Text className="text-gray-700">{t.wordsNothingToReview}</Text> : null}
        {state && word ? (
          <View className="items-center gap-4 rounded-xl bg-surface p-6">
            <Text className="text-xs text-gray-400">{state.index + 1} / {state.words.length}</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-3xl font-bold text-gray-900">{word.word}</Text>
              <AudioButton url={word.audio_url} />
            </View>
            {word.ipa ? <Text className="text-gray-500">{word.ipa}</Text> : null}
            {state.revealed ? (
              <View className="w-full gap-2">
                {word.meaning_tr ? <Text className="text-center text-lg text-gray-900">{word.meaning_tr}</Text> : null}
                {word.senses[0] ? (
                  <View>
                    <Text className="text-sm text-gray-700">{word.senses[0].definition}</Text>
                    {word.senses[0].example ? <Text className="text-sm italic text-gray-500">“{word.senses[0].example}”</Text> : null}
                  </View>
                ) : null}
                <View className="flex-row gap-2 pt-2">
                  <Pressable onPress={() => answer(word, false)} className="flex-1 items-center rounded-lg border border-gray-200 py-3">
                    <Text className="text-sm text-gray-900">{t.wordsDontKnow}</Text>
                  </Pressable>
                  <View className="flex-1">
                    <PrimaryButton label={t.wordsKnow} onPress={() => answer(word, true)} />
                  </View>
                </View>
              </View>
            ) : (
              <View className="w-full"><PrimaryButton label={t.wordsShow} onPress={() => setState((s) => (s ? revealReview(s) : s))} /></View>
            )}
          </View>
        ) : null}
        {state && state.words.length > 0 && reviewDone(state) ? (
          <View className="items-center gap-3 rounded-xl bg-surface p-6">
            <Text className="text-center text-lg font-semibold text-gray-900">
              {fillTemplate(t.wordsRoundDone, { known: String(state.known), total: String(state.words.length), learned: String(state.learned) })}
            </Text>
            <PrimaryButton label={t.wordsAnotherRound} onPress={() => void start()} />
          </View>
        ) : null}
      </ScrollView>
    </TabScreen>
  );
}
