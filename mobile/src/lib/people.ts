import { hashColor } from "@ptracker/shared/economy";
import type { Team, User } from "@ptracker/shared/types";

export interface Person {
  name: string;
  color: string;
}

export type People = Record<string, Person>;

// Mirrors the web dashboard's userMap: the signed-in user plus every team member,
// tinted with the colour picked in Settings, else a stable hash of the id.
export function buildPeople(teams: Team[], me: Pick<User, "id" | "email" | "name"> | null): People {
  const people: People = {};
  if (me) people[me.id] = { name: me.name ?? me.email, color: hashColor(me.id) };
  for (const team of teams) {
    for (const member of team.members ?? []) {
      if (!member.user) continue;
      people[member.user_id] = {
        name: member.user.name ?? member.user.email,
        color: member.user.color ?? people[member.user_id]?.color ?? hashColor(member.user_id),
      };
    }
  }
  return people;
}

export function personColor(people: People, userId: string): string {
  return people[userId]?.color ?? hashColor(userId);
}
