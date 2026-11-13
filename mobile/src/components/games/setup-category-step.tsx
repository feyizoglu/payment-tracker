import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CATEGORY_CHOICES,
  CATEGORY_EMOJI,
  CATEGORY_LABEL_KEYS,
  GAME_THEME,
  playerColor,
  type ImposterSetup,
} from "@ptracker/shared/imposter";

export function SetupCategoryStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  return (
    <View className="flex-row flex-wrap gap-3">
      {CATEGORY_CHOICES.map((c, i) => {
        const active = value.category === c;
        return (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange({ ...value, category: c })}
            className={`grow basis-[45%] items-center gap-1 rounded-2xl border-4 px-3 py-5 ${
              active ? "border-white" : "border-transparent opacity-60"
            }`}
            style={{ backgroundColor: playerColor(i) }}>
            <Text className="text-3xl">{CATEGORY_EMOJI[c]}</Text>
            <Text className="text-base font-semibold" style={{ color: GAME_THEME.ink }}>
              {t[CATEGORY_LABEL_KEYS[c]]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
