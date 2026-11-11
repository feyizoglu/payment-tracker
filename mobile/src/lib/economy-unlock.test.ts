import { describe, it, expect } from "vitest";
import { consumeEconomyModal, markEconomyModal } from "./economy-unlock";

describe("economy unlock across its own modals", () => {
  it("keeps the unlock once after Economy opens one of its modals", () => {
    expect(consumeEconomyModal()).toBe(false);
    markEconomyModal();
    expect(consumeEconomyModal()).toBe(true);
    expect(consumeEconomyModal()).toBe(false);
  });
});
