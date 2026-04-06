import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { sendOtpEmail } from "../utils/mailer.js";
import { generateSixDigitCode, hashCode, compareCode, signJwt } from "../utils/security.js";
import { signupValidation, otpValidation, validate, loginValidation, resetValidation } from "../middleware/validators.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/register/request", authLimiter, signupValidation, validate, async (req, res) => {
  try {
    const { full_name, email, password, phone_number } = req.body;

    const [existing] = await pool.query(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (existing.length) {
      return res.status(400).json({ message: "Email already exists." });
    }

    const code = generateSixDigitCode();
    const codeHash = await hashCode(code);
    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO pending_verifications (email, purpose, code_hash, payload_json, expires_at)
       VALUES (?, 'signup', ?, ?, ?)`,
      [
        email,
        codeHash,
        JSON.stringify({
          full_name,
          email,
          password: passwordHash,
          phone_number: phone_number || "",
          role: "customer",
        }),
        expiresAt,
      ]
    );

    await sendOtpEmail(email, "Verify your Nexus RMS account", code);

    return res.json({ success: true, message: "Verification email sent." });
  } catch (error) {
    console.error("REGISTER REQUEST ERROR:", error);
    return res.status(500).json({ message: "Failed to start registration." });
  }
});

router.post("/register/verify", otpLimiter, otpValidation, validate, async (req, res) => {
  try {
    const { email, code } = req.body;

    const [rows] = await pool.query(
      `SELECT * FROM pending_verifications
       WHERE email = ? AND purpose = 'signup' AND verified = 0
       ORDER BY id DESC LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(400).json({ message: "Verification request not found." });
    }

    const row = rows[0];

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: "Code expired." });
    }

    const ok = await compareCode(code, row.code_hash);
    if (!ok) {
      return res.status(400).json({ message: "Invalid code." });
    }

    const payload = JSON.parse(row.payload_json || "{}");

    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, password, phone_number, role)
       VALUES (?, ?, ?, ?, ?)`,
      [
        payload.full_name,
        payload.email,
        payload.password,
        payload.phone_number || "",
        "customer",
      ]
    );

    await pool.query(
      `UPDATE pending_verifications SET verified = 1 WHERE id = ?`,
      [row.id]
    );

    return res.json({
      success: true,
      message: "Account created successfully.",
      userId: result.insertId,
    });
  } catch (error) {
    console.error("REGISTER VERIFY ERROR:", error);
    return res.status(500).json({ message: "Failed to verify registration." });
  }
});