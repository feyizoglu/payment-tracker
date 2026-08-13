import { describe, it, expect } from "vitest";
import type { Team, TeamMember, User } from "@/types";
import { isTeamOwner, memberDisplayName, myColorFromTeams, COLOR_OPTIONS } from "@/lib/teams";

// shared/teams.ts owns the colour-recovery loop that used to be inlined in the web
// dashboard and economy pages and is also used by mobile Settings, so a regression here
// is silent on three screens at once.

function user(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "u1@example.com",
    name: "User One",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    team_id: "t1",
    user_id: "u1",
    role: "member",
    joined_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: "t1",
    name: "Team One",
    created_by: "u1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("isTeamOwner", () => {
  it("is true when the user holds the owner role on the team", () => {
    const t = team({ members: [member({ user_id: "u1", role: "owner" })] });
    expect(isTeamOwner(t, "u1")).toBe(true);
  });

  it("is false for a plain member, so member-only UI cannot show owner actions", () => {
    const t = team({ members: [member({ user_id: "u1", role: "member" })] });
    expect(isTeamOwner(t, "u1")).toBe(false);
  });

  it("is false when the owner row belongs to somebody else", () => {
    const t = team({ members: [member({ user_id: "u2", role: "owner" })] });
    expect(isTeamOwner(t, "u1")).toBe(false);
  });

  it("is false when the user id is unknown", () => {
    const t = team({ members: [member({ user_id: "u1", role: "owner" })] });
    expect(isTeamOwner(t, undefined)).toBe(false);
  });

  it("is false when the team was fetched without its members", () => {
    expect(isTeamOwner(team(), "u1")).toBe(false);
  });
});

describe("memberDisplayName", () => {
  it("prefers the profile name", () => {
    expect(memberDisplayName(user({ name: "Ada" }), "u1")).toBe("Ada");
  });

  it("falls back to the email when the name is not set", () => {
    expect(memberDisplayName(user({ name: null, email: "ada@example.com" }), "u1")).toBe("ada@example.com");
  });

  it("falls back to the email when the name is an empty string", () => {
    expect(memberDisplayName(user({ name: "", email: "ada@example.com" }), "u1")).toBe("ada@example.com");
  });

  it("falls back to the raw id when the profile row is missing, so no row renders empty", () => {
    expect(memberDisplayName(undefined, "u1")).toBe("u1");
  });
});

describe("myColorFromTeams", () => {
  it("recovers the signed-in user's colour from their membership row", () => {
    const teams = [team({ members: [member({ user_id: "u1", user: user({ color: "#10B981" }) })] })];
    expect(myColorFromTeams(teams, "u1")).toBe("#10B981");
  });

  it("scans past teams whose membership row carries no colour", () => {
    const teams = [
      team({ id: "t1", members: [member({ team_id: "t1", user_id: "u1", user: user({ color: null }) })] }),
      team({ id: "t2", members: [member({ team_id: "t2", user_id: "u1", user: user({ color: "#EF4444" }) })] }),
    ];
    expect(myColorFromTeams(teams, "u1")).toBe("#EF4444");
  });

  it("ignores other members' colours", () => {
    const teams = [
      team({ members: [member({ user_id: "u2", user: user({ id: "u2", color: "#EC4899" }) })] }),
    ];
    expect(myColorFromTeams(teams, "u1")).toBeNull();
  });

  it("returns null when the user belongs to no team rather than guessing a colour", () => {
    expect(myColorFromTeams([], "u1")).toBeNull();
  });

  it("returns null when the user id is unknown", () => {
    const teams = [team({ members: [member({ user_id: "u1", user: user({ color: "#10B981" }) })] })];
    expect(myColorFromTeams(teams, undefined)).toBeNull();
  });

  it("returns null when the membership row has no expanded user", () => {
    expect(myColorFromTeams([team({ members: [member({ user_id: "u1" })] })], "u1")).toBeNull();
  });
});

describe("COLOR_OPTIONS", () => {
  it("holds only hex colours, so a saved value is valid CSS on web and RN alike", () => {
    for (const color of COLOR_OPTIONS) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("has no duplicates, so the picker cannot show the same swatch twice", () => {
    expect(new Set(COLOR_OPTIONS).size).toBe(COLOR_OPTIONS.length);
  });
});
