import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  FUSE_LABEL_KEYS,
  FUSE_SECONDS,
  LIVES_CHOICES,
  POTATO_FUSES,
  POTATO_TASK_MODES,
  TASK_MODE_KEYS,
  fillTemplate,
  type PotatoSetup,
} from "@ptracker/shared/hot-potato";
import { Field } from "@/components/ui/field";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

const card = (active: boolean) => `rounded-xl border-2 bg-surface p-3 ${active ? "border-white" : "border-gray-100 opacity-60"}`;

export function PotatoRulesStep({
  value,
  onChange,
}: {
  value: PotatoSetup;
  onChange: (next: PotatoSetup) => void;
}) {
  const { t } = useLang();
  const set = (patch: Partial<PotatoSetup>) => onChange({ ...value, ...patch });

  return (
    <View className="gap-5">
      <SegmentedToggle
        label={t.potatoLives}
        value={String(value.lives)}
        options={LIVES_CHOICES.map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(n) => set({ lives: Number(n) })}
      />
      <Field label={t.potatoFuse}>
        <View className="flex-row gap-2">
          {POTATO_FUSES.map((fuse) => {
            const active = value.fuse === fuse;
            const [min, max] = FUSE_SECONDS[fuse];
            return (
              <Pressable
                key={fuse}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => set({ fuse })}
                className={`flex-1 items-center ${card(active)}`}>
                <Text className="text-base font-semibold text-gray-900">{t[FUSE_LABEL_KEYS[fuse]]}</Text>
                <Text className="text-sm text-gray-500">
                  {fillTemplate(t.potatoFuseRange, { min: String(min), max: String(max) })}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
      <Field label={t.potatoTasks}>
        <View className="gap-2">
          {POTATO_TASK_MODES.map((tasks) => {
            const active = value.tasks === tasks;
            return (
              <Pressable
                key={tasks}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => set({ tasks })}
                className={card(active)}>
                <Text className="text-base font-semibold text-gray-900">{t[TASK_MODE_KEYS[tasks].label]}</Text>
                <Text className="text-sm text-gray-500">{t[TASK_MODE_KEYS[tasks].hint]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
    </View>
  );
}
