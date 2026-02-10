/**
 * Centralized utility for parsing Supabase session expiry timestamps.
 * Supabase can return expires_at as:
 * - Unix seconds (number < 2_000_000_000)
 * - Unix milliseconds (number >= 2_000_000_000)
 * - ISO string
 */
export function parseSupabaseExpiry(expiresAt: string | number | undefined): number {
  if (typeof expiresAt === "number") {
    return expiresAt < 2_000_000_000 ? expiresAt * 1000 : expiresAt
  }
  if (typeof expiresAt === "string") {
    const ms = new Date(expiresAt).getTime()
    if (!Number.isNaN(ms)) return ms
  }
  // Fallback: 1 hour from now
  return Date.now() + 60 * 60 * 1000
}
