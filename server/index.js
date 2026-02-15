import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import authRoutes from "./routes/auth.js";
import menuRoutes from "./routes/menu.js";
import tableRoutes from "./routes/tables.js";
import orderRoutes from "./routes/orders.js";
import dashboardRoutes from "./routes/dashboard.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_, res) => res.json({ ok: true, name: "Nexus RMS API" }));

app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

app.listen(process.env.PORT || 5000, () =>
  console.log(`API running on :${process.env.PORT || 5000}`)
);
