import { describe, it, expect } from "vitest";
import { translationsFor } from "@/lib/i18n";
import { EVENT_CLOSED_ERROR, SETTLEMENT_ABOVE_DEBT_ERROR, eventErrorText } from "@/lib/event-errors";

describe("eventErrorText", () => {
  it("gives the event API's 409 messages in the user's language", () => {
    const tr = translationsFor("tr");
    expect(eventErrorText(SETTLEMENT_ABOVE_DEBT_ERROR, tr)).toBe("Bu tutar mevcut borçtan fazla");
    expect(eventErrorText(EVENT_CLOSED_ERROR, tr)).toBe("Bu etkinlik kapandı");
    expect(eventErrorText(SETTLEMENT_ABOVE_DEBT_ERROR, translationsFor("en"))).toBe("This amount is more than the current debt");
  });

  it("leaves any other message to the caller", () => {
    expect(eventErrorText("Internal error", translationsFor("tr"))).toBeNull();
    expect(eventErrorText(undefined, translationsFor("tr"))).toBeNull();
  });
});
