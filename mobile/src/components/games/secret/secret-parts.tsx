import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  SECRET_COLORS,
  SECRET_KEY_ROWS,
  secretCanReveal,
  secretLines,
  secretTriesUsed,
  type SecretMark,
  type SecretRound,
  type SecretSlot,
} from "@ptracker/shared/secret-word";
import { fillTemplate } from "@ptracker/shared/word-game";
import { PrimaryButton } from "@/components/ui/primary-button";

export type SecretPalette = (typeof SECRET_COLORS)["light" | "dark"];

function slotStyle(mark: SecretSlot["mark"], c: SecretPalette): { box: ViewStyle; text: TextStyle } {
  switch (mark) {
    case "hit":
      return { box: { backgroundColor: c.hit, borderRadius: 999 }, text: { color: c.onHit } };
    case "near":
      return { box: { borderBottomWidth: 4, borderBottomColor: c.near }, text: { color: c.ink } };
    case "miss":
      return { box: {}, text: { color: c.miss, textDecorationLine: "line-through" } };
    case "typed":
      return { box: {}, text: { color: c.ink } };
    case "empty":
      return { box: { borderBottomWidth: 2, borderBottomColor: c.line }, text: { color: c.ink } };
  }
}

export function SecretLetter({ slot, palette, size }: { slot: SecretSlot; palette: SecretPalette; size: number }) {
  const { box, text } = slotStyle(slot.mark, palette);
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, box]}>
      <Text style={[{ fontSize: size * 0.55, fontWeight: "700" }, text]}>{slot.letter}</Text>
    </View>
  );
}

/** The notebook page; `height` is the space it may fill. */
export function SecretBoard({
  round,
  palette,
  width,
  height,
}: {
  round: SecretRound;
  palette: SecretPalette;
  width: number;
  height: number;
}) {
  const lines = secretLines(round);
  const lineH = Math.min(56, height / lines.length);
  const size = Math.min(lineH, Math.max(16, Math.min(40, lineH - 10, (width - 64) / 5 - 8)));
  return (
    <View style={{ backgroundColor: palette.paper, borderRadius: 16, paddingLeft: 36, paddingRight: 12 }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 24, width: 1, backgroundColor: palette.margin }} />
      {lines.map((line, i) => (
        <View
          key={i}
          style={{
            height: lineH,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderBottomWidth: 1,
            borderBottomColor: palette.line,
          }}>
          {line.map((slot, j) => (
            <SecretLetter key={j} slot={slot} palette={palette} size={size} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function SecretLegend({ palette }: { palette: SecretPalette }) {
  const { t } = useLang();
  const item = (mark: SecretMark, label: string) => (
    <View key={mark} className="flex-row items-center gap-1">
      <SecretLetter slot={{ letter: "A", mark }} palette={palette} size={20} />
      <Text className="text-xs text-gray-500">{label}</Text>
    </View>
  );
  return (
    <View className="flex-row justify-center gap-4">
      {item("hit", t.secretLegendHit)}
      {item("near", t.secretLegendNear)}
      {item("miss", t.secretLegendMiss)}
    </View>
  );
}

function keyLook(mark: SecretMark | undefined, c: SecretPalette): { box: ViewStyle; text: TextStyle } {
  const box: ViewStyle = { backgroundColor: c.key };
  if (mark === "hit") return { box: { backgroundColor: c.hit }, text: { color: c.onHit } };
  if (mark === "near") return { box: { ...box, borderBottomWidth: 4, borderBottomColor: c.near }, text: { color: c.ink } };
  if (mark === "miss") return { box, text: { color: c.miss } };
  return { box, text: { color: c.ink } };
}

function Key({
  label,
  spoken,
  mark,
  palette,
  grow = 1,
  onRelease = false,
  onPress,
}: {
  label: string;
  spoken?: string;
  mark?: SecretMark;
  palette: SecretPalette;
  grow?: number;
  /** Fire on release, so a thumb resting on the key does nothing. */
  onRelease?: boolean;
  onPress: () => void;
}) {
  const look = keyLook(mark, palette);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken ?? label}
      onPressIn={onRelease ? undefined : onPress}
      onPress={onRelease ? onPress : undefined}
      style={[{ flex: grow, height: 46, borderRadius: 6, alignItems: "center", justifyContent: "center" }, look.box]}>
      <Text style={[{ fontSize: 17, fontWeight: "600" }, look.text]}>{label}</Text>
    </Pressable>
  );
}

export function SecretReveal({ round, onReveal }: { round: SecretRound; onReveal: () => void }) {
  const { t } = useLang();
  const can = secretCanReveal(round);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !can }}
      disabled={!can}
      onPress={onReveal}
      className="self-center rounded-full border border-gray-200 px-3 py-1"
      style={{ opacity: can ? 1 : 0.4 }}>
      <Text className="text-sm font-semibold text-indigo-300">{t.secretReveal}</Text>
    </Pressable>
  );
}

export function SecretKeyboard({
  round,
  marks,
  palette,
  onKey,
}: {
  round: SecretRound;
  marks: Record<string, SecretMark>;
  palette: SecretPalette;
  onKey: (key: string) => void;
}) {
  const { t } = useLang();
  const rows = SECRET_KEY_ROWS[round.lang];
  return (
    <View style={{ gap: 6 }}>
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        return (
          <View key={i} style={{ flexDirection: "row", gap: 4 }}>
            {last ? <Key label="↵" spoken={t.secretEnter} palette={palette} grow={1.6} onRelease onPress={() => onKey("Enter")} /> : null}
            {row.map((letter) => (
              <Key key={letter} label={letter} mark={marks[letter]} palette={palette} onPress={() => onKey(letter)} />
            ))}
            {last ? <Key label="⌫" spoken={t.secretDelete} palette={palette} grow={1.6} onPress={() => onKey("Backspace")} /> : null}
          </View>
        );
      })}
    </View>
  );
}

export function SecretResult({
  round,
  streak,
  best,
  newBest,
  onNext,
  onBack,
}: {
  round: SecretRound;
  streak: number;
  best: number;
  newBest: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useLang();
  const won = round.phase === "won";
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Text className="text-center text-lg font-semibold text-gray-900">
        {won ? fillTemplate(t.secretWon, { n: String(secretTriesUsed(round)) }) : fillTemplate(t.secretLost, { word: round.card.word })}
      </Text>
      {won ? <Text className="text-center text-sm text-gray-700">{fillTemplate(t.secretStreak, { n: String(streak) })}</Text> : null}
      {newBest ? (
        <Text className="text-center font-semibold text-amber-700">{t.soloNewBest}</Text>
      ) : (
        <Text className="text-center text-sm text-gray-500">{fillTemplate(t.soloBest, { n: String(best) })}</Text>
      )}
      <PrimaryButton label={won ? t.secretNext : t.soloAgain} onPress={onNext} />
      <Pressable onPress={onBack} className="items-center py-2">
        <Text className="text-sm text-gray-500">{t.soloBackToGames}</Text>
      </Pressable>
    </View>
  );
}
