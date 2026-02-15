import { Router } from "express";
import { db } from "../db.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.get("/", auth, async (req, res) => {
  const [[salesToday]] = await db.query(`
    SELECT COALESCE(SUM(amount),0) as total
    FROM payments
    WHERE DATE(paid_at) = CURDATE()
  `);

  const [[openOrders]] = await db.query(`
    SELECT COUNT(*) as count FROM orders WHERE status IN ('open','kitchen','served')
  `);

  const [[tablesOcc]] = await db.query(`
    SELECT COUNT(*) as count FROM restaurant_tables WHERE status='occupied'
  `);

  res.json({
    salesToday: Number(salesToday.total),
    openOrders: Number(openOrders.count),
    tablesOccupied: Number(tablesOcc.count)
  });
});

export default router;
