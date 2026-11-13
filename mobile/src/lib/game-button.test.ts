import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { GAME_THEME } from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null }));

import { GameButton } from "@/components/games/game-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

describe("GameButton", () => {
  it("is a dark button with light text, readable on any player colour", () => {
    const onPress = vi.fn();
    const button = GameButton({ label: "GO", onPress }) as Node;
    expect(button.props.onPress).toBe(onPress);
    expect(button.props.disabled).toBe(false);
    expect(button.props.style).toEqual({ backgroundColor: GAME_THEME.bg });
    const label = button.props.children as Node;
    expect(label.props.children).toBe("GO");
    expect(label.props.style).toEqual({ color: GAME_THEME.text });
  });

  it("dims and stops reacting when disabled", () => {
    const button = GameButton({ label: "GO", onPress: vi.fn(), disabled: true }) as Node;
    expect(button.props.disabled).toBe(true);
    expect(String(button.props.className)).toContain("opacity-40");
  });
});
