import { createHash, randomBytes } from "node:crypto";

/**
 * Refresh tokens are opaque random strings, not JWTs — the refresh_tokens
 * table (token_hash, expires_at, revoked_at) is a stateful revocation/rotation
 * ledger, so a self-verifying JWT would just duplicate the DB round trip
 * already required to check revocation. See docs/DECISIONS.md.
 */
export function generateOpaqueToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
