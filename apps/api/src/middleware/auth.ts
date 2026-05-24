// Auth middleware — extracts Bearer token, verifies it, attaches req.auth.
import type { Request, Response, NextFunction } from "express";
import { verifyUserJwt, type NovamineJwtPayload } from "../auth/jwt.js";

declare module "express-serve-static-core" {
  interface Request {
    auth?: NovamineJwtPayload;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }
  try {
    req.auth = verifyUserJwt(m[1]);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
