import { randomBytes } from "node:crypto";

// 128-bit base64url, per DESIGN.md. Stored plaintext, deliberately:
// captains can always re-copy a player's current link.
export function generateJoinToken(): string {
  return randomBytes(16).toString("base64url");
}
