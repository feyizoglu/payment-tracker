import { View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { CLUE_DECK_SIZES, CLUE_LEVELS, CLUE_LEVEL_KEYS, type ClueLevel, type ClueSetup } from "@ptracker/shared/clue-game";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

export function ClueRulesStep({
  value,
  onChange,
}: {
  value: ClueSetup;
  onChange: (next: ClueSetup) => void;
}) {
  const { t } = useLang();
  return (
    <View className="gap-5">
      <SegmentedToggle
        label={t.clueDeck}
        value={String(value.deckSize)}
        options={CLUE_DECK_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(n) => onChange({ ...value, deckSize: Number(n) })}
      />
      <SegmentedToggle
        label={t.clueLevel}
        value={value.level}
        options={CLUE_LEVELS.map((level) => ({ value: level, label: t[CLUE_LEVEL_KEYS[level]] }))}
        onChange={(level) => onChange({ ...value, level: level as ClueLevel })}
      />
    </View>
  );
}
