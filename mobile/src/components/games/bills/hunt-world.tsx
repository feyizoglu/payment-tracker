import { memo, useMemo } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";

import {
  BILL_GAP,
  COIN_CAP,
  COIN_R,
  HUNT_CELL,
  HUNT_COLORS,
  HUNT_H,
  HUNT_ICONS,
  HUNT_W,
  huntBillShade,
  huntViewport,
  type HuntItem,
  type HuntPhase,
  type HuntState,
} from "@ptracker/shared/bill-hunt";

const PARKED = -1000;
export const AIM_DOTS = 14;

export interface HuntView {
  /** Per coin slot x, y in world units, parked far off the board when empty. */
  coins: SharedValue<number[]>;
  /** Aim line start and end, x0 y0 x1 y1; parked when there is no aim. */
  aim: SharedValue<number[]>;
  sync: (s: HuntState, aimEnd: { x: number; y: number } | null) => void;
}

const parkedCoins = () => Array<number>(COIN_CAP * 2).fill(PARKED);

export function useHuntView(): HuntView {
  const coins = useSharedValue<number[]>(parkedCoins());
  const aim = useSharedValue<number[]>([PARKED, PARKED, PARKED, PARKED]);
  // Stable across renders: the screen's frame loop depends on it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    // Shared values are written only when they change: aiming publishes on every finger move.
    let coinsParked = true;
    let lastAim = [PARKED, PARKED, PARKED, PARKED].join(",");
    return { coins, aim, sync: (s: HuntState, aimEnd: { x: number; y: number } | null) => {
      const list = s.shot?.coins ?? [];
      if (list.length > 0 || !coinsParked) {
        const flat = parkedCoins();
        for (let i = 0; i < Math.min(list.length, COIN_CAP); i++) {
          flat[2 * i] = list[i].x;
          flat[2 * i + 1] = list[i].y;
        }
        coins.value = flat;
        coinsParked = list.length === 0;
      }
      const next = aimEnd ? [s.launcher, HUNT_H - COIN_R, aimEnd.x, aimEnd.y] : [PARKED, PARKED, PARKED, PARKED];
      const key = next.join(",");
      if (key !== lastAim) {
        aim.value = next;
        lastAim = key;
      }
    } };
  }, []);
}

function Coin({ view, slot, scale, fill }: { view: HuntView; slot: number; scale: number; fill: string }) {
  const { coins } = view;
  const style = useAnimatedStyle(() => ({
    left: (coins.value[2 * slot] - COIN_R) * scale,
    top: (coins.value[2 * slot + 1] - COIN_R) * scale,
  }));
  const size = 2 * COIN_R * scale;
  return <Animated.View style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: fill }, style]} />;
}

function AimDot({ view, dot, scale, fill }: { view: HuntView; dot: number; scale: number; fill: string }) {
  const { aim } = view;
  const style = useAnimatedStyle(() => {
    const [x0, y0, x1, y1] = aim.value;
    const k = (dot + 1) / AIM_DOTS;
    return { left: (x0 + (x1 - x0) * k) * scale - 1.5, top: (y0 + (y1 - y0) * k) * scale - 1.5 };
  });
  return <Animated.View style={[{ position: "absolute", width: 3, height: 3, borderRadius: 1.5, backgroundColor: fill }, style]} />;
}

function Cell({ item, month, scale, colors }: { item: HuntItem; month: number; scale: number; colors: (typeof HUNT_COLORS)["light" | "dark"] }) {
  if (item.kind === "bill") {
    const size = (HUNT_CELL - 2 * BILL_GAP) * scale;
    return (
      <View
        style={{
          position: "absolute",
          left: (item.col * HUNT_CELL + BILL_GAP) * scale,
          top: (item.row * HUNT_CELL + BILL_GAP) * scale,
          width: size,
          height: size,
          backgroundColor: huntBillShade(item.value, month),
          borderWidth: item.double ? Math.max(1, 0.6 * scale) : 0,
          borderColor: colors.doubleEdge,
          alignItems: "center",
          justifyContent: "center",
        }}>
        <Text style={{ color: colors.billInk, fontWeight: "800", fontSize: (item.value >= 100 ? 3.2 : 4) * scale }}>{item.value}</Text>
      </View>
    );
  }
  const r = (item.kind === "plus" ? 2.4 : 3) * scale;
  return (
    <View
      style={{
        position: "absolute",
        left: (item.col * HUNT_CELL + HUNT_CELL / 2) * scale - r,
        top: (item.row * HUNT_CELL + HUNT_CELL / 2) * scale - r,
        width: 2 * r,
        height: 2 * r,
        borderRadius: r,
        backgroundColor: item.kind === "plus" ? colors.coin : item.used ? colors.powerUsed : colors.power,
        alignItems: "center",
        justifyContent: "center",
      }}>
      <Text style={{ color: item.kind === "plus" ? colors.billInk : colors.powerInk, fontWeight: "800", fontSize: 2.6 * scale }}>{HUNT_ICONS[item.kind]}</Text>
    </View>
  );
}

// Coins and aim dots move on the UI thread; their props never change during a game, so the board
// re-rendering on every paid bill leaves this layer alone.
export const HuntSprites = memo(function HuntSprites({ view, scale, coin, aim }: { view: HuntView; scale: number; coin: string; aim: string }) {
  return (
    <>
      {Array.from({ length: AIM_DOTS }, (_, dot) => (
        <AimDot key={`aim-${dot}`} view={view} dot={dot} scale={scale} fill={aim} />
      ))}
      {Array.from({ length: COIN_CAP }, (_, slot) => (
        <Coin key={`coin-${slot}`} view={view} slot={slot} scale={scale} fill={coin} />
      ))}
    </>
  );
});

export function HuntWorld({
  view,
  items,
  month,
  launcher,
  phase,
  width,
  height,
  dark,
}: {
  view: HuntView;
  items: HuntItem[];
  month: number;
  launcher: number;
  phase: HuntPhase;
  width: number;
  height: number;
  dark: boolean;
}) {
  const c = dark ? HUNT_COLORS.dark : HUNT_COLORS.light;
  const { scale, left, top } = huntViewport(width, height);
  const size = 2 * COIN_R * scale;
  return (
    <View style={{ width, height, backgroundColor: c.bg, overflow: "hidden" }}>
      <View style={{ position: "absolute", left, top, width: HUNT_W * scale, height: (HUNT_H + 1) * scale }}>
        <View style={{ position: "absolute", left: 0, right: 0, top: HUNT_H * scale, height: Math.max(1, 0.6 * scale), backgroundColor: c.floor }} />
        {items.map((item) => (
          <Cell key={item.id} item={item} month={month} scale={scale} colors={c} />
        ))}
        {phase === "aiming" || phase === "ready" ? (
          <View style={{ position: "absolute", left: (launcher - COIN_R) * scale, top: (HUNT_H - 2 * COIN_R) * scale, width: size, height: size, borderRadius: size / 2, backgroundColor: c.coin }} />
        ) : null}
        <HuntSprites view={view} scale={scale} coin={c.coin} aim={c.aim} />
      </View>
    </View>
  );
}
