// Pure form logic for the Settings tab's two write flows, kept out of the .tsx so the
// node vitest setup can cover it — same split as payment-form.ts and asset-form.ts.

export interface SettingsMessages {
  teamNameRequired: string;
  emailRequired: string;
}

export function validateTeamName(name: string, messages: SettingsMessages): string | null {
  return name.trim() ? null : messages.teamNameRequired;
}

// Deliberately not a full RFC-5322 check: the server looks the address up in the users
// table and 404s when it does not exist, so the only job here is catching a blank or
// obviously non-address entry before spending a round trip.
export function validateInviteEmail(email: string, messages: SettingsMessages): string | null {
  const trimmed = email.trim();
  if (!trimmed) return messages.emailRequired;
  if (!trimmed.includes("@") || trimmed.startsWith("@") || trimmed.endsWith("@")) {
    return messages.emailRequired;
  }
  return null;
}

export function createTeamBody(name: string): Record<string, unknown> {
  return { name: name.trim() };
}

export function inviteBody(email: string): Record<string, unknown> {
  return { email: email.trim() };
}

export function invitePath(teamId: string): string {
  return `/api/teams/${teamId}/invite`;
}
