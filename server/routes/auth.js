import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "../db.js";

const router = Router();

router.post("/register", async (req, res) => {
  const schema = z.object({
    full_name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(["manager", "cashier"]).optional()
  });

  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error);

  const { full_name, email, password, role = "cashier" } = body.data;
  const [existing] = await db.query("SELECT id FROM users WHERE email=?", [email]);
  if (existing.length) return res.status(409).json({ message: "Email already used" });

  const password_hash = await bcrypt.hash(password, 10);
  const [result] = await db.query(
    "INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,?)",
    [full_name, email, password_hash, role]
  );

  res.json({ id: result.insertId, full_name, email, role });
});

router.post("/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  });

  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error);

  const { email, password } = body.data;
  const [rows] = await db.query("SELECT * FROM users WHERE email=?", [email]);
  const user = rows[0];
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, role: user.role, full_name: user.full_name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, user: { id: user.id, role: user.role, full_name: user.full_name, email: user.email } });
});

export default router;
