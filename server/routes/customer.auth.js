import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const router = express.Router();

router.post("/signup", async (req, res) => {
  try {
    const { full_name, email, phone_number, password } = req.body;

    if (!full_name || !email || !phone_number || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const [[existing]] = await pool.query(
      "SELECT id FROM customers WHERE email = ? LIMIT 1",
      [email]
    );

    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `
      INSERT INTO customers (full_name, email, phone_number, password_hash)
      VALUES (?, ?, ?, ?)
      `,
      [full_name, email, phone_number, password_hash]
    );

    const token = jwt.sign(
      { id: result.insertId, email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      token,
      customer: {
        id: result.insertId,
        full_name,
        email,
        phone_number,
      },
    });
  } catch (error) {
    console.error("CUSTOMER SIGNUP ERROR:", error);
    return res.status(500).json({ message: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [[customer]] = await pool.query(
      `
      SELECT id, full_name, email, phone_number, password_hash
      FROM customers
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (!customer) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, customer.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: customer.id, email: customer.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      customer: {
        id: customer.id,
        full_name: customer.full_name,
        email: customer.email,
        phone_number: customer.phone_number,
      },
    });
  } catch (error) {
    console.error("CUSTOMER LOGIN ERROR:", error);
    return res.status(500).json({ message: "Login failed" });
  }
});

export default router;