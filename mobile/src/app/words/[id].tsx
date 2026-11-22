import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { useLang } from "@ptracker/shared/i18n";
import { vocabErrorText, type VocabWord } from "@ptracker/shared/vocab";
import { fillTemplate } from "@ptracker/shared/word-game";
import { TabScreen } from "@/components/tab-screen";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { AudioButton, SenseList, StreakDots } from "@/components/words/word-parts";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Change = { meaningTr: string } | { unlearn: true } | { relookup: true };

export default function WordCardScreen() {
  const { t } = useLang();
  const { api } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [word, setWord] = useState<VocabWord | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [meaning, setMeaning] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const found = (await api.get<VocabWord[]>("/api/words")).find((w) => w.id === id) ?? null;
      if (!found) return router.back();
      setWord(found);
    } catch {
      setLoadFailed(true);
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const errorText = (e: unknown) => (e instanceof ApiError ? vocabErrorText(e.code, e.message, t) : t.updateFailed);

  async function change(c: Change) {
    setBusy(true);
    setError(null);
    try {
      setWord(await api.patch<VocabWord>(`/api/words/${id}`, c));
      setEditing(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!word) return;
    Alert.alert(fillTemplate(t.wordsDeleteConfirm, { word: word.word }), undefined, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.wordsDelete,
        style: "destructive",
        onPress: async () => {
          try {
            await api.del(`/api/words/${id}`);
            router.back();
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) router.back();
            else setError(errorText(e));
          }
        },
      },
    ]);
  }

  return (
    <TabScreen>
      <View className="flex-row items-center gap-2 border-b border-gray-100 px-4 py-3">
        <Pressable onPress={() => router.back()} className="pr-2" accessibilityLabel={t.wordsBack}>
          <Text className="text-xl text-gray-600">‹</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-gray-900">{t.wordsTitle}</Text>
      </View>
      <ScrollView contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
        {loadFailed ? (
          <Pressable onPress={() => void load()}>
            <Text className="text-sm text-gray-700">{t.wordsLoadFailed} <Text className="font-semibold text-emerald-700">{t.wordsRetry}</Text></Text>
          </Pressable>
        ) : null}
        {word ? (
          <View className="gap-4 rounded-xl bg-surface p-5">
            <View className="flex-row items-center gap-2">
              <Text className="text-2xl font-bold text-gray-900">{word.word}</Text>
              <AudioButton url={word.audio_url} />
              <View className="ml-auto"><StreakDots word={word} /></View>
            </View>
            {word.ipa ? <Text className="text-gray-500">{word.ipa}</Text> : null}
            {editing ? (
              <View className="gap-2">
                <TextField value={meaning} onChangeText={setMeaning} label={t.wordsMeaningLabel} maxLength={200} />
                <PrimaryButton label={t.wordsSave} onPress={() => void change({ meaningTr: meaning })} disabled={busy} />
              </View>
            ) : (
              <Pressable onPress={() => { setMeaning(word.meaning_tr ?? ""); setEditing(true); }}>
                {word.meaning_tr ? (
                  <Text className="text-lg text-gray-900">{word.meaning_tr} <Text className="text-sm text-emerald-700">{t.wordsMeaningEdit}</Text></Text>
                ) : (
                  <Text className="text-sm font-semibold text-emerald-700">{t.wordsMeaningAdd}</Text>
                )}
              </Pressable>
            )}
            {word.lookup === "found" ? <SenseList senses={word.senses} /> : (
              <Pressable onPress={() => void change({ relookup: true })} disabled={busy}>
                <Text className="text-sm text-gray-700">
                  {word.lookup === "not_found" ? t.wordsLookupMissing : t.wordsLookupFailed} <Text className="font-semibold text-emerald-700">{t.wordsLookupRetry}</Text>
                </Text>
              </Pressable>
            )}
            {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
            <View className="flex-row gap-4 border-t border-gray-100 pt-3">
              {word.learned_at ? (
                <Pressable onPress={() => void change({ unlearn: true })} disabled={busy}><Text className="text-sm text-gray-700">{t.wordsUnlearn}</Text></Pressable>
              ) : null}
              <Pressable onPress={remove}><Text className="text-sm text-red-600">{t.wordsDelete}</Text></Pressable>
            </View>
            {word.lookup === "found" ? <Text className="text-xs text-gray-400">{t.wordsSource}</Text> : null}
          </View>
        ) : null}
      </ScrollView>
    </TabScreen>
  );
}
