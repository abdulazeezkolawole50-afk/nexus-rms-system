import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, "..", "uploads", "profiles");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `profile-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function safeDeleteFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Failed to delete old profile image:", error);
  }
}

/**
 * GET /api/user/me
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user?.id);

    const [rows] = await pool.query(
      `
      SELECT
        id,
        full_name,
        email,
        role,
        phone_number,
        bio,
        profile_pic_url,
        updated_at,
        created_at
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("GET /api/user/me error:", error);
    return res.status(500).json({ message: "Failed to fetch profile" });
  }
});

/**
 * PUT /api/user/update
 */
router.put("/update", requireAuth, upload.single("avatar"), async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    const {
      full_name,
      email,
      phone_number,
      bio,
    } = req.body || {};

    const [existingRows] = await pool.query(
      `
      SELECT id, full_name, email, role, phone_number, bio, profile_pic_url
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!existingRows.length) {
      if (req.file) safeDeleteFile(req.file.path);
      return res.status(404).json({ message: "User not found" });
    }

    const currentUser = existingRows[0];

    const nextFullName =
      typeof full_name === "string" && full_name.trim()
        ? full_name.trim()
        : currentUser.full_name;

    const nextEmail =
      typeof email === "string" && email.trim()
        ? email.trim()
        : currentUser.email;

    const nextPhone =
      typeof phone_number === "string" ? phone_number.trim() : (currentUser.phone_number || null);

    const nextBio =
      typeof bio === "string" ? bio.trim() : (currentUser.bio || null);

    const [emailRows] = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = ? AND id <> ?
      LIMIT 1
      `,
      [nextEmail, userId]
    );

    if (emailRows.length) {
      if (req.file) safeDeleteFile(req.file.path);
      return res.status(400).json({ message: "Email is already in use" });
    }

    let nextProfilePic = currentUser.profile_pic_url;

    if (req.file) {
      nextProfilePic = `/uploads/profiles/${req.file.filename}`;

      if (currentUser.profile_pic_url) {
        const oldAbsolutePath = path.join(
          __dirname,
          "..",
          currentUser.profile_pic_url.replace(/^\//, "")
        );
        safeDeleteFile(oldAbsolutePath);
      }
    }

    await pool.query(
      `
      UPDATE users
      SET
        full_name = ?,
        email = ?,
        phone_number = ?,
        bio = ?,
        profile_pic_url = ?
      WHERE id = ?
      `,
      [
        nextFullName,
        nextEmail,
        nextPhone || null,
        nextBio || null,
        nextProfilePic,
        userId,
      ]
    );

    const [updatedRows] = await pool.query(
      `
      SELECT
        id,
        full_name,
        email,
        role,
        phone_number,
        bio,
        profile_pic_url,
        updated_at,
        created_at
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    return res.json({
      message: "Profile updated successfully",
      user: updatedRows[0],
    });
  } catch (error) {
    console.error("PUT /api/user/update error:", error);
    if (req.file) safeDeleteFile(req.file.path);
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

/**
 * POST /api/user/change-password
 */
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    const { oldPassword, newPassword } = req.body || {};

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "Old and new password are required" });
    }

    if (String(newPassword).trim().length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, hashed_password
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(oldPassword, user.hashed_password || "");

    if (!ok) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `
      UPDATE users
      SET hashed_password = ?
      WHERE id = ?
      `,
      [newHash, userId]
    );

    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("POST /api/user/change-password error:", error);
    return res.status(500).json({ message: "Failed to change password" });
  }
});

export default router;