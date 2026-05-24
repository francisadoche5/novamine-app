// Mint and verify Supabase-compatible JWTs.
//
// Supabase trusts JWTs signed with the project's JWT secret as long as they
// carry the standard claims (sub, aud, role). When the frontend uses
// supabase.auth.setSession({ access_token }) with such a token, RLS policies
// can read auth.uid() and auth.jwt() to enforce per-user rules.
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface NovamineJwtPayload {
  sub: string;            // novamine user uuid (also Supabase auth.uid())
  telegram_id: number;
  username?: string;
  // Supabase-required claims
  aud: "authenticated";
  role: "authenticated";
  iat: number;
  exp: number;
}

export function signUserJwt(user: { id: string; telegramId: number; username?: string | null }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: NovamineJwtPayload = {
    sub: user.id,
    telegram_id: user.telegramId,
    username: user.username ?? undefined,
    aud: "authenticated",
    role: "authenticated",
    iat: now,
    exp: now + config.jwtExpiresInSec,
  };
  return jwt.sign(payload, config.supabase.jwtSecret, { algorithm: "HS256" });
}

export function verifyUserJwt(token: string): NovamineJwtPayload {
  const decoded = jwt.verify(token, config.supabase.jwtSecret, {
    algorithms: ["HS256"],
    audience: "authenticated",
  });
  if (typeof decoded === "string") {
    const err = new Error("Invalid token") as Error & { status: number };
    err.status = 401;
    throw err;
  }
  return decoded as NovamineJwtPayload;
}
