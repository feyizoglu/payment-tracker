import { Pressable, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { openBrowserAsync } from "expo-web-browser";

import { useLang } from "@ptracker/shared/i18n";
import { VOCAB_LEARNED_STREAK, senseGroups, type VocabSense, type VocabWord } from "@ptracker/shared/vocab";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function StreakDots({ word }: { word: Pick<VocabWord, "streak" | "learned_at"> }) {
  return (
    <Text className="tracking-widest text-emerald-700">
      {word.learned_at ? "✓" : "●".repeat(word.streak) + "○".repeat(VOCAB_LEARNED_STREAK - word.streak)}
    </Text>
  );
}

export function SenseList({ senses }: { senses: readonly VocabSense[] }) {
  return (
    <View className="gap-3">
      {senseGroups(senses).map((g) => (
        <View key={g.pos} className="gap-1">
          <Text className="text-xs font-semibold uppercase text-gray-500">{g.pos}</Text>
          {g.senses.map((s, i) => (
            <View key={i}>
              <Text className="text-sm text-gray-900">{i + 1}. {s.definition}</Text>
              {s.example ? <Text className="text-sm italic text-gray-500">“{s.example}”</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The phone build has no audio module; the recording opens in an in-app browser tab. */
export function AudioButton({ url }: { url: string | null }) {
  const { t } = useLang();
  // Emerald 700 in the light theme, the mint the dark theme gives emerald 700.
  const tint = useColorScheme() === "dark" ? "#6ee7b7" : "#047857";
  if (!url) return null;
  return (
    <Pressable accessibilityLabel={t.wordsListen} onPress={() => void openBrowserAsync(url)} className="p-2">
      <SymbolView name={{ ios: "speaker.wave.2", android: "volume_up", web: "volume_up" }} size={22} tintColor={tint} />
    </Pressable>
  );
}
