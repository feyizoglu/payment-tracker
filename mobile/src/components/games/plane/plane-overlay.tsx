import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import type { PlanePhase } from "@ptracker/shared/paper-plane";
import { fillTemplate } from "@ptracker/shared/scale-game";
import { PrimaryButton } from "@/components/ui/primary-button";

export function PlaneOverlay({
  phase,
  score,
  best,
  newBest,
  guard,
  ink,
  onAgain,
  onBack,
}: {
  phase: PlanePhase;
  score: number;
  best: number;
  newBest: boolean;
  guard: boolean;
  ink: string;
  onAgain: () => void;
  onBack: () => void;
}) {
  const { t } = useLang();
  const digits = { color: ink, fontSize: 48, fontWeight: "800" as const, fontStyle: "italic" as const };
  if (phase === "flying") {
    return (
      <View pointerEvents="none" style={{ position: "absolute", top: 16, left: 0, right: 0, alignItems: "center" }}>
        <Text style={digits}>{score}</Text>
      </View>
    );
  }
  if (phase === "ready" || phase === "paused") {
    return (
      <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 8 }}>
        {phase === "ready" ? (
          <Text style={{ color: ink }}>{fillTemplate(t.planeBest, { n: String(best) })}</Text>
        ) : (
          <Text style={digits}>{score}</Text>
        )}
        <Text style={{ color: ink, fontSize: 18, fontWeight: "600" }}>{phase === "ready" ? t.planeTapToStart : t.planeTapToContinue}</Text>
      </View>
    );
  }
  return (
    <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.2)", padding: 24 }}>
      <View className="w-full gap-3 rounded-2xl bg-surface p-5">
        <Text className="text-center text-sm text-gray-500">{t.planeScore}</Text>
        <Text className="text-center text-5xl font-bold text-gray-900">{score}</Text>
        {newBest ? (
          <Text className="text-center font-semibold text-sky-600">{t.planeNewBest}</Text>
        ) : (
          <Text className="text-center text-sm text-gray-700">{fillTemplate(t.planeBest, { n: String(best) })}</Text>
        )}
        <PrimaryButton label={t.planeAgain} onPress={onAgain} disabled={guard} />
        <Pressable onPress={onBack} disabled={guard} className={`items-center py-2 ${guard ? "opacity-50" : ""}`}>
          <Text className="text-sm text-gray-500">{t.planeBackToGames}</Text>
        </Pressable>
      </View>
    </View>
  );
}
