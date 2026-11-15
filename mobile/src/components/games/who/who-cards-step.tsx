import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  GAME_THEME,
  WHO_KINDS,
  WHO_KIND_EMOJI,
  WHO_KIND_KEYS,
  WHO_LEVEL_CHOICES,
  WHO_LEVEL_KEYS,
  WHO_REGION_CHOICES,
  WHO_REGION_KEYS,
  playerColor,
  type WhoKind,
  type WhoLevelChoice,
  type WhoRegionChoice,
  type WhoSetup,
} from "@ptracker/shared/who-game";
import { Field } from "@/components/ui/field";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

export function WhoCardsStep({
  value,
  onChange,
}: {
  value: WhoSetup;
  onChange: (next: WhoSetup) => void;
}) {
  const { t } = useLang();
  const ink = { color: GAME_THEME.ink };
  const toggle = (kind: WhoKind) =>
    onChange({ ...value, kinds: WHO_KINDS.filter((k) => (k === kind) !== value.kinds.includes(k)) });
  // Things have no region: the choice shows only while people or characters are on.
  const regional = value.kinds.some((k) => k !== "things");

  return (
    <View className="gap-5">
      <Field label={t.whoKinds}>
        <View className="gap-2">
          {WHO_KINDS.map((kind, i) => {
            const active = value.kinds.includes(kind);
            const label = t[WHO_KIND_KEYS[kind].label];
            const hint = t[WHO_KIND_KEYS[kind].hint];
            return (
              <Pressable
                key={kind}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${label}, ${hint}`}
                onPress={() => toggle(kind)}
                className={`flex-row items-center gap-3 rounded-2xl border-4 px-4 py-3 ${
                  active ? "border-white" : "border-transparent opacity-60"
                }`}
                style={{ backgroundColor: playerColor(2 * i + 1) }}>
                <Text className="text-3xl">{WHO_KIND_EMOJI[kind]}</Text>
                <View className="flex-1">
                  <Text className="text-base font-semibold" style={ink}>
                    {label}
                  </Text>
                  <Text className="text-sm" style={ink}>
                    {hint}
                  </Text>
                </View>
                <Text className="text-xl font-bold" style={ink}>
                  {active ? "✓" : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
      {regional ? (
        <SegmentedToggle
          label={t.whoRegion}
          hint={t.whoRegionHint}
          value={value.region}
          options={WHO_REGION_CHOICES.map((region) => ({ value: region, label: t[WHO_REGION_KEYS[region]] }))}
          onChange={(region) => onChange({ ...value, region: region as WhoRegionChoice })}
        />
      ) : null}
      <SegmentedToggle
        label={t.whoLevel}
        value={value.level}
        options={WHO_LEVEL_CHOICES.map((level) => ({ value: level, label: t[WHO_LEVEL_KEYS[level]] }))}
        onChange={(level) => onChange({ ...value, level: level as WhoLevelChoice })}
      />
    </View>
  );
}
