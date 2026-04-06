import express from "express";
import crypto from "crypto";
import axios from "axios";
import { pool } from "../db.js";

const router = express.Router();

router.post("/webhook", express.json({verify:(req,res,buf)=>{
  req.rawBody = buf
}}), async (req,res)=>{

  try{

    const signature = req.headers["x-paystack-signature"];

    const hash = crypto
      .createHmac("sha512",process.env.PAYSTACK_SECRET_KEY)
      .update(req.rawBody)
      .digest("hex");

    if(hash !== signature){
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    if(event.event !== "charge.success"){
      return res.sendStatus(200);
    }

    const reference = event.data.reference;

    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers:{
          Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const payment = verify.data.data;

    const [[order]] = await pool.query(
      `SELECT id,total_price FROM orders WHERE payment_reference=? LIMIT 1`,
      [reference]
    );

    if(!order){
      return res.sendStatus(200);
    }

    const expected = Math.round(order.total_price * 100);

    if(payment.amount !== expected){
      console.error("Amount mismatch");
      return res.sendStatus(400);
    }

    const conn = await pool.getConnection();

    try{

      await conn.beginTransaction();

      await conn.query(
        `UPDATE orders
         SET payment_status='paid',
             order_status='confirmed',
             paid_amount=?,
             payment_verified_at=NOW()
         WHERE id=?`,
        [payment.amount/100, order.id]
      );

      const [items] = await conn.query(
        `SELECT menu_id,quantity FROM order_items WHERE order_id=?`,
        [order.id]
      );

      for(const item of items){
        await conn.query(
          `UPDATE inventory
           SET quantity=quantity-?
           WHERE menu_id=?`,
          [item.quantity,item.menu_id]
        );
      }

      await conn.commit();

    }catch(e){
      await conn.rollback();
      throw e;
    }finally{
      conn.release();
    }

    res.sendStatus(200);

  }catch(err){
    console.error("WEBHOOK ERROR:",err);
    res.sendStatus(500);
  }

});

export default router;