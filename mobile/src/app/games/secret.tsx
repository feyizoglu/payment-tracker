import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { useLang, type Lang } from "@ptracker/shared/i18n";
import { bestAfter, newSessionBest, sessionRead } from "@ptracker/shared/best-score";
import {
  SECRET_COLORS,
  SECRET_END_GUARD_MS,
  keyMarks,
  newSecretRound,
  pickSecret,
  secretCardsFor,
  secretDelete,
  secretLetter,
  secretOpen,
  secretSubmit,
  secretType,
  type SecretRound,
} from "@ptracker/shared/secret-word";
import { WORD_CATEGORY_EMOJI, WORD_CATEGORY_LABEL_KEYS, fillTemplate } from "@ptracker/shared/word-game";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { SecretBoard, SecretKeyboard, SecretLegend, SecretResult } from "@/components/games/secret/secret-parts";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppLock } from "@/lib/app-lock-context";
import { leaveGameScreen, useConfirmLeave } from "@/lib/leave-game";
import {
  getStoredSecretBest,
  getStoredSecretSeen,
  setStoredSecretBest,
  setStoredSecretSeen,
} from "@/lib/secret-word-storage";

export default function SecretScreen() {
  const { t, lang } = useLang();
  const pinReady = useEnterGameModeOnce();
  const dark = useColorScheme() === "dark";
  const { lock } = useAppLock();
  const live = useRef<SecretRound | null>(null);
  const [round, setRound] = useState<SecretRound | null>(null);
  // Read once when the screen opens; afterwards only written, so no read can land out of order.
  const seen = useRef<Record<Lang, string[]>>({ tr: [], en: [] });
  const [loaded, setLoaded] = useState(false);
  const streak = useRef(0);
  const [shownStreak, setShownStreak] = useState(0);
  const session = useRef(newSessionBest());
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const endedAt = useRef(0);
  const [board, setBoard] = useState<{ w: number; h: number } | null>(null);

  const deal = useCallback((lang: Lang) => {
    const picked = pickSecret(secretCardsFor(lang), seen.current[lang], Math.random);
    seen.current[lang] = picked.seen;
    void setStoredSecretSeen(lang, picked.seen);
    live.current = newSecretRound(picked.card, lang);
    setRound(live.current);
    setNewBest(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([getStoredSecretBest(), getStoredSecretSeen("tr"), getStoredSecretSeen("en")]).then(([stored, tr, en]) => {
      session.current = sessionRead(session.current, stored);
      seen.current = { tr, en };
      if (!alive) return;
      setBest(session.current.best);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (loaded && !live.current) deal(lang);
  }, [loaded, lang, deal]);

  const apply = useCallback((next: SecretRound) => {
    const prev = live.current;
    if (!prev || next === prev) return;
    live.current = next;
    setRound(next);
    if (prev.phase !== "playing" || next.phase === "playing") return;
    endedAt.current = Date.now();
    if (next.phase === "lost") {
      streak.current = 0;
      setShownStreak(0);
      return;
    }
    streak.current += 1;
    setShownStreak(streak.current);
    // The stored best was read when the screen opened and is only written since.
    const after = bestAfter(streak.current, session.current, null);
    session.current = after.session;
    if (after.save !== null) void setStoredSecretBest(after.save);
    setNewBest(after.isNew);
    setBest(after.session.best);
  }, []);

  const press = useCallback(
    (key: string) => {
      const r = live.current;
      if (!r) return;
      if (key === "Enter") return apply(secretSubmit(r));
      if (key === "Backspace") return apply(secretDelete(r));
      const letter = secretLetter(key, r.lang);
      if (letter) apply(secretType(r, letter));
    },
    [apply]
  );

  const guarded = () => Date.now() - endedAt.current < SECRET_END_GUARD_MS;

  const open = secretOpen(round, shownStreak);
  useConfirmLeave(open);

  if (!pinReady) return <GamesPinSetup title={t.secretTitle} />;

  const palette = dark ? SECRET_COLORS.dark : SECRET_COLORS.light;
  return (
    <GameScreen title={t.secretTitle} tone="game" scroll={false} nav={!open} confirmBack={open}>
      {round ? (
        <>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-gray-700">
              {fillTemplate(t.secretHint, {
                category: `${WORD_CATEGORY_EMOJI[round.card.category]} ${t[WORD_CATEGORY_LABEL_KEYS[round.card.category]]}`,
              })}
            </Text>
            <Text className="text-sm font-semibold text-gray-700">{fillTemplate(t.secretStreak, { n: String(shownStreak) })}</Text>
          </View>
          <View className="flex-1" onLayout={(e) => setBoard({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {board ? <SecretBoard round={round} palette={palette} width={board.w} height={board.h} /> : null}
          </View>
          <SecretLegend palette={palette} />
          {round.phase === "playing" ? (
            <>
              <Text className="h-5 text-center text-sm font-semibold text-gray-700">{round.short ? t.secretShort : ""}</Text>
              <SecretKeyboard round={round} marks={keyMarks(round.guesses, round.card.word)} palette={palette} onKey={press} />
            </>
          ) : (
            <SecretResult
              round={round}
              streak={shownStreak}
              best={best}
              newBest={newBest}
              onNext={() => {
                if (!guarded()) deal(lang);
              }}
              onBack={() => {
                if (!guarded()) leaveGameScreen(lock.gameMode);
              }}
            />
          )}
        </>
      ) : (
        <View className="flex-1" />
      )}
    </GameScreen>
  );
}
