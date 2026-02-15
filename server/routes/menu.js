import { Router } from "express";
import { db } from "../db.js";
import { auth, requireRole } from "../middleware/auth.js";
import { z } from "zod";

const router = Router();

router.get("/", auth, async (req, res) => {
  const [rows] = await db.query(`
    SELECT m.*, c.name AS category_name
    FROM menu_items m
    LEFT JOIN categories c ON c.id = m.category_id
    ORDER BY m.id DESC
  `);
  res.json(rows);
});

router.post("/", auth, requireRole("manager"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    price: z.number().positive(),
    category_id: z.number().int().nullable().optional(),
    is_available: z.boolean().optional(),
    image_url: z.string().url().nullable().optional()
  });

  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error);

  const { name, price, category_id = null, is_available = true, image_url = null } = body.data;

  const [r] = await db.query(
    "INSERT INTO menu_items(name,price,category_id,is_available,image_url) VALUES (?,?,?,?,?)",
    [name, price, category_id, is_available ? 1 : 0, image_url]
  );
  res.json({ id: r.insertId });
});

router.put("/:id", auth, requireRole("manager"), async (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({
    name: z.string().min(2).optional(),
    price: z.number().positive().optional(),
    category_id: z.number().int().nullable().optional(),
    is_available: z.boolean().optional(),
    image_url: z.string().url().nullable().optional()
  });

  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error);

  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(body.data)) {
    fields.push(`${k}=?`);
    vals.push(k === "is_available" ? (v ? 1 : 0) : v);
  }
  if (!fields.length) return res.json({ ok: true });

  vals.push(id);
  await db.query(`UPDATE menu_items SET ${fields.join(", ")} WHERE id=?`, vals);
  res.json({ ok: true });
});

router.delete("/:id", auth, requireRole("manager"), async (req, res) => {
  await db.query("DELETE FROM menu_items WHERE id=?", [Number(req.params.id)]);
  res.json({ ok: true });
});

export default router;
