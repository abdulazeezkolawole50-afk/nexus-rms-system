import { Router } from "express";
import { db } from "../db.js";
import { auth, requireRole } from "../middleware/auth.js";
import { z } from "zod";

const router = Router();

router.get("/", auth, async (_, res) => {
  const [rows] = await db.query("SELECT * FROM restaurant_tables ORDER BY id DESC");
  res.json(rows);
});

router.post("/", auth, requireRole("manager"), async (req, res) => {
  const schema = z.object({
    label: z.string().min(1),
    capacity: z.number().int().positive().optional(),
    status: z.enum(["free","occupied","reserved"]).optional()
  });

  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error);

  const { label, capacity = 2, status = "free" } = body.data;
  const [r] = await db.query(
    "INSERT INTO restaurant_tables(label,capacity,status) VALUES(?,?,?)",
    [label, capacity, status]
  );
  res.json({ id: r.insertId });
});

router.put("/:id", auth, requireRole("manager"), async (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({
    label: z.string().min(1).optional(),
    capacity: z.number().int().positive().optional(),
    status: z.enum(["free","occupied","reserved"]).optional()
  });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error);

  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(body.data)) {
    fields.push(`${k}=?`);
    vals.push(v);
  }
  if (!fields.length) return res.json({ ok: true });
  vals.push(id);

  await db.query(`UPDATE restaurant_tables SET ${fields.join(", ")} WHERE id=?`, vals);
  res.json({ ok: true });
});

router.delete("/:id", auth, requireRole("manager"), async (req, res) => {
  await db.query("DELETE FROM restaurant_tables WHERE id=?", [Number(req.params.id)]);
  res.json({ ok: true });
});

export default router;
