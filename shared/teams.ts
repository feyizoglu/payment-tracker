import type { Team, User } from "./types";

// Team/profile helpers shared by the web Teams panel and the mobile Settings tab.

// The avatar colours a user can pick. Shared so the two platforms offer the same set —
// a colour saved on one must be selectable on the other.
export const COLOR_OPTIONS = [
  "#3B82F6",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#10B981",
  "#EC4899",
  "#F97316",
  "#14B8A6",
  "#6366F1",
  "#84CC16",
  "#06B6D4",
  "#F43F5E",
];

export function isTeamOwner(team: Team, userId: string | undefined): boolean {
  if (!userId) return false;
  return team.members?.some((member) => member.user_id === userId && member.role === "owner") ?? false;
}

// Display name for a member row: the profile name, else the email, else the raw id —
// never an empty row.
export function memberDisplayName(user: User | undefined, fallbackId: string): string {
  return user?.name || user?.email || fallbackId;
}

// The signed-in user's saved colour. There is no "get me" endpoint, so it is recovered
// from the membership rows /api/teams returns — which means a user who belongs to no
// team cannot see their saved colour. Returns null in that case rather than guessing.
export function myColorFromTeams(teams: Team[], userId: string | undefined): string | null {
  if (!userId) return null;
  for (const team of teams) {
    const me = team.members?.find((member) => member.user_id === userId);
    const color = me?.user?.color;
    if (color) return color;
  }
  return null;
}
