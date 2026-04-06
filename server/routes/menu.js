import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function toMenuRow(row) {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price || 0),
    image_url: row.image_url || "",
    is_available: !!row.is_available,
    created_at: row.created_at,
    category: row.category || "",
  };
}

// GET all menu items
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, name, price, image_url, is_available, created_at, category
      FROM menu
      ORDER BY id DESC
      `
    );

    res.json(rows.map(toMenuRow));
  } catch (error) {
    console.error("GET /api/admin/menu error:", error);
    res.status(500).json({ message: "Failed to load menu items" });
  }
});

// CREATE menu item
router.post("/", (req, res) => {
  upload.single("image")(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        console.error("UPLOAD ERROR:", uploadErr);
        return res.status(400).json({ message: "Image upload failed" });
      }

      console.log("CONTENT TYPE:", req.headers["content-type"]);
      console.log("REQ BODY:", req.body);
      console.log("REQ FILE:", req.file);

      const rawBody = req.body || {};

      const name = String(rawBody.name ?? "").trim();
      const price = rawBody.price;
      const category = String(rawBody.category ?? "").trim();
      const isAvailableRaw = rawBody.is_available;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ message: "Price must be 0 or more" });
      }

      const normalizedAvailability =
        isAvailableRaw === true ||
        isAvailableRaw === "true" ||
        isAvailableRaw === "1" ||
        isAvailableRaw === 1
          ? 1
          : 0;

      const image_url = req.file ? `/uploads/${req.file.filename}` : null;

      const [result] = await pool.query(
        `
        INSERT INTO menu (name, price, image_url, is_available, category)
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          name,
          numericPrice,
          image_url,
          normalizedAvailability,
          category || null,
        ]
      );

      const [rows] = await pool.query(
        `
        SELECT id, name, price, image_url, is_available, created_at, category
        FROM menu
        WHERE id = ?
        LIMIT 1
        `,
        [result.insertId]
      );

      if (!rows.length) {
        return res.status(500).json({ message: "Item created but could not be reloaded" });
      }

      return res.status(201).json(toMenuRow(rows[0]));
    } catch (error) {
      console.error("POST /api/admin/menu error:", error);
      return res.status(500).json({ message: "Failed to create menu item" });
    }
  });
});
// PATCH partial update
router.patch("/:id", upload.single("image"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid item id" });
    }

    const { name, price, category, is_available } = req.body || {};

    const fields = [];
    const values = [];

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }
      fields.push("name = ?");
      values.push(String(name).trim());
    }

    if (price !== undefined) {
      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ message: "Price must be 0 or more" });
      }
      fields.push("price = ?");
      values.push(numericPrice);
    }

    if (category !== undefined) {
      fields.push("category = ?");
      values.push(String(category).trim() || null);
    }

    if (is_available !== undefined) {
      const normalized =
        is_available === true ||
        is_available === "true" ||
        is_available === "1" ||
        is_available === 1
          ? 1
          : 0;

      fields.push("is_available = ?");
      values.push(normalized);
    }

    if (req.file) {
      fields.push("image_url = ?");
      values.push(`/uploads/${req.file.filename}`);
    }

    if (!fields.length) {
      return res.status(400).json({ message: "No fields to update" });
    }

    values.push(id);

    await pool.query(
      `
      UPDATE menu
      SET ${fields.join(", ")}
      WHERE id = ?
      `,
      values
    );

    const [rows] = await pool.query(
      `
      SELECT id, name, price, image_url, is_available, created_at, category
      FROM menu
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.json(toMenuRow(rows[0]));
  } catch (error) {
    console.error(`PATCH /api/admin/menu/${req.params.id} error:`, error);
    res.status(500).json({ message: "Failed to update menu item" });
  }
});

// DELETE menu item
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid item id" });
    }

    const [result] = await pool.query("DELETE FROM menu WHERE id = ?", [id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.json({ ok: true, id });
  } catch (error) {
    console.error(`DELETE /api/admin/menu/${req.params.id} error:`, error);
    res.status(500).json({ message: "Failed to delete menu item" });
  }
});

export default router;