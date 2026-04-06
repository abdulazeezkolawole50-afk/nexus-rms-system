import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/* GET /api/admin/orders */
router.get("/orders", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        items,
        total_price,
        order_status,
        notes,
        is_archived,
        created_at,
        customer_id,
        delivery_address,
        customer_phone,
        payment_status,
        payment_reference,
        estimated_ready_mins
      FROM orders
      WHERE is_archived = 0
      ORDER BY created_at DESC, id DESC
    `);

    const ordersWithItems = await Promise.all(
      rows.map(async (order) => {
        let parsedItems = [];

        if (order.items) {
          try {
            const maybeItems =
              typeof order.items === "string"
                ? JSON.parse(order.items)
                : order.items;

            if (Array.isArray(maybeItems)) {
              parsedItems = maybeItems;
            } else if (
              maybeItems?.cartItems &&
              Array.isArray(maybeItems.cartItems)
            ) {
              parsedItems = maybeItems.cartItems;
            }
          } catch {
            parsedItems = [];
          }
        }

        const [orderItems] = await pool.query(
          `
          SELECT
            id,
            menu_id,
            item_name,
            unit_price,
            quantity,
            subtotal
          FROM order_items
          WHERE order_id = ?
          ORDER BY id ASC
          `,
          [order.id]
        );

        const normalizedOrderItems = orderItems.map((item) => ({
          id: item.id,
          menu_id: item.menu_id,
          name: item.item_name,
          item_name: item.item_name,
          price: Number(item.unit_price || 0),
          unit_price: Number(item.unit_price || 0),
          quantity: Number(item.quantity || 0),
          subtotal: Number(item.subtotal || 0),
        }));

        return {
          ...order,
          items: normalizedOrderItems.length ? normalizedOrderItems : parsedItems,
        };
      })
    );

    return res.json(ordersWithItems);
  } catch (error) {
    console.error("GET ADMIN ORDERS ERROR:", error);
    return res.status(500).json({
      message: error.message || "Failed to fetch admin orders.",
    });
  }
});

/* PATCH /api/admin/orders/:id/status */
router.patch("/orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required." });
    }

    await pool.query(
      `
      UPDATE orders
      SET order_status = ?
      WHERE id = ?
      `,
      [status, id]
    );

    return res.json({
      success: true,
      message: "Order status updated successfully.",
    });
  } catch (error) {
    console.error("UPDATE ORDER STATUS ERROR:", error);
    return res.status(500).json({
      message: error.message || "Failed to update order status.",
    });
  }
});

/* PATCH /api/admin/orders/:id/finish */
router.patch("/orders/:id/finish", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `
      UPDATE orders
      SET order_status = 'completed', is_archived = 1
      WHERE id = ?
      `,
      [id]
    );

    return res.json({
      success: true,
      message: "Order finished successfully.",
    });
  } catch (error) {
    console.error("FINISH ORDER ERROR:", error);
    return res.status(500).json({
      message: error.message || "Failed to finish order.",
    });
  }
});

/* PATCH /api/admin/orders/:id/archive-cancelled */
router.patch("/orders/:id/archive-cancelled", async (req, res) => {
  try {
    const { id } = req.params;

    const [[order]] = await pool.query(
      `
      SELECT id, order_status, is_archived
      FROM orders
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const status = String(order.order_status || "").toLowerCase().trim();

    if (!["cancelled", "canceled"].includes(status)) {
      return res.status(400).json({
        message: "Only cancelled orders can be archived.",
      });
    }

    await pool.query(
      `
      UPDATE orders
      SET is_archived = 1
      WHERE id = ?
      `,
      [id]
    );

    return res.json({
      success: true,
      message: "Cancelled order archived successfully.",
    });
  } catch (error) {
    console.error("ARCHIVE CANCELLED ORDER ERROR:", error);
    return res.status(500).json({
      message: error.message || "Failed to archive cancelled order.",
    });
  }
});

router.patch("/orders/:id/verify-payment", async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id || null;

    await pool.query(
      `UPDATE orders
       SET payment_status = 'verified',
           payment_verified_by = ?,
           payment_verified_at = NOW()
       WHERE id = ?`,
      [adminId, id]
    );

    return res.json({
      success: true,
      message: "Payment verified successfully.",
    });
  } catch (error) {
    console.error("VERIFY PAYMENT ERROR:", error);
    return res.status(500).json({ message: "Failed to verify payment." });
  }
});

export default router;