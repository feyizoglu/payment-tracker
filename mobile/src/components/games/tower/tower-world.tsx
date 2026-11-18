import { useMemo } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";

import { BOOK_H, TOWER_COLORS, TOWER_WIDTH, towerBookColour, type TowerBook, type TowerState } from "@ptracker/shared/book-tower";

const PIECE_SLOTS = 3;
const DESK = 12;
const SHOWN = 40;

export interface TowerView {
  slider: SharedValue<number>;
  camera: SharedValue<number>;
  /** Per slot: [x, w, y, angle], parked far below when empty. */
  pieces: SharedValue<number[][]>;
  colours: SharedValue<string[]>;
  sync: (s: TowerState) => void;
}

export function useTowerView(): TowerView {
  const slider = useSharedValue(0);
  const camera = useSharedValue(0);
  const pieces = useSharedValue<number[][]>(Array.from({ length: PIECE_SLOTS }, () => [0, 0, -1000, 0]));
  const colours = useSharedValue<string[]>(Array(PIECE_SLOTS).fill(towerBookColour(0)));
  // Stable across renders: the screen's frame loop depends on it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ slider, camera, pieces, colours, sync: (s: TowerState) => {
    slider.value = s.slider.x;
    camera.value = s.camera;
    const last = s.pieces.slice(-PIECE_SLOTS);
    pieces.value = Array.from({ length: PIECE_SLOTS }, (_, i) => (last[i] ? [last[i].x, last[i].w, last[i].y, last[i].angle] : [0, 0, -1000, 0]));
    colours.value = Array.from({ length: PIECE_SLOTS }, (_, i) => towerBookColour(last[i]?.index ?? 0));
  } }), []);
}

function Piece({ view, slot, scale }: { view: TowerView; slot: number; scale: number }) {
  const { pieces, colours } = view;
  const style = useAnimatedStyle(() => {
    const [x, w, y, angle] = pieces.value[slot];
    return {
      left: x * scale,
      width: w * scale,
      bottom: y * scale,
      backgroundColor: colours.value[slot],
      transform: [{ rotate: `${angle}deg` }],
    };
  });
  return <Animated.View style={[{ position: "absolute", height: BOOK_H * scale }, style]} />;
}

function Book({ book, level, scale, stripe }: { book: Pick<TowerBook, "x" | "w" | "index">; level: number; scale: number; stripe: string }) {
  const w = book.w * scale;
  return (
    <View style={{ position: "absolute", left: book.x * scale, bottom: level * BOOK_H * scale, width: w, height: BOOK_H * scale, backgroundColor: towerBookColour(book.index) }}>
      <View style={{ position: "absolute", left: Math.min(3 * scale, w / 4), top: scale, bottom: scale, width: Math.max(1, scale), backgroundColor: stripe }} />
      <View style={{ position: "absolute", right: Math.min(3 * scale, w / 4), top: scale, bottom: scale, width: Math.max(1, scale), backgroundColor: stripe }} />
    </View>
  );
}

export function TowerWorld({
  view,
  stack,
  sliding,
  width,
  height,
  dark,
}: {
  view: TowerView;
  stack: TowerBook[];
  sliding: boolean;
  width: number;
  height: number;
  dark: boolean;
}) {
  const c = dark ? TOWER_COLORS.dark : TOWER_COLORS.light;
  const scale = Math.min(width / TOWER_WIDTH, height / 110);
  const left = (width - TOWER_WIDTH * scale) / 2;
  const { camera, slider } = view;
  const top = stack[stack.length - 1];
  const world = useAnimatedStyle(() => ({ transform: [{ translateY: camera.value * scale }] }));
  const moving = useAnimatedStyle(() => ({ left: (slider.value - top.w / 2) * scale }));
  const first = Math.max(0, stack.length - SHOWN);
  return (
    <View style={{ width, height, backgroundColor: c.wall, overflow: "hidden" }}>
      <Animated.View style={[{ position: "absolute", left, width: TOWER_WIDTH * scale, top: 0, bottom: 0 }, world]}>
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: DESK * scale, backgroundColor: c.desk, borderTopWidth: 1.5 * scale, borderTopColor: c.deskEdge }} />
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: DESK * scale }}>
          {stack.slice(first).map((b, i) => (
            <Book key={b.index} book={b} level={first + i} scale={scale} stripe={c.stripe} />
          ))}
          {sliding ? (
            <Animated.View
              style={[
                { position: "absolute", bottom: stack.length * BOOK_H * scale, width: top.w * scale, height: BOOK_H * scale, backgroundColor: towerBookColour(stack.length) },
                moving,
              ]}
            />
          ) : null}
          {Array.from({ length: PIECE_SLOTS }, (_, slot) => (
            <Piece key={slot} view={view} slot={slot} scale={scale} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
