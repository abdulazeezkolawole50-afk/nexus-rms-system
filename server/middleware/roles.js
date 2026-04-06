export function requireRole(...roles) {
  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (!roles.includes(role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}