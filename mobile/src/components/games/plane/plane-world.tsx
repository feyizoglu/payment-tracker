import { useMemo } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";

import {
  OBSTACLE_WIDTH,
  PLANE_COLORS,
  PLANE_MARGIN_EVERY,
  PLANE_PENCILS,
  PLANE_RULER,
  PLANE_WORLD_HEIGHT,
  planeAngle,
  planeX,
  type PlaneState,
} from "@ptracker/shared/paper-plane";

const SLOTS = 4;
const TIP = 5;

export interface PlaneView {
  y: SharedValue<number>;
  angle: SharedValue<number>;
  distance: SharedValue<number>;
  xs: SharedValue<number[]>;
  gaps: SharedValue<number[]>;
  centres: SharedValue<number[]>;
  kinds: SharedValue<number[]>;
  sync: (s: PlaneState) => void;
}

export function usePlaneView(): PlaneView {
  const y = useSharedValue(50);
  const angle = useSharedValue(0);
  const distance = useSharedValue(0);
  const xs = useSharedValue<number[]>(Array(SLOTS).fill(-1000));
  const gaps = useSharedValue<number[]>(Array(SLOTS).fill(30));
  const centres = useSharedValue<number[]>(Array(SLOTS).fill(50));
  const kinds = useSharedValue<number[]>(Array(SLOTS).fill(0));
  // Stable across renders: the screen's frame loop depends on it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ y, angle, distance, xs, gaps, centres, kinds, sync: (s: PlaneState) => {
    y.value = s.y;
    angle.value = planeAngle(s.vy);
    distance.value = s.distance;
    const o = s.obstacles;
    xs.value = Array.from({ length: SLOTS }, (_, i) => (o[i] ? o[i].x : -1000));
    gaps.value = Array.from({ length: SLOTS }, (_, i) => (o[i] ? o[i].gap : 30));
    centres.value = Array.from({ length: SLOTS }, (_, i) => (o[i] ? o[i].gapY : 50));
    kinds.value = Array.from({ length: SLOTS }, (_, i) => (o[i] ? o[i].kind : 0));
  } }), []);
}

function Piece({ view, slot, top, scale, colour }: { view: PlaneView; slot: number; top: boolean; scale: number; colour: string }) {
  // Only the shared values go into the worklets, not the view's JS `sync`.
  const { xs, gaps, centres, kinds } = view;
  const body = useAnimatedStyle(() => {
    const edge = top ? centres.value[slot] - gaps.value[slot] / 2 : centres.value[slot] + gaps.value[slot] / 2;
    const pencil = kinds.value[slot] === 0;
    const end = pencil ? (top ? edge - TIP : edge + TIP) : edge;
    const from = top ? 0 : PLANE_WORLD_HEIGHT;
    return {
      left: xs.value[slot] * scale,
      top: Math.min(from, end) * scale,
      height: Math.max(0, Math.abs(end - from)) * scale,
      backgroundColor: pencil ? colour : PLANE_RULER,
    };
  });
  const tip = useAnimatedStyle(() => {
    const edge = top ? centres.value[slot] - gaps.value[slot] / 2 : centres.value[slot] + gaps.value[slot] / 2;
    const pencil = kinds.value[slot] === 0;
    return {
      opacity: pencil ? 1 : 0,
      left: (xs.value[slot] + OBSTACLE_WIDTH * 0.2) * scale,
      top: (top ? edge - TIP : edge) * scale,
    };
  });
  return (
    <>
      <Animated.View style={[{ position: "absolute", width: OBSTACLE_WIDTH * scale }, body]} />
      <Animated.View
        style={[
          {
            position: "absolute",
            width: OBSTACLE_WIDTH * 0.6 * scale,
            height: TIP * scale,
            backgroundColor: "#f3d9b1",
            borderTopLeftRadius: top ? 0 : OBSTACLE_WIDTH * scale,
            borderTopRightRadius: top ? 0 : OBSTACLE_WIDTH * scale,
            borderBottomLeftRadius: top ? OBSTACLE_WIDTH * scale : 0,
            borderBottomRightRadius: top ? OBSTACLE_WIDTH * scale : 0,
          },
          tip,
        ]}
      />
    </>
  );
}

export function PlaneWorld({ view, width, height, worldWidth, dark }: { view: PlaneView; width: number; height: number; worldWidth: number; dark: boolean }) {
  const c = dark ? PLANE_COLORS.dark : PLANE_COLORS.light;
  const scale = height / PLANE_WORLD_HEIGHT;
  const left = (width - worldWidth * scale) / 2;
  const { distance, y, angle } = view;
  const margin = useAnimatedStyle(() => ({
    left: (PLANE_MARGIN_EVERY - (distance.value % PLANE_MARGIN_EVERY) - 10) * scale,
  }));
  const plane = useAnimatedStyle(() => ({
    top: y.value * scale - 3 * scale,
    transform: [{ rotate: `${angle.value}deg` }],
  }));
  const lines = [];
  for (let y = 6; y < PLANE_WORLD_HEIGHT; y += 6) {
    lines.push(<View key={y} style={{ position: "absolute", left: 0, right: 0, top: y * scale, height: 1, backgroundColor: c.line }} />);
  }
  return (
    <View style={{ width, height, backgroundColor: c.paper, overflow: "hidden" }}>
      {lines}
      <View style={{ position: "absolute", left, top: 0, width: worldWidth * scale, height, overflow: "hidden" }}>
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: c.margin }, margin]} />
        {Array.from({ length: SLOTS }, (_, slot) => (
          <View key={slot} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
            <Piece view={view} slot={slot} top scale={scale} colour={PLANE_PENCILS[slot % PLANE_PENCILS.length]} />
            <Piece view={view} slot={slot} top={false} scale={scale} colour={PLANE_PENCILS[(slot + 2) % PLANE_PENCILS.length]} />
          </View>
        ))}
        <Animated.View style={[{ position: "absolute", left: (planeX(worldWidth) - 5) * scale, width: 10 * scale, height: 6 * scale }, plane]}>
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 0,
              height: 0,
              borderTopWidth: 3 * scale,
              borderBottomWidth: 3 * scale,
              borderLeftWidth: 10 * scale,
              borderTopColor: "transparent",
              borderBottomColor: "transparent",
              borderLeftColor: c.plane,
            }}
          />
          <View style={{ position: "absolute", left: 2 * scale, right: 0, top: 3 * scale - 0.5, height: 1, backgroundColor: c.ink }} />
        </Animated.View>
      </View>
    </View>
  );
}
