import express from "express";
import axios from "axios";
import crypto from "crypto";
import { pool } from "../db.js";

const router = express.Router();

function kobo(amount) {
  return Math.round(Number(amount) * 100);
}

/*
Initialize Paystack payment
*/
router.post("/initialize", async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const {
      items,
      delivery_address,
      phone_number,
      payment_method,
      email,
      note,
      customer_name,
    } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    if (!delivery_address || !phone_number) {
      return res
        .status(400)
        .json({ message: "Address and phone are required" });
    }

    if (!email) {
      return res.status(400).json({ message: "Customer email is required" });
    }

    if (!["card", "bank_transfer"].includes(payment_method)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    await conn.beginTransaction();

    const DELIVERY_FEE = 1500;
    let subtotal = 0;

    for (const item of items) {
      const [[menuItem]] = await conn.query(
        `
        SELECT id, name, price, is_available
        FROM menu
        WHERE id = ?
        LIMIT 1
        `,
        [item.menu_id]
      );

      if (!menuItem || Number(menuItem.is_available) !== 1) {
        await conn.rollback();
        return res.status(400).json({
          message: `${item.name || "Item"} is unavailable`,
        });
      }

      subtotal += Number(menuItem.price) * Number(item.quantity || 1);
    }

    const total = subtotal + DELIVERY_FEE;
    const reference = `NX_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const itemsValue = JSON.stringify(items);

    const [orderResult] = await conn.query(
      `
      INSERT INTO orders
      (
        items,
        total_price,
        order_status,
        payment_status,
        payment_reference,
        payment_method,
        delivery_address,
        customer_phone,
        note,
        created_at
      )
      VALUES (?, ?, 'new', 'pending', ?, ?, ?, ?, ?, NOW())
      `,
      [
        itemsValue,
        total,
        reference,
        payment_method,
        delivery_address,
        phone_number,
        note || null,
      ]
    );

    const orderId = orderResult.insertId;

    for (const item of items) {
      const [[menuItem]] = await conn.query(
        `
        SELECT id, name, price
        FROM menu
        WHERE id = ?
        LIMIT 1
        `,
        [item.menu_id]
      );

      const qty = Number(item.quantity || 1);
      const itemSubtotal = Number(menuItem.price) * qty;

      await conn.query(
        `
        INSERT INTO order_items
        (order_id, menu_id, item_name, unit_price, quantity, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          orderId,
          menuItem.id,
          menuItem.name,
          menuItem.price,
          qty,
          itemSubtotal,
        ]
      );
    }

    await conn.commit();

    if (payment_method === "bank_transfer") {
      return res.json({
        success: true,
        order_id: orderId,
        reference,
        subtotal,
        delivery_fee: DELIVERY_FEE,
        total,
        bank: {
          account_name:
            process.env.RESTAURANT_ACCOUNT_NAME || "Nexus Restaurant",
          bank_name: process.env.RESTAURANT_BANK_NAME || "OPay",
          account_number:
            process.env.RESTAURANT_ACCOUNT_NUMBER || "1234567890",
        },
      });
    }

    const paystack = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: kobo(total),
        reference,
        callback_url: `${process.env.CLIENT_URL}/order-success/${orderId}`,
        metadata: {
          order_id: orderId,
          customer_name: customer_name || "",
          subtotal,
          delivery_fee: DELIVERY_FEE,
          total,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({
      success: true,
      order_id: orderId,
      subtotal,
      delivery_fee: DELIVERY_FEE,
      total,
      reference,
      authorization_url: paystack.data.data.authorization_url,
      access_code: paystack.data.data.access_code,
    });
  } catch (err) {
    await conn.rollback();
    console.error("PAY INIT ERROR:", err?.response?.data || err);
    return res.status(500).json({ message: "Payment initialization failed" });
  } finally {
    conn.release();
  }
});

router.post("/webhook", async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;

    if (event.event === "charge.success") {
      const reference = event.data.reference;
      const amount = Number(event.data.amount) / 100;

      const [orders] = await pool.query(
        "SELECT * FROM orders WHERE payment_reference = ? LIMIT 1",
        [reference]
      );

      if (orders.length > 0) {
        const order = orders[0];

        await pool.query(
          `
          UPDATE orders
          SET payment_status = 'Paid',
              order_status = 'Confirmed',
              paid_amount = ?,
              payment_verified_at = NOW()
          WHERE id = ?
          `,
          [amount, order.id]
        );

        const [orderItems] = await pool.query(
          `
          SELECT menu_id, quantity
          FROM order_items
          WHERE order_id = ?
          `,
          [order.id]
        );

        for (const item of orderItems) {
          await pool.query(
            `
            UPDATE inventory
            SET quantity = quantity - ?
            WHERE menu_id = ?
            `,
            [item.quantity, item.menu_id]
          );
        }

        console.log("✅ Payment verified and order updated");
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    return res.sendStatus(500);
  }
});

export default router;