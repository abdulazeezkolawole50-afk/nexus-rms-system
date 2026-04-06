// server/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

dotenv.config();

import authRoutes from "./routes/auth.js";
import menuRoutes from "./routes/menu.js";
import userRoutes from "./routes/user.js";
import dashboardRoutes from "./routes/dashboard.js";
import ordersRoutes from "./routes/orders.js";
import paymentRoutes from "./routes/payment.routes.js";
import supportRoutes from "./routes/support.js";

import paymentWebhook from "./routes/payment.webhook.js";
import adminDashboardRoutes from "./routes/admin.dashboard.js";
import adminRoutes from "./routes/admin.js";
import adminMenuRoutes from "./routes/admin.menu.js";
import adminOrdersRoutes from "./routes/admin.orders.js";
import adminInventoryRoutes from "./routes/admin.inventory.js";

import customerAuthRoutes from "./routes/customer.auth.js";
import customerMenuRoutes from "./routes/customer.menu.js";
import customerOrderRoutes from "./routes/customer.orders.js";
import customerProfileRoutes from "./routes/customer.profile.js";

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.get("/", (_req, res) => res.send("API OK"));

app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/user", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/payment", paymentWebhook);
app.use("/api/support", supportRoutes);

app.use("/api/customer/auth", customerAuthRoutes);
app.use("/api/customer/menu", customerMenuRoutes);
app.use("/api/customer/orders", customerOrderRoutes);
app.use("/api/customer", customerProfileRoutes);

app.use("/api/admin", adminOrdersRoutes);
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/menu", adminMenuRoutes);
app.use("/api/admin/inventory", adminInventoryRoutes);

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

function extractSocketToken(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (authToken) return authToken;

  const headerToken = socket.handshake?.headers?.authorization;
  if (headerToken?.startsWith("Bearer ")) {
    return headerToken.split(" ")[1];
  }

  return "";
}

function decodeSocketUser(socket) {
  try {
    const token = extractSocketToken(socket);
    if (!token || !process.env.JWT_SECRET) return null;
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function buildAdminNotification(type, payload = {}) {
  return {
    id: `${type}-${payload.orderId || payload.id || Date.now()}-${Date.now()}`,
    type,
    orderId: payload.orderId ? Number(payload.orderId) : null,
    title: payload.title || "Notification",
    message: payload.message || "You have a new notification.",
    meta: payload.meta || null,
    createdAt: payload.createdAt || new Date().toISOString(),
  };
}

/*
  VERY IMPORTANT:
  For now we emit to BOTH:
  1. admins room
  2. all connected sockets (fallback)
  This guarantees the admin dashboard gets it while we finish strict room auth later.
*/
function emitAdminNotification(type, payload = {}) {
  const packet = buildAdminNotification(type, payload);

  io.to("admins").emit("admin:notification", packet);
  io.emit("admin:notification", packet);

  console.log("📣 ADMIN NOTIFICATION EMITTED:", packet);

  return packet;
}

global.io = io;
global.emitAdminNotification = emitAdminNotification;

io.on("connection", (socket) => {
  console.log("⚡ Connected:", socket.id);

  socket.on("join_admin", () => {
    const decoded = decodeSocketUser(socket);

    socket.data.user = decoded || null;
    socket.join("admins");

    console.log("JOIN_ADMIN EVENT RECEIVED FROM:", socket.id);
    console.log("ADMIN JOINED ADMINS ROOM:", socket.id);
    console.log("SOCKET USER:", decoded || "No decoded user");
  });

  socket.on("join_customer", (customerId) => {
    socket.join(`customer_${customerId}`);
    console.log(`CUSTOMER JOINED ROOM customer_${customerId}:`, socket.id);
  });

  socket.on("new_order", (payload = {}) => {
    emitAdminNotification("new_order", payload);
  });

  socket.on("order_cancelled", (payload = {}) => {
    emitAdminNotification("order_cancelled", payload);
  });

  socket.on("report_delay", (payload = {}) => {
    emitAdminNotification("report_delay", payload);
  });

  socket.onAny((event, data) => {
    console.log("📡 EVENT:", event, data);
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log("API running on :" + PORT);
});