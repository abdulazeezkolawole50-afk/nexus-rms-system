// server/middleware/auth.js
import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    req.user = payload; // { id, role }
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

export function requireRole(roles = []) {
  const allow = roles.map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();
    if (!allow.includes(role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}