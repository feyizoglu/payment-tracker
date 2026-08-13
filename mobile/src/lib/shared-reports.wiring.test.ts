import { describe, it, expect } from "vitest";
import {
  sumByCurrency,
  formatCurrencyTotals,
  rangeReport,
  payUntilReport,
  startOfDay,
  endOfDay,
} from "@ptracker/shared/reports";

// Proves the shared reports module resolves through the mobile toolchain via the
// @ptracker/shared local package (it pulls in date-fns, so resolution is the thing
// worth pinning). Report behaviour is covered on the shared side and in
// report-view.test.ts; this only asserts the surface arrives intact.
describe("shared/reports wiring (mobile)", () => {
  it("exposes the aggregation helpers", () => {
    expect(typeof sumByCurrency).toBe("function");
    expect(typeof formatCurrencyTotals).toBe("function");
  });

  it("exposes the report builders", () => {
    expect(typeof rangeReport).toBe("function");
    expect(typeof payUntilReport).toBe("function");
  });

  it("exposes the day-boundary helpers", () => {
    expect(typeof startOfDay).toBe("function");
    expect(typeof endOfDay).toBe("function");
  });

  it("runs a shared helper end to end through the mobile alias", () => {
    expect(sumByCurrency([])).toEqual({});
  });
});
