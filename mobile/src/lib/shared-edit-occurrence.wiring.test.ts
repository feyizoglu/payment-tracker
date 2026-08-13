import { describe, it, expect } from "vitest";
import { decideEditSubmit } from "@ptracker/shared/edit-occurrence";
import type { Occurrence } from "@ptracker/shared/types";

// Proves the shared occurrence-edit transport builder resolves through the mobile
// toolchain via the @ptracker/shared local package, and that the endpoint mapping the
// mobile edit screen relies on is the same one the web modal uses. Behavioural
// coverage of every branch lives in the web-side edit-occurrence test.
const occurrence: Occurrence = {
  kind: "recurring",
  sourceId: "r1",
  name: "X",
  currency: "TRY",
  user_id: "u1",
  team_id: null,
  dueDate: new Date(2026, 6, 15),
  amount: null,
  isPaid: false,
  period: "2026-07-01",
};

describe("shared/edit-occurrence wiring (mobile)", () => {
  it("builds the forward day-change request", () => {
    const { url, body } = decideEditSubmit({
      occurrence,
      reset: false,
      scope: "forward",
      date: "2026-07-20",
      initialDate: "2026-07-15",
      amounts: [],
    });

    expect(url).toBe("/api/recurring/r1/day-forward");
    expect(body).toEqual({ period: "2026-07-01", day: 20, amounts: [] });
  });
});
