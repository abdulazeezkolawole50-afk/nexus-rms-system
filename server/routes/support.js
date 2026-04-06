import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/* -------------------- helpers -------------------- */

function emitLegacyOrderUpdate(payload) {
  try {
    if (global.io) {
      global.io.emit("order_update", payload);
      console.log("🔥 LEGACY order_update EMITTED:", payload);
    }
  } catch (error) {
    console.error("LEGACY ORDER UPDATE EMIT ERROR:", error);
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

/* CUSTOMER: report delay */
router.post("/report-delay", async (req, res) => {
  try {
    const { order_id, message } = req.body;

    if (!order_id) {
      return res.status(400).json({ message: "order_id is required" });
    }

    const [existing] = await pool.query(
      `
      SELECT id
      FROM support_tickets
      WHERE order_id = ? AND issue_type = 'delay' AND status = 'open'
      ORDER BY id DESC
      LIMIT 1
      `,
      [order_id]
    );

    let ticketId = existing[0]?.id || null;

    if (!ticketId) {
      const [ticketResult] = await pool.query(
        `
        INSERT INTO support_tickets
        (
          order_id,
          issue_type,
          subject,
          status,
          priority,
          is_highlighted,
          last_message_at
        )
        VALUES (?, 'delay', ?, 'open', 'high', 1, NOW())
        `,
        [order_id, `Order #${order_id} delay report`]
      );

      ticketId = ticketResult.insertId;
    } else {
      await pool.query(
        `
        UPDATE support_tickets
        SET is_highlighted = 1,
            priority = 'high',
            last_message_at = NOW(),
            updated_at = NOW()
        WHERE id = ?
        `,
        [ticketId]
      );
    }

    const supportMessage =
      message || `Order #${order_id} is delayed. Please check status.`;

    await pool.query(
      `
      INSERT INTO chat_messages
      (
        ticket_id,
        sender_role,
        sender_id,
        message,
        is_read
      )
      VALUES (?, 'customer', NULL, ?, 0)
      `,
      [ticketId, supportMessage]
    );

    emitLegacyOrderUpdate({
      orderId: Number(order_id),
      type: "delay",
    });

    notifyAdmins("report_delay", {
      orderId: Number(order_id),
      title: "Delay Reported",
      message: `Customer reported delay for order #${order_id}.`,
      meta: { ticketId, issue_type: "delay" },
    });

    return res.json({
      success: true,
      message: "Delay reported successfully.",
      ticket_id: ticketId,
    });
  } catch (error) {
    console.error("REPORT DELAY ERROR:", error);
    return res.status(500).json({ message: "Failed to report delay." });
  }
});

/* CUSTOMER: create ticket */
router.post("/tickets", async (req, res) => {
  try {
    const {
      order_id,
      customer_name,
      customer_phone,
      issue_type,
      subject,
      message,
    } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: "Message is required." });
    }

    const [ticketResult] = await pool.query(
      `
      INSERT INTO support_tickets
      (
        order_id,
        customer_id,
        customer_name,
        customer_phone,
        issue_type,
        subject,
        status,
        priority,
        is_highlighted,
        last_message_at
      )
      VALUES (?, NULL, ?, ?, ?, ?, 'open', 'normal', 0, NOW())
      `,
      [
        order_id || null,
        customer_name || null,
        customer_phone || null,
        issue_type || "general",
        subject || "Customer Support",
      ]
    );

    const ticketId = ticketResult.insertId;

    await pool.query(
      `
      INSERT INTO chat_messages
      (
        ticket_id,
        sender_role,
        sender_id,
        message,
        is_read
      )
      VALUES (?, 'customer', NULL, ?, 0)
      `,
      [ticketId, message]
    );

    notifyAdmins("support_message", {
      orderId: order_id ? Number(order_id) : null,
      title: "New Support Ticket",
      message: order_id
        ? `Customer opened support for order #${order_id}.`
        : "Customer opened a new support ticket.",
      meta: { ticketId, issue_type: issue_type || "general" },
    });

    return res.json({
      success: true,
      ticket_id: ticketId,
      message: "Support ticket created successfully.",
    });
  } catch (error) {
    console.error("CREATE SUPPORT TICKET ERROR:", error);
    return res.status(500).json({ message: "Failed to create support ticket." });
  }
});

/* CUSTOMER + ADMIN: get tickets */
router.get("/tickets", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        id,
        order_id,
        customer_id,
        customer_name,
        customer_phone,
        subject,
        issue_type,
        status,
        priority,
        is_highlighted,
        last_message_at,
        created_at,
        updated_at
      FROM support_tickets
      ORDER BY is_highlighted DESC, last_message_at DESC, id DESC
      `
    );

    return res.json(rows);
  } catch (error) {
    console.error("GET SUPPORT TICKETS ERROR:", error);
    return res.status(500).json({ message: "Failed to fetch support tickets." });
  }
});

/* CUSTOMER + ADMIN: get messages */
router.get("/tickets/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        id,
        ticket_id,
        sender_role,
        sender_id,
        message,
        is_read,
        created_at
      FROM chat_messages
      WHERE ticket_id = ?
      ORDER BY id ASC
      `,
      [id]
    );

    return res.json(rows);
  } catch (error) {
    console.error("GET CHAT MESSAGES ERROR:", error);
    return res.status(500).json({ message: "Failed to fetch messages." });
  }
});

/* CUSTOMER + ADMIN: send message */
router.post("/tickets/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const { sender_role, sender_id, message } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: "Message is required." });
    }

    const role = sender_role === "admin" ? "admin" : "customer";

    await pool.query(
      `
      INSERT INTO chat_messages
      (
        ticket_id,
        sender_role,
        sender_id,
        message,
        is_read
      )
      VALUES (?, ?, ?, ?, 0)
      `,
      [id, role, sender_id || null, message]
    );

    await pool.query(
      `
      UPDATE support_tickets
      SET last_message_at = NOW(),
          updated_at = NOW()
      WHERE id = ?
      `,
      [id]
    );

    const [[ticket]] = await pool.query(
      `
      SELECT order_id
      FROM support_tickets
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (role === "customer") {
      notifyAdmins("support_message", {
        orderId: ticket?.order_id ? Number(ticket.order_id) : null,
        title: "New Support Message",
        message: ticket?.order_id
          ? `Customer sent a new support message for order #${ticket.order_id}.`
          : "Customer sent a new support message.",
        meta: { ticketId: Number(id) },
      });
    }

    return res.json({
      success: true,
      message: "Message sent successfully.",
    });
  } catch (error) {
    console.error("SEND CHAT MESSAGE ERROR:", error);
    return res.status(500).json({ message: "Failed to send message." });
  }
});

/* ADMIN: mark ticket as resolved */
router.patch("/tickets/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required." });
    }

    await pool.query(
      `
      UPDATE support_tickets
      SET status = ?,
          is_highlighted = CASE WHEN ? = 'resolved' THEN 0 ELSE is_highlighted END,
          updated_at = NOW()
      WHERE id = ?
      `,
      [status, status, id]
    );

    return res.json({
      success: true,
      message: "Ticket status updated successfully.",
    });
  } catch (error) {
    console.error("UPDATE SUPPORT TICKET STATUS ERROR:", error);
    return res.status(500).json({ message: "Failed to update ticket status." });
  }
});

export default router;