import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { q = "", category = "all" } = req.query;

    const params = [];
    let sql = `
      SELECT id, name, price, image_url, category, is_available
      FROM menu
      WHERE is_available = 1
    `;

    if (category && category !== "all") {
      sql += " AND LOWER(category) = LOWER(?)";
      params.push(category);
    }

    if (q) {
      sql += " AND name LIKE ?";
      params.push(`%${q}%`);
    }

    sql += " ORDER BY id DESC";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("CUSTOMER MENU ERROR:", error);
    res.status(500).json({ message: "Failed to load menu" });
  }
});

export default router;