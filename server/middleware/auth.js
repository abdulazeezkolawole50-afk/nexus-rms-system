// server/middleware/auth.js
import jwt from "jsonwebtoken";
import { requireRole } from "./roles.js";

// ✅ Verify JWT + attach req.user
export function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, email, role, full_name, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

// ✅ Some of your routes import { auth } instead of { requireAuth }
export const auth = requireAuth;

// ✅ So routes can do: import { requireAuth, requireRole } from "../middleware/auth.js";
export { requireRole };
