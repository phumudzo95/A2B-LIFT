import { verifyAccessToken } from "./auth";
function extractBearer(req) {
    const header = req.header("authorization") || req.header("Authorization");
    if (!header)
        return null;
    const [type, token] = header.split(" ");
    if (type?.toLowerCase() !== "bearer" || !token)
        return null;
    return token;
}
export function authOptional(req, _res, next) {
    try {
        const token = extractBearer(req) || req.cookies?.a2b_token || null;
        if (token) {
            req.auth = verifyAccessToken(token);
        }
    }
    catch {
        // ignore invalid token for optional auth
    }
    next();
}
export function requireAuth(req, res, next) {
    const token = extractBearer(req) || req.cookies?.a2b_token || null;
    if (!token)
        return res.status(401).json({ message: "Unauthorized" });
    try {
        req.auth = verifyAccessToken(token);
        return next();
    }
    catch {
        return res.status(401).json({ message: "Unauthorized" });
    }
}
export function requireRole(roles) {
    return (req, res, next) => {
        if (!req.auth)
            return res.status(401).json({ message: "Unauthorized" });
        if (!roles.includes(req.auth.role)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        return next();
    };
}
