import { describe, it, expect } from "vitest";
import { hashColor } from "@ptracker/shared/economy";
import type { Team, TeamMember } from "@ptracker/shared/types";
import { buildPeople, personColor } from "./people";

function member(user_id: string, name: string | null, color?: string | null): TeamMember {
  return {
    team_id: "t1", user_id, role: "member", joined_at: "",
    user: { id: user_id, email: `${user_id}@x.com`, name, avatar_url: null, color, created_at: "" },
  };
}

function team(...members: TeamMember[]): Team {
  return { id: "t1", name: "home", created_by: "u1", created_at: "", members };
}

describe("buildPeople", () => {
  it("includes the signed-in user with a hash colour when they have no team", () => {
    const people = buildPeople([], { id: "me", email: "me@x.com", name: null });
    expect(people.me).toEqual({ name: "me@x.com", color: hashColor("me") });
  });

  it("uses the colour each member picked", () => {
    const people = buildPeople([team(member("me", "Me", "#10B981"), member("u2", "Cansu", "#3B82F6"))], {
      id: "me", email: "me@x.com", name: "Me",
    });
    expect(people.me.color).toBe("#10B981");
    expect(people.u2).toEqual({ name: "Cansu", color: "#3B82F6" });
  });

  it("falls back to the hash colour for a member without one", () => {
    const people = buildPeople([team(member("u2", null, null))], null);
    expect(people.u2).toEqual({ name: "u2@x.com", color: hashColor("u2") });
  });
});

describe("personColor", () => {
  it("hashes an unknown user id", () => {
    expect(personColor({}, "ghost")).toBe(hashColor("ghost"));
  });
});
