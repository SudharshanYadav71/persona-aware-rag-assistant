/**
 * Canonical username form used across frontend and backend.
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}