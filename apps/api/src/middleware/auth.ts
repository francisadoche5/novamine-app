// Auth middleware — extracts Bearer token, verifies it, attaches req.auth.
import { verifyUserJwt } from "../auth/jwt.js";

export function requireAuth(req: any, res: any, next: any) {
  const header = (req.headers.authorization as string) ?? "";
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
