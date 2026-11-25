import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { useLang } from "@ptracker/shared/i18n";
import type { VocabWord } from "@ptracker/shared/vocab";
import { fillTemplate } from "@ptracker/shared/word-game";
import {
  RACE_COMBO_SHOWN,
  RACE_FEEDBACK_MS,
  RACE_TICK_MS,
  nextRaceQuestion,
  pickRace,
  raceOver,
  raceTimeLeft,
  startRace,
  type RaceChoice,
  type RaceState,
} from "@ptracker/shared/word-race";
import { TabScreen } from "@/components/tab-screen";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useAuth } from "@/lib/auth-context";
import { useSoloBest } from "@/lib/use-solo-best";
import { getStoredRaceBest, getStoredRaceList, setStoredRaceBest, setStoredRaceList } from "@/lib/word-race-storage";

export default function WordRaceScreen() {
  const { t } = useLang();
  const { api, user } = useAuth();
  const userId = user?.id ?? null;
  const [race, setRace] = useState<RaceState | null>(null);
  const [now, setNow] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tooFew, setTooFew] = useState(false);
  const { best, newBest, record, clearNewBest } = useSoloBest(getStoredRaceBest, setStoredRaceBest);

  const start = useCallback(async () => {
    setLoadFailed(false);
    clearNewBest();
    let words: VocabWord[] | null;
    try {
      words = await api.get<VocabWord[]>("/api/words");
      void setStoredRaceList(words);
    } catch {
      words = await getStoredRaceList(userId);
    }
    const at = Date.now();
    const next = words ? startRace(words, at) : null;
    setLoadFailed(words === null);
    setTooFew(words !== null && next === null);
    setRace(next);
    setNow(at);
  }, [api, userId, clearNewBest]);

  useFocusEffect(
    useCallback(() => {
      if (!race) void start();
    }, [start, race])
  );

  const over = race !== null && raceOver(race, now);
  const playing = race !== null && !over;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(Date.now()), RACE_TICK_MS);
    return () => clearInterval(id);
  }, [playing]);

  const picked = race?.picked ?? null;
  useEffect(() => {
    if (!picked) return;
    const id = setTimeout(() => setRace((s) => (s && !raceOver(s, Date.now()) ? nextRaceQuestion(s) : s)), RACE_FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [picked]);

  const score = race?.score ?? 0;
  useEffect(() => {
    if (!over) return;
    return record(score);
  }, [over, score, record]);

  function pick(id: string, at: number) {
    setRace((s) => (s ? pickRace(s, id, at) : s));
    setNow(at);
  }

  function choiceTone(c: RaceChoice): { box: string; label: string } {
    if (picked && race && c.id === race.question.id) return { box: "bg-emerald-600", label: "text-white" };
    if (picked && c.id === picked.id) return { box: "bg-red-600", label: "text-white" };
    return { box: "border border-gray-200 bg-surface", label: "text-gray-900" };
  }

  return (
    <TabScreen>
      <View className="flex-row items-center gap-2 border-b border-gray-100 px-4 py-3">
        <Pressable onPress={() => router.back()} className="pr-2" accessibilityLabel={t.wordsBack}>
          <Text className="text-xl text-gray-600">‹</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-gray-900">{t.wordRaceTitle}</Text>
      </View>
      <ScrollView contentContainerClassName="gap-4 p-4">
        {loadFailed ? (
          <Pressable onPress={() => void start()}>
            <Text className="text-sm text-gray-700">{t.wordsLoadFailed} <Text className="font-semibold text-emerald-700">{t.wordsRetry}</Text></Text>
          </Pressable>
        ) : null}
        {tooFew ? <Text className="text-gray-700">{t.wordRaceNeedWords}</Text> : null}
        {race && playing ? (
          <View className="gap-4 rounded-xl bg-surface p-6">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-gray-900">{fillTemplate(t.wordRaceTime, { s: String(Math.ceil(raceTimeLeft(race, now) / 1000)) })}</Text>
              {race.combo >= RACE_COMBO_SHOWN ? <Text className="text-sm font-semibold text-orange-600">{fillTemplate(t.wordRaceCombo, { n: String(race.combo) })}</Text> : null}
              <Text className="text-sm font-semibold text-gray-900">{fillTemplate(t.wordRaceScore, { n: String(race.score) })}</Text>
            </View>
            <Text className="min-h-16 text-center text-lg text-gray-900">{race.question.clue}</Text>
            <View className="flex-row flex-wrap justify-between gap-y-2">
              {race.question.choices.map((c) => {
                const tone = choiceTone(c);
                return (
                  <Pressable key={c.id} onPress={() => pick(c.id, Date.now())} className={`w-[48%] items-center rounded-lg px-3 py-4 ${tone.box}`}>
                    <Text className={`text-center text-sm font-semibold ${tone.label}`}>{c.word}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        {race && over ? (
          <View className="items-center gap-3 rounded-xl bg-surface p-6">
            <Text className="text-2xl font-bold text-gray-900">{fillTemplate(t.wordRaceScore, { n: String(race.score) })}</Text>
            {newBest ? <Text className="font-semibold text-emerald-700">{t.wordRaceNewBest}</Text> : null}
            {best !== null ? <Text className="text-sm text-gray-700">{fillTemplate(t.wordRaceBest, { n: String(best) })}</Text> : null}
            <Text className="text-sm text-gray-700">{fillTemplate(t.wordRaceBestCombo, { n: String(race.bestCombo) })}</Text>
            <View className="w-full gap-1">
              <Text className="text-sm font-semibold text-gray-900">{race.missed.length > 0 ? t.wordRaceMissed : t.wordRaceNoMissed}</Text>
              {race.missed.map((id) => (
                <Text key={id} className="text-sm text-gray-700">
                  <Text className="font-semibold text-gray-900">{race.words.find((w) => w.id === id)?.word}</Text> · {race.clues[id]}
                </Text>
              ))}
            </View>
            <View className="w-full flex-row gap-2 pt-2">
              <Pressable onPress={() => router.back()} className="flex-1 items-center rounded-lg border border-gray-200 py-3">
                <Text className="text-sm text-gray-900">{t.wordsBack}</Text>
              </Pressable>
              <View className="flex-1">
                <PrimaryButton label={t.wordRacePlayAgain} onPress={() => void start()} />
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </TabScreen>
  );
}
