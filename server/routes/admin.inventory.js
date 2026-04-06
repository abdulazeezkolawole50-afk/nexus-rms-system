import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * GET /api/admin/inventory/alerts
 * Return only low-stock items
 */
router.get("/alerts", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, item_name, current_stock, unit, low_stock_threshold
      FROM inventory
      WHERE current_stock <= low_stock_threshold
      ORDER BY current_stock ASC, item_name ASC
      `
    );

    return res.json(rows);
  } catch (error) {
    console.error("GET /api/admin/inventory/alerts error:", error);
    return res.status(500).json({ message: "Failed to fetch inventory alerts" });
  }
});

/**
 * GET /api/admin/inventory
 */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, item_name, current_stock, unit, low_stock_threshold
      FROM inventory
      ORDER BY item_name ASC
      `
    );

    return res.json(rows);
  } catch (error) {
    console.error("GET /api/admin/inventory error:", error);
    return res.status(500).json({ message: "Failed to fetch inventory" });
  }
});

/**
 * PATCH /api/admin/inventory/:id/restock
 * Increase stock by an entered quantity
 */
router.patch("/:id/restock", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = Number(req.body?.amount);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid inventory id" });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Restock amount must be greater than 0" });
    }

    const [result] = await pool.query(
      `
      UPDATE inventory
      SET current_stock = current_stock + ?
      WHERE id = ?
      `,
      [amount, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, item_name, current_stock, unit, low_stock_threshold
      FROM inventory
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    return res.json(rows[0]);
  } catch (error) {
    console.error("PATCH /api/admin/inventory/:id/restock error:", error);
    return res.status(500).json({ message: "Failed to restock item" });
  }
});

export default router;