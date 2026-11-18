// Emails are stored lowercase (users_email_lowercase), so every write and lookup of
// users.email goes through this, or a mixed-case address would miss its row.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
