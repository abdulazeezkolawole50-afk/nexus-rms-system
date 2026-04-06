// server/routes/tables.js
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { z } from "zod";

const router = Router();

/**
 * GET /api/tables
 * customer + manager
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM restaurant_tables ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/tables
 * manager only
 */
router.post("/", requireAuth, requireRole("manager"), async (req, res) => {
  const schema = z.object({
    label: z.string().min(1),
    capacity: z.number().int().positive().optional().default(4),
  });

  const parsed = schema.safeParse({
    ...req.body,
    capacity: Number(req.body?.capacity ?? 4),
  });

  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  try {
    const { label, capacity } = parsed.data;

    const [r] = await db.query(
      "INSERT INTO restaurant_tables(label, capacity, status) VALUES(?,?, 'free')",
      [label, capacity]
    );

    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/tables/:id/status
 * manager only
 */
router.put("/:id/status", requireAuth, requireRole("manager"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });

  const schema = z.object({
    status: z.enum(["free", "occupied", "reserved"]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  try {
    await db.query("UPDATE restaurant_tables SET status=? WHERE id=?", [
      parsed.data.status,
      id,
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/tables/:id
 * manager only
 */
router.delete("/:id", requireAuth, requireRole("manager"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });

  try {
    await db.query("DELETE FROM restaurant_tables WHERE id=?", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;