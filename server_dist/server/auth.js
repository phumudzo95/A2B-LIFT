import jwt from "jsonwebtoken";
const JWT_ISSUER = "a2b-lift";
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not set");
    }
    return secret;
}
export function signAccessToken(claims) {
    return jwt.sign(claims, getJwtSecret(), {
        algorithm: "HS256",
        expiresIn: "7d",
        issuer: JWT_ISSUER,
    });
}
export function verifyAccessToken(token) {
    const decoded = jwt.verify(token, getJwtSecret(), {
        algorithms: ["HS256"],
        issuer: JWT_ISSUER,
    });
    return decoded;
}
