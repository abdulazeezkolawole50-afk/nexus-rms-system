import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Menu from "./pages/Menu.jsx";
import Tables from "./pages/Tables.jsx";
import Orders from "./pages/Orders.jsx";

import Navbar from "./components/Navbar.jsx";
import { getToken } from "./lib/api.js";

function Protected({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function Layout({ children }) {
  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 1100, margin: "0 auto" }}>{children}</main>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* default */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route
        path="/dashboard"
        element={
          <Protected>
            <Layout>
              <Dashboard />
            </Layout>
          </Protected>
        }
      />

      <Route
        path="/menu"
        element={
          <Protected>
            <Layout>
              <Menu />
            </Layout>
          </Protected>
        }
      />

      <Route
        path="/tables"
        element={
          <Protected>
            <Layout>
              <Tables />
            </Layout>
          </Protected>
        }
      />

      <Route
        path="/orders"
        element={
          <Protected>
            <Layout>
              <Orders />
            </Layout>
          </Protected>
        }
      />
    </Routes>
  );
}
