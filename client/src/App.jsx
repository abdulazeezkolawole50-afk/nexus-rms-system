import React from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Menu from "./pages/Menu.jsx";
import Tables from "./pages/Tables.jsx";
import Orders from "./pages/Orders.jsx";
import { getToken } from "./lib/api.js";

function Layout({ children }) {
  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <b>Nexus RMS</b>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/menu">Menu</Link>
        <Link to="/tables">Tables</Link>
        <Link to="/orders">Orders</Link>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => {
              localStorage.removeItem("nexus_token");
              location.href = "/login";
            }}
          >
            Logout
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}

function Protected({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route
        path="/dashboard"
        element={
          <Protected>
            <Layout><Dashboard /></Layout>
          </Protected>
        }
      />
      <Route
        path="/menu"
        element={
          <Protected>
            <Layout><Menu /></Layout>
          </Protected>
        }
      />
      <Route
        path="/tables"
        element={
          <Protected>
            <Layout><Tables /></Layout>
          </Protected>
        }
      />
      <Route
        path="/orders"
        element={
          <Protected>
            <Layout><Orders /></Layout>
          </Protected>
        }
      />
    </Routes>
  );
}
