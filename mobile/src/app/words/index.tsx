import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { useLang } from "@ptracker/shared/i18n";
import { filterWords, isValidWord, normalizeWord, vocabErrorText, vocabProgress, vocabWordKey, type VocabFilter, type VocabWord } from "@ptracker/shared/vocab";
import { lookupWord } from "@ptracker/shared/word-lookup";
import { fillTemplate } from "@ptracker/shared/word-game";
import { TabScreen } from "@/components/tab-screen";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { StreakDots } from "@/components/words/word-parts";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function WordsScreen() {
  const { t } = useLang();
  const { api } = useAuth();
  const [words, setWords] = useState<VocabWord[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<VocabFilter>("all");
  const [query, setQuery] = useState("");
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setWords(await api.get<VocabWord[]>("/api/words"));
    } catch {
      setLoadFailed(true);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function save() {
    const clean = normalizeWord(word);
    if (!isValidWord(clean)) return setError(t.wordsInvalidWord);
    const known = (words ?? []).find((w) => w.word_key === vocabWordKey(clean));
    if (known) return router.push({ pathname: "/words/[id]", params: { id: known.id } });
    setSaving(true);
    setError(null);
    try {
      const dictionary = await lookupWord(clean);
      const added = await api.post<VocabWord>("/api/words", { word: clean, meaningTr: meaning, dictionary });
      setWord("");
      setMeaning("");
      router.push({ pathname: "/words/[id]", params: { id: added.id } });
    } catch (e) {
      if (e instanceof ApiError && e.code === "duplicate") {
        const existing = (words ?? []).find((w) => w.word_key === vocabWordKey(clean));
        if (existing) return router.push({ pathname: "/words/[id]", params: { id: existing.id } });
      }
      setError(e instanceof ApiError ? vocabErrorText(e.code, e.message, t) : t.updateFailed);
    } finally {
      setSaving(false);
    }
  }

  const progress = vocabProgress(words ?? []);
  const unlearned = progress.total - progress.learned;
  const shown = filterWords(words ?? [], filter, query);
  const filters: [VocabFilter, string][] = [["all", t.wordsFilterAll], ["learning", t.wordsFilterLearning], ["learned", t.wordsFilterLearned]];

  return (
    <TabScreen>
      <View className="flex-row items-center gap-2 border-b border-gray-100 px-4 py-3">
        <Pressable onPress={() => router.back()} className="pr-2" accessibilityLabel={t.wordsBack}>
          <Text className="text-xl text-gray-600">‹</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-gray-900">{t.wordsTitle}</Text>
      </View>
      <ScrollView
        contentContainerClassName="gap-4 p-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {loadFailed ? (
          <Pressable onPress={() => void load()}>
            <Text className="text-sm text-gray-700">{t.wordsLoadFailed} <Text className="font-semibold text-emerald-700">{t.wordsRetry}</Text></Text>
          </Pressable>
        ) : null}
        {words === null && !loadFailed ? <ActivityIndicator /> : null}
        <View className="gap-2 rounded-xl bg-surface p-4">
          <Text className="text-sm text-gray-700">{fillTemplate(t.wordsProgress, { n: String(progress.total), learned: String(progress.learned) })}</Text>
          <View className="h-2 overflow-hidden rounded-full bg-gray-100">
            <View className="h-full bg-emerald-700" style={{ width: `${progress.total ? (progress.learned / progress.total) * 100 : 0}%` }} />
          </View>
          <PrimaryButton label={fillTemplate(t.wordsReview, { n: String(unlearned) })} onPress={() => router.push("/words/review")} disabled={unlearned === 0} />
        </View>
        <View className="gap-2 rounded-xl bg-surface p-4">
          <Text className="text-sm font-semibold text-gray-900">{t.wordsAdd}</Text>
          <TextField value={word} onChangeText={setWord} label={t.wordsWordLabel} autoCapitalize="none" autoCorrect={false} maxLength={60} />
          <TextField value={meaning} onChangeText={setMeaning} label={t.wordsMeaningLabel} maxLength={200} />
          {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
          <PrimaryButton label={saving ? t.wordsSaving : t.wordsSave} onPress={() => void save()} disabled={saving || !word.trim()} />
        </View>
        <TextField value={query} onChangeText={setQuery} label={t.wordsSearch} />
        <View className="flex-row gap-2">
          {filters.map(([f, label]) => (
            <Pressable key={f} onPress={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 ${filter === f ? "bg-emerald-50" : ""}`}>
              <Text className={filter === f ? "font-semibold text-emerald-700" : "text-gray-500"}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {words && words.length === 0 ? <Text className="text-sm text-gray-500">{t.wordsEmpty}</Text> : null}
        {words && words.length > 0 && shown.length === 0 ? <Text className="text-sm text-gray-500">{t.wordsNoMatch}</Text> : null}
        <View className="rounded-xl bg-surface">
          {shown.map((w) => (
            <Pressable key={w.id} onPress={() => router.push({ pathname: "/words/[id]", params: { id: w.id } })} className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3">
              <View className="flex-1 pr-3">
                <Text className="font-semibold text-gray-900">{w.word}{w.ipa ? <Text className="text-sm font-normal text-gray-500">  {w.ipa}</Text> : null}</Text>
                {w.meaning_tr ? <Text className="text-sm text-gray-700">{w.meaning_tr}</Text> : null}
              </View>
              <StreakDots word={w} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </TabScreen>
  );
}
