import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  PASS_LIMITS,
  ROUND_CHOICES,
  TARGET_CHOICES,
  TURN_SECONDS,
  WORD_END_BYS,
  WORD_MODES,
  WORD_MODE_KEYS,
  type WordEndBy,
  type WordSetup,
} from "@ptracker/shared/word-game";
import { Field } from "@/components/ui/field";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

const UNLIMITED = "unlimited";

export function WordRulesStep({
  value,
  onChange,
}: {
  value: WordSetup;
  onChange: (next: WordSetup) => void;
}) {
  const { t } = useLang();
  const set = (patch: Partial<WordSetup>) => onChange({ ...value, ...patch });
  const numbers = (list: readonly number[]) => list.map((n) => ({ value: String(n), label: String(n) }));

  return (
    <View className="gap-5">
      <Field label={t.wordMode}>
        <View className="gap-2">
          {WORD_MODES.map((mode) => {
            const active = value.mode === mode;
            return (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => set({ mode })}
                className={`rounded-xl border-2 bg-surface p-3 ${active ? "border-white" : "border-gray-100 opacity-60"}`}>
                <Text className="text-base font-semibold text-gray-900">{t[WORD_MODE_KEYS[mode].label]}</Text>
                <Text className="text-sm text-gray-500">{t[WORD_MODE_KEYS[mode].rule]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
      <SegmentedToggle
        label={t.wordTurnTime}
        value={String(value.turnSeconds)}
        options={TURN_SECONDS.map((n) => ({ value: String(n), label: t.wordSeconds.replace("{n}", String(n)) }))}
        onChange={(n) => set({ turnSeconds: Number(n) })}
      />
      <SegmentedToggle
        label={t.wordPasses}
        value={value.passLimit === null ? UNLIMITED : String(value.passLimit)}
        options={PASS_LIMITS.map((n) =>
          n === null ? { value: UNLIMITED, label: t.wordPassesUnlimited } : { value: String(n), label: String(n) }
        )}
        onChange={(n) => set({ passLimit: n === UNLIMITED ? null : Number(n) })}
      />
      <SegmentedToggle
        label={t.wordEndBy}
        value={value.endBy}
        options={WORD_END_BYS.map((endBy) => ({
          value: endBy,
          label: endBy === "rounds" ? t.wordEndByRounds : t.wordEndByTarget,
        }))}
        onChange={(endBy) => set({ endBy: endBy as WordEndBy })}
      />
      {value.endBy === "rounds" ? (
        <SegmentedToggle
          label={t.wordRounds}
          value={String(value.rounds)}
          options={numbers(ROUND_CHOICES)}
          onChange={(n) => set({ rounds: Number(n) })}
        />
      ) : (
        <SegmentedToggle
          label={t.wordTarget}
          value={String(value.target)}
          options={numbers(TARGET_CHOICES)}
          onChange={(n) => set({ target: Number(n) })}
        />
      )}
    </View>
  );
}
