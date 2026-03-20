import jwt from "jsonwebtoken";

export type UserRole = "client" | "chauffeur" | "admin";

export interface JwtClaims {
  sub: string;
  role: UserRole;
  email?: string;
  name?: string;
}

const JWT_ISSUER = "a2b-lift";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

export function signAccessToken(claims: JwtClaims): string {
  return jwt.sign(claims, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: "7d",
    issuer: JWT_ISSUER,
  });
}

export function verifyAccessToken(token: string): JwtClaims {
  const decoded = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
  });
  return decoded as JwtClaims;
}
