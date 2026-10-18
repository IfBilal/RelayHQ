import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** The token goes to the invitee once; only its sha256 is stored (invitations.token_hash). */
export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
