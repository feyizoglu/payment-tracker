import { describe, it, expect } from "vitest";
import {
  validateTeamName,
  validateInviteEmail,
  createTeamBody,
  inviteBody,
  invitePath,
} from "@/lib/settings-form";

const messages = { teamNameRequired: "team-name-required", emailRequired: "email-required" };

describe("validateTeamName", () => {
  it("accepts a real name", () => {
    expect(validateTeamName("Home", messages)).toBeNull();
  });

  it("rejects blank and whitespace-only names, matching the server's 400", () => {
    expect(validateTeamName("", messages)).toBe("team-name-required");
    expect(validateTeamName("   ", messages)).toBe("team-name-required");
  });
});

describe("validateInviteEmail", () => {
  it("accepts an address", () => {
    expect(validateInviteEmail("a@x.com", messages)).toBeNull();
    expect(validateInviteEmail("  a@x.com  ", messages)).toBeNull();
  });

  it("rejects blanks and strings that cannot be an address", () => {
    expect(validateInviteEmail("", messages)).toBe("email-required");
    expect(validateInviteEmail("   ", messages)).toBe("email-required");
    expect(validateInviteEmail("nobody", messages)).toBe("email-required");
    expect(validateInviteEmail("@x.com", messages)).toBe("email-required");
    expect(validateInviteEmail("a@", messages)).toBe("email-required");
  });
});

describe("request bodies", () => {
  it("trims what it sends", () => {
    expect(createTeamBody("  Home  ")).toEqual({ name: "Home" });
    expect(inviteBody("  a@x.com  ")).toEqual({ email: "a@x.com" });
  });

  it("builds the invite path for a team", () => {
    expect(invitePath("t-1")).toBe("/api/teams/t-1/invite");
  });
});
