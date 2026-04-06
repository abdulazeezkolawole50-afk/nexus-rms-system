// server/routes/dashboard.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/stats", async (req, res) => {
  try {
    // total revenue = sum of completed orders
    const [revRows] = await pool.query(
      `SELECT COALESCE(SUM(total_price), 0) AS totalRevenue
       FROM orders
       WHERE status IN ('completed')`
    );

    // active orders = pending + in_kitchen
    const [activeRows] = await pool.query(
      `SELECT COUNT(*) AS activeOrders
       FROM orders
       WHERE status IN ('pending','in_kitchen')`
    );

    // critical alerts: out of stock or unavailable
    const [criticalRows] = await pool.query(
      `SELECT id, name, stock_count, is_available
       FROM menu_items
       WHERE stock_count <= 0 OR is_available = 0
       ORDER BY stock_count ASC`
    );

    res.json({
      totalRevenue: Number(revRows?.[0]?.totalRevenue || 0),
      activeOrders: Number(activeRows?.[0]?.activeOrders || 0),
      criticalAlerts: criticalRows,
    });
  } catch (e) {
    console.error("DASHBOARD STATS ERROR:", e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;