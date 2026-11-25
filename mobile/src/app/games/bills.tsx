import { useCallback, useEffect, useRef, useState } from "react";
import { PanResponder, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { startFrameLoop } from "@ptracker/shared/frame-loop";
import {
  HUNT_COLORS,
  HUNT_OVER_GUARD_MS,
  SPEED_UP,
  huntAim,
  huntAimEnd,
  huntCallBack,
  huntFire,
  huntSpeedUp,
  huntStart,
  huntViewport,
  newHuntGame,
  stepHunt,
  type HuntItem,
  type HuntPhase,
  type HuntState,
} from "@ptracker/shared/bill-hunt";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { HuntOverlay } from "@/components/games/bills/hunt-overlay";
import { HuntWorld, useHuntView } from "@/components/games/bills/hunt-world";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppLock } from "@/lib/app-lock-context";
import { getStoredHuntBest, setStoredHuntBest } from "@/lib/bill-hunt-storage";
import { leaveGameScreen, useConfirmLeave } from "@/lib/leave-game";
import { useGameOnScreen } from "@/lib/use-game-on-screen";
import { useSoloBest } from "@/lib/use-solo-best";

interface Shown {
  phase: HuntPhase;
  month: number;
  coins: number;
  score: number;
  sped: boolean;
  launcher: number;
  items: HuntItem[];
}

const shownOf = (s: HuntState): Shown => ({
  phase: s.phase,
  month: s.month,
  coins: s.coins,
  score: s.score,
  sped: s.shot?.speed === SPEED_UP,
  launcher: s.launcher,
  items: s.items,
});
const sameShown = (a: Shown, b: Shown) =>
  a.phase === b.phase && a.month === b.month && a.coins === b.coins && a.score === b.score && a.sped === b.sped && a.launcher === b.launcher && a.items === b.items;

export default function BillsScreen() {
  const { t } = useLang();
  const pinReady = useEnterGameModeOnce();
  const onScreen = useGameOnScreen();
  const dark = useColorScheme() === "dark";
  const { lock } = useAppLock();
  const view = useHuntView();
  const live = useRef<HuntState>(newHuntGame(Math.random));
  // The pull: the board's scale for turning pixels into world units, and the angle being aimed.
  const pull = useRef({ scale: 1, angle: null as number | null });
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [shown, setShown] = useState<Shown>(() => shownOf(live.current));
  const { best, newBest, record, clearNewBest } = useSoloBest(getStoredHuntBest, setStoredHuntBest);
  const [guard, setGuard] = useState(false);

  const publish = useCallback(
    (next: HuntState) => {
      // Guard the game-over card from its first frame, so a late tap cannot reach its buttons.
      if (next.phase === "over" && live.current.phase !== "over") setGuard(true);
      live.current = next;
      const angle = pull.current.angle;
      view.sync(next, next.phase === "aiming" && angle !== null ? huntAimEnd(next, angle) : null);
      const v = shownOf(next);
      setShown((old) => (sameShown(old, v) ? old : v));
    },
    [view]
  );

  const aimAt = useCallback(
    (angle: number | null) => {
      pull.current.angle = angle;
      publish(live.current);
    },
    [publish]
  );

  // The responder is made once, so it reaches the latest callbacks through this ref.
  const act = useRef({ aimAt, publish });
  useEffect(() => {
    act.current = { aimAt, publish };
  }, [aimAt, publish]);

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => live.current.phase === "aiming",
      onMoveShouldSetPanResponder: () => live.current.phase === "aiming",
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => act.current.aimAt(null),
      onPanResponderMove: (_e, g) => act.current.aimAt(huntAim(g.dx / pull.current.scale, g.dy / pull.current.scale)),
      onPanResponderRelease: (_e, g) => {
        const angle = huntAim(g.dx / pull.current.scale, g.dy / pull.current.scale);
        act.current.aimAt(null);
        if (angle !== null) act.current.publish(huntFire(live.current, angle));
      },
      onPanResponderTerminate: () => act.current.aimAt(null),
    })
  );

  const fresh = useCallback(() => {
    pull.current.angle = null;
    publish(huntStart(newHuntGame(Math.random)));
    clearNewBest();
    setGuard(false);
  }, [publish, clearNewBest]);

  // The throw stops while the screen is not shown, and goes on where it was when it is again.
  useEffect(() => {
    if (shown.phase !== "throwing" || !onScreen) return;
    return startFrameLoop((dt) => {
      const next = stepHunt(live.current, dt, Math.random);
      publish(next);
      return next.phase === "throwing";
    });
  }, [shown.phase, onScreen, publish]);

  useEffect(() => {
    if (shown.phase !== "over") return;
    const stop = record(live.current.score);
    const id = setTimeout(() => setGuard(false), HUNT_OVER_GUARD_MS);
    return () => {
      stop();
      clearTimeout(id);
    };
  }, [shown.phase]);

  const playing = shown.phase === "aiming" || shown.phase === "throwing";
  useConfirmLeave(playing);

  if (!pinReady) return <GamesPinSetup title={t.huntTitle} />;

  return (
    <GameScreen title={t.huntTitle} tone="game" scroll={false} nav={!playing} confirmBack={playing}>
      <View
        className="flex-1 overflow-hidden rounded-2xl"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          pull.current.scale = huntViewport(width, height).scale;
          setSize({ w: width, h: height });
        }}
        {...responder.panHandlers}>
        {size ? (
          <HuntWorld view={view} items={shown.items} month={shown.month} launcher={shown.launcher} phase={shown.phase} width={size.w} height={size.h} dark={dark} />
        ) : (
          <View />
        )}
        <HuntOverlay
          phase={shown.phase}
          month={shown.month}
          coins={shown.coins}
          score={shown.score}
          sped={shown.sped}
          best={best}
          newBest={newBest}
          guard={guard}
          ink={(dark ? HUNT_COLORS.dark : HUNT_COLORS.light).ink}
          onStart={() => publish(huntStart(live.current))}
          onSpeedUp={() => publish(huntSpeedUp(live.current))}
          onCallBack={() => publish(huntCallBack(live.current, Math.random))}
          onAgain={fresh}
          onBack={() => leaveGameScreen(lock.gameMode)}
        />
      </View>
    </GameScreen>
  );
}
