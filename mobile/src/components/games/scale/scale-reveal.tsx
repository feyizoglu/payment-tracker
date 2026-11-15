import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  SCALE_OUTCOME_KEYS,
  SCALE_REVEAL_LOCK_MS,
  fillTemplate,
  scaleDistanceKey,
  scaleOutcome,
  scalePoints,
  type ScalePair,
  type WordTeam,
} from "@ptracker/shared/scale-game";
import { ScaleBar, ScaleEnds } from "@/components/games/scale/scale-track";
import { WordScores } from "@/components/games/word/word-scores";
import { PrimaryButton } from "@/components/ui/primary-button";

// The band and the needle together, with the points written. Mount it with `key` per turn.
export function ScaleReveal({
  pair,
  target,
  needle,
  team,
  color,
  teams,
  scores,
  revealedAt,
  onNext,
}: {
  pair: ScalePair;
  target: number;
  needle: number;
  team: string;
  color: string;
  teams: readonly WordTeam[];
  /** Including this turn's points. */
  scores: readonly number[];
  /** When the needle was locked: Next opens SCALE_REVEAL_LOCK_MS later, as in the game. */
  revealedAt: number;
  onNext: () => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const distance = Math.abs(needle - target);
  const points = scalePoints(distance);

  useEffect(() => {
    const id = setTimeout(() => setOpen(true), Math.max(0, revealedAt + SCALE_REVEAL_LOCK_MS - Date.now()));
    return () => clearTimeout(id);
  }, [revealedAt]);

  return (
    <View className="gap-5 py-4">
      <Text className="text-center text-3xl font-bold text-gray-900">{t[SCALE_OUTCOME_KEYS[scaleOutcome(points)]]}</Text>
      <Text className="text-center text-xl font-semibold" style={{ color }}>
        {fillTemplate(t.scaleTurnPoints, { team, n: String(points) })}
      </Text>
      <ScaleEnds pair={pair} />
      <ScaleBar target={target} needle={needle} />
      <Text className="text-center text-sm text-gray-500">
        {fillTemplate(t[scaleDistanceKey(distance)], { n: String(distance) })}
      </Text>
      <WordScores teams={teams} scores={scores} />
      <PrimaryButton label={t.scaleNext} onPress={onNext} disabled={!open} />
    </View>
  );
}
