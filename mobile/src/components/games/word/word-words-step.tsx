import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { playerColor } from "@ptracker/shared/imposter";
import {
  GAME_THEME,
  WORD_CATEGORY_CHOICES,
  WORD_CATEGORY_EMOJI,
  WORD_CATEGORY_LABEL_KEYS,
  WORD_DIFFICULTIES,
  WORD_DIFFICULTY_KEYS,
  type WordDifficulty,
  type WordSetup,
} from "@ptracker/shared/word-game";
import { Field } from "@/components/ui/field";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

export function WordWordsStep({
  value,
  onChange,
}: {
  value: WordSetup;
  onChange: (next: WordSetup) => void;
}) {
  const { t } = useLang();
  return (
    <View className="gap-5">
      <Field label={t.wordCategory}>
        <View className="flex-row flex-wrap gap-3">
          {WORD_CATEGORY_CHOICES.map((c, i) => {
            const active = value.category === c;
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onChange({ ...value, category: c })}
                className={`grow basis-[45%] items-center gap-1 rounded-2xl border-4 px-3 py-4 ${
                  active ? "border-white" : "border-transparent opacity-60"
                }`}
                style={{ backgroundColor: playerColor(i) }}>
                <Text className="text-3xl">{WORD_CATEGORY_EMOJI[c]}</Text>
                <Text className="text-base font-semibold" style={{ color: GAME_THEME.ink }}>
                  {t[WORD_CATEGORY_LABEL_KEYS[c]]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
      <SegmentedToggle
        label={t.wordDifficulty}
        value={value.difficulty}
        options={WORD_DIFFICULTIES.map((d) => ({ value: d, label: t[WORD_DIFFICULTY_KEYS[d]] }))}
        onChange={(d) => onChange({ ...value, difficulty: d as WordDifficulty })}
      />
    </View>
  );
}
