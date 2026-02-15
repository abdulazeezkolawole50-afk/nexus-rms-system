import { Router } from "express";
import { db } from "../db.js";
import { auth } from "../middleware/auth.js";
import { z } from "zod";

const router = Router();

function calcTotals(items, taxRate = 0.075, svcRate = 0.05) {
  const subtotal = items.reduce((s, it) => s + (Number(it.unit_price) * Number(it.qty)), 0);
  const tax = subtotal * taxRate;
  const service_charge = subtotal * svcRate;
  const total = subtotal + tax + service_charge;
  return { subtotal, tax, service_charge, total };
}

router.get("/", auth, async (req, res) => {
  const [rows] = await db.query(`
    SELECT o.*, rt.label as table_label, u.full_name as created_by_name
    FROM orders o
    LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
    JOIN users u ON u.id = o.created_by
    ORDER BY o.id DESC
  `);
  res.json(rows);
});

router.get("/:id", auth, async (req, res) => {
  const id = Number(req.params.id);

  const [[order]] = await db.query("SELECT * FROM orders WHERE id=?", [id]);
  if (!order) return res.status(404).json({ message: "Order not found" });

  const [items] = await db.query(`
    SELECT oi.*, m.name
    FROM order_items oi
    JOIN menu_items m ON m.id = oi.menu_item_id
    WHERE oi.order_id=?
    ORDER BY oi.id DESC
  `, [id]);

  const [[payment]] = await db.query("SELECT * FROM payments WHERE order_id=?", [id]);

  res.json({ order, items, payment: payment || null });
});

router.post("/", auth, async (req, res) => {
  const schema = z.object({ table_id: z.number().int().nullable().optional() });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error);

  const { table_id = null } = body.data;
  const [r] = await db.query(
    "INSERT INTO orders(table_id,created_by,status) VALUES(?,?, 'open')",
    [table_id, req.user.id]
  );

  if (table_id) await db.query("UPDATE restaurant_tables SET status='occupied' WHERE id=?", [table_id]);

  res.json({ id: r.insertId });
});

router.post("/:id/items", auth, async (req, res) => {
  const order_id = Number(req.params.id);

  const schema = z.object({
    menu_item_id: z.number().int(),
    qty: z.number().int().positive()
  });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error);

  const { menu_item_id, qty } = body.data;

  const [[item]] = await db.query("SELECT id, price FROM menu_items WHERE id=? AND is_available=1", [menu_item_id]);
  if (!item) return res.status(400).json({ message: "Menu item not available" });

  const unit_price = Number(item.price);
  const line_total = unit_price * qty;

  await db.query(
    "INSERT INTO order_items(order_id,menu_item_id,qty,unit_price,line_total) VALUES(?,?,?,?,?)",
    [order_id, menu_item_id, qty, unit_price, line_total]
  );

  // Recalc totals
  const [items] = await db.query("SELECT qty, unit_price FROM order_items WHERE order_id=?", [order_id]);
  const totals = calcTotals(items);

  await db.query(
    "UPDATE orders SET subtotal=?, tax=?, service_charge=?, total=? WHERE id=?",
    [totals.subtotal, totals.tax, totals.service_charge, totals.total, order_id]
  );

  res.json({ ok: true, totals });
});

router.put("/:id/status", auth, async (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ status: z.enum(["open","kitchen","served","closed","cancelled"]) });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error);

  await db.query("UPDATE orders SET status=? WHERE id=?", [body.data.status, id]);
  res.json({ ok: true });
});

router.post("/:id/pay", auth, async (req, res) => {
  const order_id = Number(req.params.id);
  const schema = z.object({
    method: z.enum(["cash","pos","transfer"]),
    amount: z.number().positive(),
    receipt_no: z.string().min(2).optional()
  });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error);

  const [[order]] = await db.query("SELECT * FROM orders WHERE id=?", [order_id]);
  if (!order) return res.status(404).json({ message: "Order not found" });

  await db.query(
    "INSERT INTO payments(order_id,method,amount,receipt_no) VALUES(?,?,?,?)",
    [order_id, body.data.method, body.data.amount, body.data.receipt_no || null]
  );

  await db.query("UPDATE orders SET status='closed' WHERE id=?", [order_id]);

  if (order.table_id) await db.query("UPDATE restaurant_tables SET status='free' WHERE id=?", [order.table_id]);

  res.json({ ok: true });
});

export default router;
