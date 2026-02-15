import React, { useMemo, useState } from "react";
import { api } from "../lib/api.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // login/register
  const [name, setName] = useState("");
  const [role, setRole] = useState("cashier");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const subtitle = useMemo(() => {
    return mode === "login"
      ? "Welcome back. Login to manage orders, tables, and payments."
      : "Create a secure account to start managing your restaurant operations.";
  }, [mode]);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      if (mode === "register") {
        await api("/api/auth/register", {
          method: "POST",
          body: { full_name: name, email, password, role }
        });
      }

      const r = await api("/api/auth/login", {
        method: "POST",
        body: { email, password }
      });

      localStorage.setItem("nexus_token", r.token);
      location.href = "/dashboard";
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authPage">
      {/* animated background blobs */}
      <div className="blob blobA" />
      <div className="blob blobB" />
      <div className="blob blobC" />

      <div className="authWrap">
        {/* left brand panel */}
        <div className="brandPanel">
          <div className="brandBadge">Nexus RMS</div>

          <h1 className="brandTitle">
            Restaurant <span>Management</span>
          </h1>

          <p className="brandText">
            Run your restaurant like a pro — manage <b>menu</b>, <b>tables</b>,
            <b> orders</b> and <b>payments</b> in one place.
          </p>

          <div className="brandStats">
            <div className="stat">
              <div className="statNum">Fast</div>
              <div className="statLabel">Order processing</div>
            </div>
            <div className="stat">
              <div className="statNum">Secure</div>
              <div className="statLabel">JWT authentication</div>
            </div>
            <div className="stat">
              <div className="statNum">Simple</div>
              <div className="statLabel">Clean dashboard</div>
            </div>
          </div>

          <div className="brandFooter">
            <div className="tiny">© {new Date().getFullYear()} Nexus RMS</div>
          </div>
        </div>

        {/* right form card */}
        <div className="authCard">
          <div className="authHeader">
            <h2 className="authTitle">
              {mode === "login" ? "Welcome back 👋" : "Create your account ✨"}
            </h2>
            <p className="authSub">{subtitle}</p>
          </div>

          {err && (
            <div className="authError">
              <div className="authErrorDot" />
              <div>{err}</div>
            </div>
          )}

          <form onSubmit={submit} className="authForm">
            {mode === "register" && (
              <>
                <label className="field">
                  <span>Full name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Abdulazeez Kolawole"
                    autoComplete="name"
                  />
                </label>

                <label className="field">
                  <span>Role</span>
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                  </select>
                </label>
              </>
            )}

            <label className="field">
              <span>Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@gmail.com"
                type="email"
                autoComplete="email"
              />
            </label>

            <label className="field">
              <span>Password</span>
              <div className="pwdRow">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  type={showPwd ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  className="ghostBtn"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label="Toggle password visibility"
                >
                  {showPwd ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button className="primaryBtn" type="submit" disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
            </button>

            <button
              className="secondaryBtn"
              type="button"
              onClick={() => {
                setErr("");
                setMode(mode === "login" ? "register" : "login");
              }}
              disabled={loading}
            >
              {mode === "login"
                ? "Need an account? Register"
                : "Already have an account? Login"}
            </button>

            <div className="tinyHint">
              By continuing, you agree to basic usage and security policies.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
