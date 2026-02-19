import React, { useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const { pathname } = useLocation();

  // Hide navbar on auth routes (edit if your routes differ)
  const hide = useMemo(() => {
    return pathname === "/login" || pathname === "/register" || pathname === "/";
  }, [pathname]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setOpen(false);
    nav("/login");
  }

  if (hide) return null;

  return (
    <header className="nxNav">
      <div className="nxNavInner">
        {/* LEFT: Brand */}
        <div className="nxBrand" onClick={() => nav("/dashboard")} role="button" tabIndex={0}>
          <div className="nxLogo">
            <span className="nxDot" />
          </div>
          <div className="nxBrandText">
            <div className="nxBrandTop">
              Nexus <span>RMS</span>
            </div>
            <div className="nxBrandSub">Restaurant Management</div>
          </div>
        </div>

        {/* CENTER: Links (desktop) */}
        <nav className="nxLinks" aria-label="Primary">
          <NavItem to="/dashboard" label="Dashboard" icon={<IconHome />} />
          <NavItem to="/menu" label="Menu" icon={<IconMenu />} />
          <NavItem to="/tables" label="Tables" icon={<IconGrid />} />
          <NavItem to="/orders" label="Orders" icon={<IconReceipt />} />
        </nav>

        {/* RIGHT: Actions */}
        <div className="nxActions">
          <button
            className="nxQuickBtn"
            onClick={() => nav("/orders")}
            title="Go to Orders"
            type="button"
          >
            <IconSpark />
            Quick POS
          </button>

          <button className="nxLogout" onClick={logout} type="button" title="Logout">
            <IconLogout />
          </button>

          {/* Mobile toggle */}
          <button
            className="nxBurger"
            onClick={() => setOpen((s) => !s)}
            type="button"
            aria-label="Open menu"
          >
            {open ? <IconClose /> : <IconBurger />}
          </button>
        </div>
      </div>

      {/* MOBILE DRAWER */}
      <div className={`nxMobile ${open ? "open" : ""}`}>
        <div className="nxMobileCard">
          <div className="nxMobileTop">
            <div className="nxMobileTitle">Navigate</div>
            <button className="nxIconBtn" onClick={() => setOpen(false)} type="button">
              <IconClose />
            </button>
          </div>

          <div className="nxMobileLinks">
            <MobileLink to="/dashboard" label="Dashboard" icon={<IconHome />} onGo={() => setOpen(false)} />
            <MobileLink to="/menu" label="Menu" icon={<IconMenu />} onGo={() => setOpen(false)} />
            <MobileLink to="/tables" label="Tables" icon={<IconGrid />} onGo={() => setOpen(false)} />
            <MobileLink to="/orders" label="Orders" icon={<IconReceipt />} onGo={() => setOpen(false)} />
          </div>

          <div className="nxMobileActions">
            <button className="nxPrimaryMobile" onClick={() => { setOpen(false); nav("/orders"); }} type="button">
              <IconSpark /> Quick POS
            </button>
            <button className="nxDangerMobile" onClick={logout} type="button">
              <IconLogout /> Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nxLink ${isActive ? "active" : ""}`}
      end
    >
      <span className="nxLinkIcon">{icon}</span>
      <span className="nxLinkText">{label}</span>
    </NavLink>
  );
}

function MobileLink({ to, label, icon, onGo }) {
  return (
    <NavLink
      to={to}
      onClick={onGo}
      className={({ isActive }) => `nxMobileLink ${isActive ? "active" : ""}`}
      end
    >
      <span className="nxMobileIcon">{icon}</span>
      <span className="nxMobileText">{label}</span>
      <span className="nxMobileChevron">›</span>
    </NavLink>
  );
}

/* ---------- tiny inline icons ---------- */
function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconReceipt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1 0 1V3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" opacity=".7" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l1.2 4.2L17 8l-3.8 1.8L12 14l-1.2-4.2L7 8l3.8-1.8L12 2Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M10 17l-1 0a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4h1" stroke="currentColor" strokeWidth="2"/>
      <path d="M15 12H8" stroke="currentColor" strokeWidth="2"/>
      <path d="M15 12l-3-3M15 12l-3 3" stroke="currentColor" strokeWidth="2"/>
      <path d="M19 4h-5v16h5" stroke="currentColor" strokeWidth="2" opacity=".7"/>
    </svg>
  );
}
function IconBurger() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
