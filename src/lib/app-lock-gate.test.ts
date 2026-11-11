import { describe, it, expect } from "vitest";
import { EMPTY_LOCK, type AppLockState } from "@/lib/app-lock";
import { lockScreenFor } from "@/lib/app-lock-gate";

const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h", salt: "s" };

describe("lockScreenFor", () => {
  it("never locks without a PIN", () => {
    expect(lockScreenFor("/economy", EMPTY_LOCK, false)).toBe("none");
  });

  it("keeps sign-in and the games open in game mode, locks everything else", () => {
    const game = { ...withPin, gameMode: true };
    expect(lockScreenFor("/", game, false)).toBe("none");
    expect(lockScreenFor("/games", game, false)).toBe("none");
    expect(lockScreenFor("/games/imposter", game, false)).toBe("none");
    expect(lockScreenFor("/dashboard", game, false)).toBe("game");
    expect(lockScreenFor("/events/abc", game, false)).toBe("game");
    expect(lockScreenFor("/economy", game, true)).toBe("game");
    expect(lockScreenFor("/gamesx", game, false)).toBe("game");
  });

  it("locks Economy per visit when the economy lock is on", () => {
    const eco = { ...withPin, economyLock: true };
    expect(lockScreenFor("/economy", eco, false)).toBe("economy");
    expect(lockScreenFor("/economy", eco, true)).toBe("none");
    expect(lockScreenFor("/dashboard", eco, false)).toBe("none");
    expect(lockScreenFor("/economy", withPin, false)).toBe("none");
  });
});
