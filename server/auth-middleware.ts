import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type JwtClaims, type UserRole } from "./auth";

declare global {
  // eslint-disable-next-line no-var
  var __a2b_auth: unknown;
}

export interface AuthedRequest extends Request {
  auth?: JwtClaims;
}

function extractBearer(req: Request): string | null {
  const header = req.header("authorization") || req.header("Authorization");
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export function authOptional(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const token = extractBearer(req) || (req as any).cookies?.a2b_token || null;
    if (token) {
      req.auth = verifyAccessToken(token);
    }
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractBearer(req) || (req as any).cookies?.a2b_token || null;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

export function requireRole(roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

