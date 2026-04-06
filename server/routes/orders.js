import express from "express";
import { pool } from "../db.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const paymentStorage = multer.diskStorage({
  destination: path.join(__dirname, "../uploads"),
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`);
  },
});

const uploadProof = multer({ storage: paymentStorage });
const router = express.Router();

/* -------------------- helpers -------------------- */

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      menu_id: Number(item.menu_id || item.id || 0),
      name: String(item.name || item.item_name || "").trim(),
      price: Number(item.price || item.unit_price || 0),
      quantity: Number(item.quantity || item.qty || 0),
    }))
    .filter((item) => item.name && item.quantity > 0);
}

async function getEstimatedReadyMins(conn) {
  const [rows] = await conn.query(
    `
    SELECT COUNT(*) AS activeCount
    FROM orders
    WHERE is_archived = 0
      AND order_status IN ('new', 'preparing', 'ready')
    `
  );

  const activeCount = Number(rows?.[0]?.activeCount || 0);
  return Math.max(15, Math.min(60, 10 + activeCount * 5));
}

async function deductInventory(conn, cartItems) {
  for (const item of cartItems) {
    const orderedQty = Number(item.quantity || 0);
    if (orderedQty <= 0) continue;

    const [rows] = await conn.query(
      `
      SELECT id, item_name, current_stock
      FROM inventory
      WHERE LOWER(item_name) = LOWER(?)
      LIMIT 1
      `,
      [item.name]
    );

    if (!rows.length) continue;

    const stockRow = rows[0];
    const currentStock = Number(stockRow.current_stock || 0);

    if (orderedQty > currentStock) {
      throw new Error(`${item.name} only has ${currentStock} left in stock.`);
    }

    await conn.query(
      `
      UPDATE inventory
      SET current_stock = current_stock - ?
      WHERE id = ?
      `,
      [orderedQty, stockRow.id]
    );
  }
}

function formatOrderResponse(row) {
  return {
    ...row,
    items:
      typeof row.items === "string" ? safeJsonParse(row.items, row.items) : row.items,
    notes:
      typeof row.notes === "string" ? safeJsonParse(row.notes, row.notes) : row.notes,
  };
}

function emitOrderUpdate(payload) {
  try {
    if (global.io) {
      global.io.emit("order_update", payload);
      console.log("🔥 EMITTED order_update:", payload);
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

/* -------------------- GET all orders -------------------- */

router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
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
      `
    );

    return res.json(rows.map(formatOrderResponse));
  } catch (error) {
    console.error("GET /api/orders error:", error);
    return res.status(500).json({ message: "Failed to fetch orders." });
  }
});

/* -------------------- POST generic order -------------------- */

router.post("/", async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const {
      items = [],
      totalPrice = 0,
      status = "new",
      notes = "",
      customer_id = null,
      delivery_address = null,
      customer_phone = null,
      payment_status = "pending",
      payment_reference = null,
    } = req.body;

    const normalizedItems = normalizeItems(items);

    if (!normalizedItems.length) {
      return res.status(400).json({ message: "Order items are required." });
    }

    const estimatedReadyMins = await getEstimatedReadyMins(conn);

    await conn.beginTransaction();

    await deductInventory(conn, normalizedItems);

    const [result] = await conn.query(
      `
      INSERT INTO orders
      (
        items,
        total_price,
        order_status,
        notes,
        customer_id,
        delivery_address,
        customer_phone,
        payment_status,
        payment_reference,
        estimated_ready_mins
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        JSON.stringify(normalizedItems),
        Number(totalPrice || 0),
        String(status || "new"),
        typeof notes === "string" ? notes : JSON.stringify(notes),
        customer_id || null,
        delivery_address || null,
        customer_phone || null,
        payment_status || "pending",
        payment_reference || null,
        estimatedReadyMins,
      ]
    );

    await conn.commit();

    emitOrderUpdate({
      orderId: Number(result.insertId),
      type: "new_order",
    });

    notifyAdmins("new_order", {
      orderId: Number(result.insertId),
      title: "New Order",
      message: `A new order #${result.insertId} has arrived.`,
    });

    return res.status(201).json({
      success: true,
      message: "Order created successfully.",
      orderId: result.insertId,
    });
  } catch (error) {
    await conn.rollback();
    console.error("POST /api/orders error:", error);
    return res.status(500).json({
      message: error.message || "Failed to create order.",
    });
  } finally {
    conn.release();
  }
});

/* -------------------- POST checkout place order -------------------- */

router.post("/place", async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const {
      cartItems = [],
      subtotal = 0,
      deliveryFee = 0,
      totalAmount = 0,
      deliveryAddress = {},
      customer_id = null,
      payment_reference = null,
    } = req.body;

    const normalizedItems = normalizeItems(cartItems);

    if (!normalizedItems.length) {
      return res.status(400).json({ message: "Cart is empty." });
    }

    if (!String(deliveryAddress?.address || "").trim()) {
      return res.status(400).json({ message: "Delivery address is required." });
    }

    const estimatedReadyMins = await getEstimatedReadyMins(conn);

    await conn.beginTransaction();

    await deductInventory(conn, normalizedItems);

    const orderNotes = {
      full_name: String(deliveryAddress?.full_name || "").trim(),
      phone: String(deliveryAddress?.phone || "").trim(),
      address: String(deliveryAddress?.address || "").trim(),
      note: String(deliveryAddress?.note || "").trim(),
      subtotal: Number(subtotal || 0),
      deliveryFee: Number(deliveryFee || 0),
    };

    const [result] = await conn.query(
      `
      INSERT INTO orders
      (
        items,
        total_price,
        order_status,
        notes,
        customer_id,
        delivery_address,
        customer_phone,
        payment_status,
        payment_reference,
        estimated_ready_mins
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        JSON.stringify(normalizedItems),
        Number(totalAmount || 0),
        "new",
        JSON.stringify(orderNotes),
        customer_id || null,
        String(deliveryAddress?.address || "").trim(),
        String(deliveryAddress?.phone || "").trim(),
        "pending",
        payment_reference || null,
        estimatedReadyMins,
      ]
    );

    await conn.commit();

    emitOrderUpdate({
      orderId: Number(result.insertId),
      type: "new_order",
    });

    notifyAdmins("new_order", {
      orderId: Number(result.insertId),
      title: "New Order",
      message: `A new order #${result.insertId} has arrived.`,
    });

    return res.status(201).json({
      success: true,
      message: "Order placed successfully.",
      orderId: result.insertId,
    });
  } catch (error) {
    await conn.rollback();
    console.error("PLACE ORDER ERROR:", error);
    return res.status(500).json({
      message: error.message || "Failed to place order.",
    });
  } finally {
    conn.release();
  }
});

router.post("/payment-proof/:orderId", uploadProof.single("receipt"), async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "Receipt file is required." });
    }

    const filePath = `/uploads/${req.file.filename}`;

    await pool.query(
      `UPDATE orders
       SET payment_proof_url = ?, payment_status = 'submitted'
       WHERE id = ?`,
      [filePath, orderId]
    );

    return res.json({
      success: true,
      message: "Payment proof uploaded successfully.",
      payment_proof_url: filePath,
    });
  } catch (error) {
    console.error("PAYMENT PROOF ERROR:", error);
    return res.status(500).json({ message: "Failed to upload payment proof." });
  }
});

export default router;