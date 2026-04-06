import express from "express";
import nodemailer from "nodemailer";
import { pool } from "../db.js";
import requireCustomerAuth from "../middleware/requireCustomerAuth.js";

const router = express.Router();

// ==========================
// HELPERS
// ==========================
function estimateReadyTime(activeOrders) {
  return 15 + activeOrders * 3;
}

function emitOrderUpdate(payload) {
  try {
    if (global.io) {
      global.io.emit("order_update", payload);
      console.log("🔥 EMITTED order_update:", payload);
    } else {
      console.log("⚠️ global.io not available, skipped emit:", payload);
    }
  } catch (error) {
    console.error("SOCKET EMIT ERROR:", error);
  }
}

function notifyAdmins(type, payload = {}) {
  try {
    const safePayload = {
      orderId: payload.orderId ? Number(payload.orderId) : null,
      title: payload.title || "",
      message: payload.message || "",
      meta: payload.meta || null,
      createdAt: new Date().toISOString(),
    };

    if (typeof global.emitAdminNotification === "function") {
      global.emitAdminNotification(type, safePayload);
    } else if (global.io) {
      global.io.to("admins").emit("admin:notification", {
        id: `${type}-${safePayload.orderId || Date.now()}-${Date.now()}`,
        type,
        ...safePayload,
      });
    }

    console.log(`📣 ADMIN NOTIFICATION -> ${type}:`, safePayload);
  } catch (error) {
    console.error("ADMIN NOTIFICATION ERROR:", error);
  }
}

async function sendOrderEmail(to, orderId, total) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  if (!to) return;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Nexus Restaurant" <${process.env.SMTP_USER}>`,
    to,
    subject: `Order #${orderId} confirmed`,
    html: `
      <h2>Order Confirmed</h2>
      <p>Your order #${orderId} has been received.</p>
      <p>Total: ₦${Number(total).toLocaleString()}</p>
      <p>We are preparing your food.</p>
    `,
  });
}

async function getOrderDetails(orderId) {
  const [[order]] = await pool.query(
    `SELECT * FROM orders WHERE id = ? LIMIT 1`,
    [orderId]
  );

  if (!order) return null;

  const [items] = await pool.query(
    `SELECT * FROM order_items WHERE order_id = ?`,
    [orderId]
  );

  return { ...order, items };
}

// ==========================
// PUBLIC TRACK ORDER
// ==========================
router.get("/track/:id", async (req, res) => {
  try {
    const order = await getOrderDetails(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json(order);
  } catch (error) {
    console.error("TRACK ORDER ERROR:", error);
    return res.status(500).json({ message: "Failed to load order" });
  }
});

// ==========================
// PUBLIC CANCEL ORDER
// ==========================
router.patch("/track/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;

    const [[order]] = await pool.query(
      `SELECT order_status FROM orders WHERE id = ?`,
      [id]
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const status = String(order.order_status || "").toLowerCase().trim();

    if (!["new", "pending", "ordered", "open", "incoming"].includes(status)) {
      return res.status(400).json({
        message: "This order cannot be cancelled",
      });
    }

    const [items] = await pool.query(
      `SELECT menu_id FROM order_items WHERE order_id = ?`,
      [id]
    );

    for (const item of items) {
      await pool.query(
        `UPDATE menu SET is_available = 1 WHERE id = ?`,
        [item.menu_id]
      );
    }

    await pool.query(
      `UPDATE orders SET order_status = 'cancelled' WHERE id = ?`,
      [id]
    );

    emitOrderUpdate({
      orderId: Number(id),
      type: "cancelled",
    });

    notifyAdmins("order_cancelled", {
      orderId: Number(id),
      title: "Order Cancelled",
      message: `Order #${id} was cancelled by the customer.`,
    });

    return res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("PUBLIC CANCEL ERROR:", error);
    return res.status(500).json({ message: "Cancel failed" });
  }
});

// ==========================
// CHECKOUT
// ==========================
router.post("/checkout", requireCustomerAuth, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const { items, delivery_address, phone_number, payment_reference } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    if (!delivery_address || !phone_number) {
      return res.status(400).json({ message: "Address and phone required" });
    }

    await conn.beginTransaction();

    const [active] = await conn.query(
      `SELECT COUNT(*) AS total FROM orders WHERE order_status IN ('new', 'preparing')`
    );

    const estimated = estimateReadyTime(active[0]?.total || 0);

    let total = 0;

    for (const item of items) {
      const [[menuItem]] = await conn.query(
        `SELECT * FROM menu WHERE id = ?`,
        [item.menu_id]
      );

      if (!menuItem || !menuItem.is_available) {
        await conn.rollback();
        return res.status(400).json({ message: "Item unavailable" });
      }

      total += Number(menuItem.price || 0) * Number(item.quantity || 0);
    }

    const [orderResult] = await conn.query(
      `INSERT INTO orders 
      (customer_id, total_price, order_status, delivery_address, customer_phone, payment_status, payment_reference, estimated_ready_mins)
      VALUES (?, ?, 'new', ?, ?, 'successful', ?, ?)`,
      [
        req.customer.id,
        total,
        delivery_address,
        phone_number,
        payment_reference || null,
        estimated,
      ]
    );

    const orderId = orderResult.insertId;

    for (const item of items) {
      const [[menuItem]] = await conn.query(
        `SELECT * FROM menu WHERE id = ?`,
        [item.menu_id]
      );

      const quantity = Number(item.quantity || 0);
      const price = Number(menuItem.price || 0);

      await conn.query(
        `INSERT INTO order_items 
        (order_id, menu_id, item_name, unit_price, quantity, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          menuItem.id,
          menuItem.name,
          price,
          quantity,
          price * quantity,
        ]
      );
    }

    await conn.commit();

    try {
      const [[customer]] = await pool.query(
        `SELECT email FROM customers WHERE id = ? LIMIT 1`,
        [req.customer.id]
      );

      await sendOrderEmail(customer?.email, orderId, total);
    } catch (mailError) {
      console.error("ORDER EMAIL ERROR:", mailError);
    }

    emitOrderUpdate({
      orderId: Number(orderId),
      type: "new_order",
    });

    notifyAdmins("new_order", {
      orderId: Number(orderId),
      title: "New Order",
      message: `A new order #${orderId} has arrived.`,
    });

    return res.status(201).json({
      success: true,
      order_id: orderId,
      estimated_ready_mins: estimated,
    });
  } catch (err) {
    await conn.rollback();
    console.error("CHECKOUT ERROR:", err);
    return res.status(500).json({ message: "Checkout failed" });
  } finally {
    conn.release();
  }
});

// ==========================
// HISTORY
// ==========================
router.get("/history", requireCustomerAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC`,
      [req.customer.id]
    );

    return res.json(rows);
  } catch (err) {
    console.error("HISTORY ERROR:", err);
    return res.status(500).json({ message: "Failed" });
  }
});

// ==========================
// AUTH TRACK
// ==========================
router.get("/:id", requireCustomerAuth, async (req, res) => {
  try {
    const order = await getOrderDetails(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json(order);
  } catch (error) {
    console.error("AUTH TRACK ERROR:", error);
    return res.status(500).json({ message: "Failed" });
  }
});

// ==========================
// CANCEL (AUTH)
// ==========================
router.patch("/:id/cancel", requireCustomerAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const [[order]] = await pool.query(
      `SELECT order_status FROM orders WHERE id = ?`,
      [id]
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const status = String(order.order_status || "").toLowerCase().trim();

    if (!["new", "pending", "ordered", "open", "incoming"].includes(status)) {
      return res.status(400).json({ message: "Cannot cancel" });
    }

    const [items] = await pool.query(
      `SELECT menu_id FROM order_items WHERE order_id = ?`,
      [id]
    );

    for (const item of items) {
      await pool.query(
        `UPDATE menu SET is_available = 1 WHERE id = ?`,
        [item.menu_id]
      );
    }

    await pool.query(
      `UPDATE orders SET order_status = 'cancelled' WHERE id = ?`,
      [id]
    );

    emitOrderUpdate({
      orderId: Number(id),
      type: "cancelled",
    });

    notifyAdmins("order_cancelled", {
      orderId: Number(id),
      title: "Order Cancelled",
      message: `Order #${id} was cancelled by the customer.`,
    });

    return res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (err) {
    console.error("AUTH CANCEL ERROR:", err);
    return res.status(500).json({ message: "Cancel failed" });
  }
});

export default router;