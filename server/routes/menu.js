// server/routes/menu.js
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

/* ===========================
   GET ALL MENU ITEMS
=========================== */
router.get("/", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM menu ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("GET /menu error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================
   CREATE MENU ITEM (MANAGER ONLY)
   Accepts:
   - name (string)
   - price (number/string)
   - image_url (string|null)
   - is_available (boolean or 0/1)
=========================== */
router.post("/", requireAuth, requireRole("manager"), async (req, res) => {
  try {
    let { name, price, image_url, is_available } = req.body;

    name = String(name || "").trim();
    const p = Number(price);

    // allow boolean / "1" / 1 / "0" / 0
    const available =
      is_available === true ||
      is_available === 1 ||
      is_available === "1" ||
      is_available === "true";

    const availInt = available ? 1 : 0;

    if (!name || !Number.isFinite(p) || p <= 0) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const img = image_url ? String(image_url).trim() : null;

    const [r] = await db.query(
      "INSERT INTO menu (name, price, image_url, is_available) VALUES (?, ?, ?, ?)",
      [name, p, img || null, availInt]
    );

    const [[created]] = await db.query("SELECT * FROM menu WHERE id = ?", [r.insertId]);
    res.json(created);
  } catch (err) {
    console.error("POST /menu error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================
   UPDATE AVAILABILITY (MANAGER ONLY)
   Your frontend currently calls:
   PUT /api/menu/:id   body: { is_available: true/false }
=========================== */
router.put("/:id", requireAuth, requireRole("manager"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { is_available } = req.body;

    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid input" });

    const available =
      is_available === true ||
      is_available === 1 ||
      is_available === "1" ||
      is_available === "true";

    const availInt = available ? 1 : 0;

    await db.query("UPDATE menu SET is_available = ? WHERE id = ?", [availInt, id]);

    const [[updated]] = await db.query("SELECT * FROM menu WHERE id = ?", [id]);
    res.json(updated || { ok: true });
  } catch (err) {
    console.error("PUT /menu/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================
   OPTIONAL: supports your older route:
   PUT /api/menu/:id/toggle
=========================== */
router.put("/:id/toggle", requireAuth, requireRole("manager"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid input" });

    const [[row]] = await db.query("SELECT is_available FROM menu WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ message: "Not found" });

    const nextVal = row.is_available === 1 ? 0 : 1;
    await db.query("UPDATE menu SET is_available = ? WHERE id = ?", [nextVal, id]);

    const [[updated]] = await db.query("SELECT * FROM menu WHERE id = ?", [id]);
    res.json(updated || { ok: true });
  } catch (err) {
    console.error("PUT /menu/:id/toggle error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================
   DELETE MENU ITEM (MANAGER ONLY)
=========================== */
router.delete("/:id", requireAuth, requireRole("manager"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid input" });

    await db.query("DELETE FROM menu WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /menu/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
