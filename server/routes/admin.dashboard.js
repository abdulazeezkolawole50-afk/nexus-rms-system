import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/dashboard", async (req, res) => {
  try {
    const [[revenue]] = await pool.query(
      "SELECT IFNULL(SUM(total_price),0) as totalRevenue FROM orders"
    );

    const [[orders]] = await pool.query(
      "SELECT COUNT(*) as totalOrders FROM orders"
    );

    res.json({
      totalRevenue: revenue.totalRevenue,
      totalOrders: orders.totalOrders
    });

  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;