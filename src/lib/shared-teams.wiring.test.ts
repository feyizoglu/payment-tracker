import { describe, it, expect } from "vitest";
import * as shim from "@/lib/teams";
import * as shared from "../../shared/teams";

// src/lib/teams.ts is a `export *` shim over shared/teams.ts, so the web app only sees the
// shared module's public exports through it. This pins that wiring: a new export added to
// shared/teams must reach the web app, and the shim must not shadow one with its own copy.

describe("@/lib/teams → shared/teams wiring", () => {
  it("re-exports every public value of the shared module", () => {
    for (const key of Object.keys(shared)) {
      expect(shim).toHaveProperty(key);
    }
  });

  it("re-exports the same identities rather than local copies", () => {
    const s = shared as unknown as Record<string, unknown>;
    const w = shim as unknown as Record<string, unknown>;
    for (const key of Object.keys(shared)) {
      expect(w[key]).toBe(s[key]);
    }
  });

  it("exposes the helpers the dashboard and economy pages call", () => {
    expect(typeof shim.isTeamOwner).toBe("function");
    expect(typeof shim.memberDisplayName).toBe("function");
    expect(typeof shim.myColorFromTeams).toBe("function");
    expect(Array.isArray(shim.COLOR_OPTIONS)).toBe(true);
  });
});
