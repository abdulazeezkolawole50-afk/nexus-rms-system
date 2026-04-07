import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { sendOtpEmail } from "../utils/mailer.js";
import {
  generateSixDigitCode,
  hashCode,
  compareCode,
} from "../utils/security.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimiters.js";
import {
  resetValidation,
  otpValidation,
  validate,
} from "../middleware/validators.js";

const router = express.Router();

async function createVerifiedCustomerAccount(payload) {
  const hashedPassword = await bcrypt.hash(payload.password, 10);

  const [result] = await pool.query(
    `
    INSERT INTO users
    (full_name, email, phone_number, hashed_password, role, email_verified)
    VALUES (?, ?, ?, ?, 'customer', 1)
    `,
    [
      payload.full_name,
      payload.email,
      payload.phone_number,
      hashedPassword,
    ]
  );

  return result.insertId;
}

/* =========================
   LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, full_name, email, role, hashed_password, password, email_verified
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];
    const storedHash = user.hashed_password || user.password;

    if (!storedHash || typeof storedHash !== "string") {
      return res.status(500).json({
        message: "This account has no valid password hash yet",
      });
    }

    const valid = await bcrypt.compare(password, storedHash);

    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (Number(user.email_verified || 0) !== 1) {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET || "nexus_secret_key",
      { expiresIn: "2h" }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("AUTH LOGIN ERROR:", err);
    return res.status(500).json({ message: "Login failed" });
  }
});

/* =========================
   SIGNUP REQUEST
   Sends OTP if mail works
   Falls back to direct account creation if mail is unavailable
========================= */
router.post("/signup", authLimiter, async (req, res) => {
  try {
    const { full_name, email, phone_number, password } = req.body;

    if (!full_name || !email || !phone_number || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const [existing] = await pool.query(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const code = generateSixDigitCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `
      INSERT INTO pending_verifications
      (email, purpose, code_hash, payload_json, expires_at)
      VALUES (?, 'signup', ?, ?, ?)
      `,
      [
        email,
        codeHash,
        JSON.stringify({
          full_name,
          email,
          phone_number,
          password,
        }),
        expiresAt,
      ]
    );

    const mailResult = await sendOtpEmail(
      email,
      "Verify your Nexus account",
      code
    );

    if (!mailResult.sent) {
      await createVerifiedCustomerAccount({
        full_name,
        email,
        phone_number,
        password,
      });

      await pool.query(
        `
        UPDATE pending_verifications
        SET verified = 1
        WHERE email = ? AND purpose = 'signup' AND verified = 0
        `,
        [email]
      );

      return res.json({
        success: true,
        auto_verified: true,
        message:
          "Account created successfully. Email service is temporarily unavailable, so your account was auto-verified. You can log in now.",
      });
    }

    return res.json({
      success: true,
      message: "Verification code sent to your email.",
    });
  } catch (err) {
    console.error("AUTH SIGNUP REQUEST ERROR:", err);
    return res.status(500).json({ message: "Signup request failed." });
  }
});

/* =========================
   SIGNUP VERIFY
========================= */
router.post(
  "/signup/verify",
  otpLimiter,
  otpValidation,
  validate,
  async (req, res) => {
    try {
      const { email, code } = req.body;

      const [existingUser] = await pool.query(
        `
        SELECT id, email_verified
        FROM users
        WHERE email = ?
        LIMIT 1
        `,
        [email]
      );

      if (
        existingUser.length > 0 &&
        Number(existingUser[0].email_verified || 0) === 1
      ) {
        await pool.query(
          `
          UPDATE pending_verifications
          SET verified = 1
          WHERE email = ? AND purpose = 'signup' AND verified = 0
          `,
          [email]
        );

        return res.json({
          success: true,
          message: "Account already created. You can log in now.",
        });
      }

      const [rows] = await pool.query(
        `
        SELECT * FROM pending_verifications
        WHERE email = ? AND purpose = 'signup' AND verified = 0
        ORDER BY id DESC
        LIMIT 1
        `,
        [email]
      );

      if (!rows.length) {
        return res
          .status(400)
          .json({ message: "Verification request not found." });
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

      const [existing] = await pool.query(
        `SELECT id FROM users WHERE email = ? LIMIT 1`,
        [payload.email]
      );

      if (existing.length > 0) {
        await pool.query(
          `UPDATE pending_verifications SET verified = 1 WHERE id = ?`,
          [row.id]
        );

        return res.json({
          success: true,
          message: "Account already exists. You can log in now.",
        });
      }

      const hashedPassword = await bcrypt.hash(payload.password, 10);

      await pool.query(
        `
        INSERT INTO users
        (full_name, email, phone_number, hashed_password, role, email_verified)
        VALUES (?, ?, ?, ?, 'customer', 1)
        `,
        [
          payload.full_name,
          payload.email,
          payload.phone_number,
          hashedPassword,
        ]
      );

      await pool.query(
        `UPDATE pending_verifications SET verified = 1 WHERE id = ?`,
        [row.id]
      );

      return res.json({
        success: true,
        message: "Account verified and created.",
      });
    } catch (err) {
      console.error("AUTH SIGNUP VERIFY ERROR:", err);
      return res.status(500).json({ message: "Verification failed." });
    }
  }
);

/* =========================
   FORGOT PASSWORD REQUEST
========================= */
router.post(
  "/forgot-password/request",
  authLimiter,
  resetValidation,
  validate,
  async (req, res) => {
    try {
      const { email } = req.body;

      const [rows] = await pool.query(
        `SELECT id FROM users WHERE email = ? LIMIT 1`,
        [email]
      );

      if (!rows.length) {
        return res.json({
          success: true,
          message: "If the email exists, a code was sent.",
        });
      }

      const code = generateSixDigitCode();
      const codeHash = await hashCode(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await pool.query(
        `
        INSERT INTO password_resets (email, code_hash, expires_at)
        VALUES (?, ?, ?)
        `,
        [email, codeHash, expiresAt]
      );

      const mailResult = await sendOtpEmail(
        email,
        "Nexus RMS password reset code",
        code
      );

      if (!mailResult.sent) {
        return res.status(503).json({
          success: false,
          message:
            "Reset code could not be sent right now. Please try again later.",
        });
      }

      return res.json({
        success: true,
        message: "If the email exists, a code was sent.",
      });
    } catch (error) {
      console.error("FORGOT PASSWORD REQUEST ERROR:", error);
      return res
        .status(500)
        .json({ message: "Failed to start password reset." });
    }
  }
);

/* =========================
   FORGOT PASSWORD VERIFY
========================= */
router.post(
  "/forgot-password/verify",
  otpLimiter,
  otpValidation,
  validate,
  async (req, res) => {
    try {
      const { email, code } = req.body;

      const [rows] = await pool.query(
        `
        SELECT * FROM password_resets
        WHERE email = ? AND used_at IS NULL
        ORDER BY id DESC
        LIMIT 1
        `,
        [email]
      );

      if (!rows.length) {
        return res.status(400).json({ message: "Reset request not found." });
      }

      const row = rows[0];

      if (new Date(row.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ message: "Code expired." });
      }

      const ok = await compareCode(code, row.code_hash);

      if (!ok) {
        return res.status(400).json({ message: "Invalid code." });
      }

      return res.json({ success: true, message: "Code verified." });
    } catch (error) {
      console.error("FORGOT PASSWORD VERIFY ERROR:", error);
      return res.status(500).json({ message: "Failed to verify code." });
    }
  }
);

/* =========================
   FORGOT PASSWORD RESET
========================= */
router.put("/forgot-password/reset", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        message: "Email, code, and new password are required.",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT * FROM password_resets
      WHERE email = ? AND used_at IS NULL
      ORDER BY id DESC
      LIMIT 1
      `,
      [email]
    );

    if (!rows.length) {
      return res.status(400).json({ message: "Reset request not found." });
    }

    const row = rows[0];

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: "Code expired." });
    }

    const ok = await compareCode(code, row.code_hash);

    if (!ok) {
      return res.status(400).json({ message: "Invalid code." });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await pool.query(`UPDATE users SET hashed_password = ? WHERE email = ?`, [
      hash,
      email,
    ]);

    await pool.query(`UPDATE password_resets SET used_at = NOW() WHERE id = ?`, [
      row.id,
    ]);

    return res.json({
      success: true,
      message: "Password reset successful.",
    });
  } catch (error) {
    console.error("PASSWORD RESET ERROR:", error);
    return res.status(500).json({ message: "Failed to reset password." });
  }
});

router.post("/signup/resend", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const [existing] = await pool.query(
      `SELECT id, email_verified FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (existing.length > 0 && Number(existing[0].email_verified || 0) === 1) {
      return res.json({
        success: true,
        message: "Account already created. You can log in now.",
      });
    }

    const [pending] = await pool.query(
      `
      SELECT * FROM pending_verifications
      WHERE email = ? AND purpose = 'signup' AND verified = 0
      ORDER BY id DESC
      LIMIT 1
      `,
      [email]
    );

    if (!pending.length) {
      return res.status(400).json({
        message: "No pending signup verification found.",
      });
    }

    const last = pending[0];
    const code = generateSixDigitCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `
      UPDATE pending_verifications
      SET code_hash = ?, expires_at = ?
      WHERE id = ?
      `,
      [codeHash, expiresAt, last.id]
    );

    const mailResult = await sendOtpEmail(
      email,
      "Verify your Nexus account",
      code
    );

    if (!mailResult.sent) {
      const payload = JSON.parse(last.payload_json || "{}");

      const [existsAgain] = await pool.query(
        `SELECT id FROM users WHERE email = ? LIMIT 1`,
        [email]
      );

      if (!existsAgain.length && payload.email) {
        await createVerifiedCustomerAccount(payload);
      }

      await pool.query(
        `UPDATE pending_verifications SET verified = 1 WHERE id = ?`,
        [last.id]
      );

      return res.json({
        success: true,
        auto_verified: true,
        message:
          "Email service is temporarily unavailable. Your account has been created and you can log in now.",
      });
    }

    return res.json({
      success: true,
      message: "A new verification code was sent.",
    });
  } catch (err) {
    console.error("AUTH SIGNUP RESEND ERROR:", err);
    return res.status(500).json({ message: "Failed to resend code." });
  }
});

export default router;