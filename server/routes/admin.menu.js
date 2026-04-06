// server/routes/admin.menu.js
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const router = express.Router();

/* -------------------- paths / uploads -------------------- */

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
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* -------------------- auth helpers -------------------- */

function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

function requireAdmin(req, res, next) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role !== "admin" && role !== "manager") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

/* -------------------- helpers -------------------- */

function normalizeAvailability(value) {
  return value === true ||
    value === "true" ||
    value === "1" ||
    value === 1
    ? 1
    : 0;
}

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

/* -------------------- GET /api/admin/menu -------------------- */
/* returns array because your frontend expects an array */

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, name, price, image_url, is_available, created_at, category
      FROM menu
      ORDER BY id DESC
      `
    );

    return res.json(rows.map(toMenuRow));
  } catch (e) {
    console.error("ADMIN MENU LIST ERROR:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/* -------------------- POST /api/admin/menu -------------------- */
/* handles multipart/form-data + image upload */

router.post(
  "/",
  requireAuth,
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      console.log("ADMIN MENU POST BODY:", req.body);
      console.log("ADMIN MENU POST FILE:", req.file);

      const name = String(req.body?.name || "").trim();
      const category = String(req.body?.category || "").trim();
      const price = Number(req.body?.price);
      const is_available = normalizeAvailability(req.body?.is_available);

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ message: "Price must be 0 or more" });
      }

      const image_url = req.file ? `/uploads/${req.file.filename}` : null;

      const [result] = await pool.query(
        `
        INSERT INTO menu (name, price, image_url, is_available, category)
        VALUES (?, ?, ?, ?, ?)
        `,
        [name, price, image_url, is_available, category || null]
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
    } catch (e) {
      console.error("ADMIN MENU CREATE ERROR:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* -------------------- PATCH /api/admin/menu/:id -------------------- */
/* partial update, can update only price / availability / image etc. */

router.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const fields = [];
      const values = [];

      if (req.body?.name !== undefined) {
        const name = String(req.body.name || "").trim();
        if (!name) {
          return res.status(400).json({ message: "Name cannot be empty" });
        }
        fields.push("name = ?");
        values.push(name);
      }

      if (req.body?.price !== undefined) {
        const numericPrice = Number(req.body.price);
        if (!Number.isFinite(numericPrice) || numericPrice < 0) {
          return res.status(400).json({ message: "Price must be 0 or more" });
        }
        fields.push("price = ?");
        values.push(numericPrice);
      }

      if (req.body?.category !== undefined) {
        const category = String(req.body.category || "").trim();
        fields.push("category = ?");
        values.push(category || null);
      }

      if (req.body?.is_available !== undefined) {
        fields.push("is_available = ?");
        values.push(normalizeAvailability(req.body.is_available));
      }

      if (req.file) {
        fields.push("image_url = ?");
        values.push(`/uploads/${req.file.filename}`);
      }

      if (!fields.length) {
        return res.status(400).json({ message: "Nothing to update" });
      }

      values.push(id);

      const [result] = await pool.query(
        `
        UPDATE menu
        SET ${fields.join(", ")}
        WHERE id = ?
        `,
        values
      );

      if (!result.affectedRows) {
        return res.status(404).json({ message: "Menu item not found" });
      }

      const [rows] = await pool.query(
        `
        SELECT id, name, price, image_url, is_available, created_at, category
        FROM menu
        WHERE id = ?
        LIMIT 1
        `,
        [id]
      );

      return res.json(toMenuRow(rows[0]));
    } catch (e) {
      console.error("ADMIN MENU PATCH ERROR:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* -------------------- PUT /api/admin/menu/:id -------------------- */
/* keep this too so older frontend code won't break */

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const fields = [];
    const values = [];
    const body = req.body || {};

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }
      fields.push("name = ?");
      values.push(name);
    }

    if (body.price !== undefined) {
      const numericPrice = Number(body.price);
      if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ message: "Price must be 0 or more" });
      }
      fields.push("price = ?");
      values.push(numericPrice);
    }

    if (body.category !== undefined) {
      fields.push("category = ?");
      values.push(String(body.category || "").trim() || null);
    }

    if (body.is_available !== undefined) {
      fields.push("is_available = ?");
      values.push(normalizeAvailability(body.is_available));
    }

    if (!fields.length) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    values.push(id);

    const [result] = await pool.query(
      `UPDATE menu SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, name, price, image_url, is_available, created_at, category
      FROM menu
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    return res.json(toMenuRow(rows[0]));
  } catch (e) {
    console.error("ADMIN MENU UPDATE ERROR:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/* -------------------- DELETE /api/admin/menu/:id -------------------- */

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const [result] = await pool.query("DELETE FROM menu WHERE id = ?", [id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    return res.json({ ok: true, id });
  } catch (e) {
    console.error("ADMIN MENU DELETE ERROR:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;