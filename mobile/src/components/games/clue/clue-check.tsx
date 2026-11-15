import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { CLUE_STRIKE_KEYS, clueStrikeReason, fillTemplate, type ClueEntry } from "@ptracker/shared/clue-game";
import { PrimaryButton } from "@/components/ui/primary-button";

// For the clue givers only: the word, every clue and its writer. A press strikes or restores
// a clue; the label says which, not only the line through it.
export function ClueCheck({
  word,
  guesser,
  clues,
  onStrike,
  onDone,
}: {
  word: string;
  guesser: string;
  clues: readonly ClueEntry[];
  onStrike: (index: number) => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  return (
    <View className="gap-5 py-2">
      <Text className="text-center text-sm font-semibold text-gray-500">{fillTemplate(t.clueCheckHint, { name: guesser })}</Text>
      <View className="gap-1">
        <Text className="text-center text-sm text-gray-500">{t.clueTheWord}</Text>
        <Text className="text-center text-4xl font-black text-gray-900">{word}</Text>
      </View>
      <Text className="text-center text-sm text-gray-500">{t.clueCheckIntro}</Text>
      <View className="gap-2">
        {clues.map((c, i) => {
          const why = clueStrikeReason(c);
          const reason = why === null ? null : t[CLUE_STRIKE_KEYS[why]];
          const label =
            reason === null
              ? fillTemplate(t.clueKeptLabel, { clue: c.text, name: c.giver })
              : fillTemplate(t.clueStruckLabel, { clue: c.text, name: c.giver, reason });
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => onStrike(i)}
              className="flex-row items-center justify-between gap-3 rounded-xl border border-gray-100 bg-surface px-4 py-3">
              <View className="flex-1">
                <Text
                  className={`text-lg font-semibold ${reason === null ? "text-gray-900" : "text-gray-400"}`}
                  style={reason === null ? undefined : { textDecorationLine: "line-through" }}>
                  {c.text}
                </Text>
                {reason !== null ? <Text className="text-xs text-gray-500">{reason}</Text> : null}
              </View>
              <Text className="text-sm text-gray-500">{c.giver}</Text>
            </Pressable>
          );
        })}
      </View>
      <PrimaryButton label={fillTemplate(t.clueToGuess, { name: guesser })} onPress={onDone} />
    </View>
  );
}
