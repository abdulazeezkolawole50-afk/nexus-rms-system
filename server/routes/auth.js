import { Router } from "express";
import { db } from "../db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";

const router = Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

router.post("/register", async (req, res) => {
  const schema = z.object({
    full_name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(["cashier", "manager"]).default("cashier"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", error: parsed.error });
  }

  const { full_name, email, password, role } = parsed.data;

  const [[exists]] = await db.query("SELECT id FROM users WHERE email=?", [email]);
  if (exists) return res.status(400).json({ message: "Email already exists" });

  const hash = await bcrypt.hash(password, 10);

  const [r] = await db.query(
    "INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,?)",
    [full_name, email, hash, role]
  );

  res.json({ ok: true, id: r.insertId });
});

router.post("/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const { email, password } = parsed.data;

  const [[user]] = await db.query("SELECT * FROM users WHERE email=?", [email]);
  if (!user) return res.status(400).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).json({ message: "Invalid credentials" });

  const token = signToken(user);
  res.json({ token });
});

export default router;
