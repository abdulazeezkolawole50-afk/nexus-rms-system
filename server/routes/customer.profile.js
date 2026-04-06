import express from "express";
import multer from "multer";
import path from "path";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   MULTER CONFIG
========================= */
const storage = multer.diskStorage({
  destination: path.join(__dirname, "../uploads"),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({ storage });

/* =========================
   AUTH HELPER
========================= */
function getTokenFromReq(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.split(" ")[1];
}

function getUserIdFromToken(req) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return null;

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "nexus_secret_key"
    );

    return decoded?.id || decoded?.userId || null;
  } catch {
    return null;
  }
}

/* =========================
   GET CUSTOMER PROFILE
========================= */
router.get("/me", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        full_name,
        email,
        phone_number,
        home_address,
        profile_pic_url,
        role,
        created_at
      FROM users
      WHERE id = ? AND role = 'customer'
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const user = rows[0];

    const [orders] = await pool.query(
      `
      SELECT *
      FROM orders
      WHERE customer_id = ?
      ORDER BY created_at DESC
      `,
      [userId]
    );

    const totalOrders = orders.length;
    const totalSpent = orders.reduce(
      (sum, order) => sum + Number(order.total_price || 0),
      0
    );

    return res.json({
      user,
      orders,
      stats: {
        totalOrders,
        totalSpent,
      },
    });
  } catch (error) {
    console.error("PROFILE ERROR:", error);
    return res.status(500).json({
      message: error.message || "Failed to fetch profile",
    });
  }
});

/* =========================
   UPDATE CUSTOMER PROFILE
========================= */
router.put("/update", upload.single("avatar"), async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, role
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    if (rows[0].role !== "customer") {
      return res.status(403).json({
        message: "Only customers can update profile",
      });
    }

    const {
      full_name,
      email,
      phone_number,
      home_address,
    } = req.body;

    const avatarPath = req.file ? `/uploads/${req.file.filename}` : null;

    const updates = [];
    const values = [];

    if (full_name !== undefined) {
      updates.push("full_name = ?");
      values.push(full_name);
    }

    if (email !== undefined) {
      updates.push("email = ?");
      values.push(email);
    }

    if (phone_number !== undefined) {
      updates.push("phone_number = ?");
      values.push(phone_number);
    }

    if (home_address !== undefined) {
      updates.push("home_address = ?");
      values.push(home_address);
    }

    if (avatarPath) {
      updates.push("profile_pic_url = ?");
      values.push(avatarPath);
    }

    if (!updates.length) {
      return res.status(400).json({
        message: "No profile changes provided",
      });
    }

    values.push(userId);

    await pool.query(
      `
      UPDATE users
      SET ${updates.join(", ")}
      WHERE id = ?
      `,
      values
    );

    const [updated] = await pool.query(
      `
      SELECT
        id,
        full_name,
        email,
        phone_number,
        home_address,
        profile_pic_url,
        role,
        created_at
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    return res.json({
      success: true,
      message: "Profile updated successfully",
      user: updated[0],
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);
    return res.status(500).json({
      message: error.message || "Failed to update profile",
    });
  }
});

/* =========================
   CHANGE PASSWORD
========================= */
router.put("/change-password", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current and new password required",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT id, password, role
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = rows[0];

    if (user.role !== "customer") {
      return res.status(403).json({
        message: "Only customers can change this password",
      });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);

    if (!valid) {
      return res.status(400).json({
        message: "Current password incorrect",
      });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `
      UPDATE users
      SET password = ?
      WHERE id = ?
      `,
      [hash, userId]
    );

    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("PASSWORD CHANGE ERROR:", error);
    return res.status(500).json({
      message: error.message || "Failed to change password",
    });
  }
});

export default router;