import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import type { HuntPhase } from "@ptracker/shared/bill-hunt";
import { fillTemplate } from "@ptracker/shared/scale-game";
import { PrimaryButton } from "@/components/ui/primary-button";

export function HuntOverlay({
  phase,
  month,
  coins,
  score,
  sped,
  best,
  newBest,
  guard,
  ink,
  onStart,
  onSpeedUp,
  onCallBack,
  onAgain,
  onBack,
}: {
  phase: HuntPhase;
  month: number;
  coins: number;
  score: number;
  sped: boolean;
  /** Null while the stored best is not known yet: the best line stays blank but keeps its space. */
  best: number | null;
  newBest: boolean;
  guard: boolean;
  ink: string;
  onStart: () => void;
  onSpeedUp: () => void;
  onCallBack: () => void;
  onAgain: () => void;
  onBack: () => void;
}) {
  const { t } = useLang();
  const bestLine = best !== null ? fillTemplate(t.soloBest, { n: String(best) }) : " ";
  if (phase === "ready") {
    return (
      <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
        <Text style={{ color: ink }}>{bestLine}</Text>
        <Text style={{ color: ink, textAlign: "center", opacity: 0.8 }}>{t.huntDesc}</Text>
        <View style={{ alignSelf: "stretch" }}>
          <PrimaryButton label={t.huntStart} onPress={onStart} />
        </View>
        <Text style={{ color: ink, fontSize: 12, opacity: 0.7 }}>{t.huntHint}</Text>
      </View>
    );
  }
  if (phase === "aiming" || phase === "throwing") {
    return (
      <>
        <View pointerEvents="none" style={{ position: "absolute", top: 8, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: ink, fontWeight: "700" }}>{fillTemplate(t.huntMonth, { n: String(month) })}</Text>
          <Text style={{ color: ink, fontWeight: "700" }}>{fillTemplate(t.huntCoins, { n: String(coins) })}</Text>
        </View>
        {phase === "throwing" ? (
          <View style={{ position: "absolute", bottom: 8, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 8 }}>
            <Pressable onPress={onSpeedUp} disabled={sped} style={{ backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, opacity: sped ? 0.4 : 1 }}>
              <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 12 }}>⏩ {t.huntSpeedUp}</Text>
            </Pressable>
            <Pressable onPress={onCallBack} style={{ backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 12 }}>{t.huntCallBack}</Text>
            </Pressable>
          </View>
        ) : null}
      </>
    );
  }
  return (
    <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.2)", padding: 24 }}>
      <View className="w-full gap-3 rounded-2xl bg-surface p-5">
        <Text className="text-center text-sm text-gray-500">{t.huntScore}</Text>
        <Text className="text-center text-5xl font-bold text-gray-900">{score}</Text>
        {newBest ? (
          <Text className="text-center font-semibold text-amber-700">{t.soloNewBest}</Text>
        ) : (
          <Text className="text-center text-sm text-gray-700">{bestLine}</Text>
        )}
        <PrimaryButton label={t.soloAgain} onPress={onAgain} disabled={guard} />
        <Pressable onPress={onBack} disabled={guard} className={`items-center py-2 ${guard ? "opacity-50" : ""}`}>
          <Text className="text-sm text-gray-500">{t.soloBackToGames}</Text>
        </Pressable>
      </View>
    </View>
  );
}
