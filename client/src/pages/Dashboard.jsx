import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api("/api/dashboard")
      .then((r) => {
        setStats(r);
        setErr("");
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const cards = useMemo(() => {
    const sales = stats?.salesToday ?? 0;
    const open = stats?.openOrders ?? 0;
    const occ = stats?.tablesOccupied ?? 0;

    return [
      {
        title: "Sales Today",
        value: `₦${Number(sales).toLocaleString()}`,
        sub: "Total payments received today",
        icon: <IconMoney />,
        accent: "a"
      },
      {
        title: "Open Orders",
        value: String(open),
        sub: "Orders in open / kitchen / served",
        icon: <IconReceipt />,
        accent: "b"
      },
      {
        title: "Tables Occupied",
        value: String(occ),
        sub: "Tables currently in use",
        icon: <IconTable />,
        accent: "c"
      }
    ];
  }, [stats]);

  if (err) {
    return (
      <div className="dashWrap">
        <div className="dashHero">
          <div className="dashHeroLeft">
            <div className="dashBadge">Nexus RMS</div>
            <h1 className="dashTitle">Dashboard</h1>
            <p className="dashSub">
              Something went wrong while loading your statistics.
            </p>
          </div>
        </div>

        <div className="dashError">
          <div className="dashErrorDot" />
          <div>
            <b>Error:</b> {err}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashPage">
      <div className="dashBlob dashBlobA" />
      <div className="dashBlob dashBlobB" />
      <div className="dashWrap">
        {/* HERO */}
        <div className="dashHero">
          <div className="dashHeroLeft">
            <div className="dashBadge">Nexus RMS</div>
            <h1 className="dashTitle">
              Your Restaurant <span>Overview</span>
            </h1>
            <p className="dashSub">
              Real-time snapshot of sales, orders, and table activity — all in
              one clean view.
            </p>

            <div className="dashActions">
              <a className="dashActionBtn" href="/orders">
                <IconPlus /> New Order
              </a>
              <a className="dashActionBtn ghost" href="/menu">
                <IconMenu /> Add Menu Item
              </a>
              <a className="dashActionBtn ghost" href="/tables">
                <IconGrid /> Manage Tables
              </a>
            </div>
          </div>

          <div className="dashHeroRight">
            <div className="miniPanel">
              <div className="miniTitle">Today</div>
              <div className="miniRow">
                <span className="miniLabel">Sales</span>
                <span className="miniValue">
                  {loading ? "..." : `₦${Number(stats?.salesToday ?? 0).toLocaleString()}`}
                </span>
              </div>
              <div className="miniRow">
                <span className="miniLabel">Open Orders</span>
                <span className="miniValue">{loading ? "..." : stats?.openOrders ?? 0}</span>
              </div>
              <div className="miniRow">
                <span className="miniLabel">Occupied</span>
                <span className="miniValue">{loading ? "..." : stats?.tablesOccupied ?? 0}</span>
              </div>

              <div className="miniHint">
                Tip: Add menu items → create order → mark paid to see stats grow.
              </div>
            </div>
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="dashGrid">
          {cards.map((c) => (
            <StatCard
              key={c.title}
              title={c.title}
              value={loading ? "..." : c.value}
              sub={c.sub}
              icon={c.icon}
              accent={c.accent}
            />
          ))}
        </div>

        {/* LOWER SECTION */}
        <div className="dashLower">
          <div className="panel">
            <div className="panelTop">
              <div>
                <div className="panelTitle">Quick Insights</div>
                <div className="panelSub">
                  A clean view of what to do next to keep operations flowing.
                </div>
              </div>
              <div className="pill">Live</div>
            </div>

            <div className="insights">
              <Insight
                icon={<IconBolt />}
                title="Speed up service"
                text="Move orders to Kitchen → Served quickly to improve turnaround."
              />
              <Insight
                icon={<IconShield />}
                title="Keep it secure"
                text="Managers can add menu items and tables. Cashiers handle orders & payments."
              />
              <Insight
                icon={<IconSpark />}
                title="Grow sales"
                text="Upsell add-ons and drinks. Faster payment = more table rotations."
              />
            </div>
          </div>

          <div className="panel">
            <div className="panelTop">
              <div>
                <div className="panelTitle">Recent Activity</div>
                <div className="panelSub">
                  This can be connected to your orders list next.
                </div>
              </div>
              <a className="linkBtn" href="/orders">
                View Orders →
              </a>
            </div>

            <div className="activityList">
              <Activity
                dot="a"
                title="Create your first order"
                text="Go to Orders → New Order → Add items"
              />
              <Activity
                dot="b"
                title="Mark payment as paid"
                text="Orders → Mark Paid (Cash/POS/Transfer)"
              />
              <Activity
                dot="c"
                title="Add tables for dine-in"
                text="Tables → Add Table (e.g. T1, T2, VIP)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- components ---------- */

function StatCard({ title, value, sub, icon, accent }) {
  return (
    <div className={`statCard accent-${accent}`}>
      <div className="statTop">
        <div className="statIcon">{icon}</div>
        <div className="statMeta">
          <div className="statTitle">{title}</div>
          <div className="statSub">{sub}</div>
        </div>
      </div>
      <div className="statValue">{value}</div>
      <div className="statBar" />
    </div>
  );
}

function Insight({ icon, title, text }) {
  return (
    <div className="insight">
      <div className="insightIcon">{icon}</div>
      <div>
        <div className="insightTitle">{title}</div>
        <div className="insightText">{text}</div>
      </div>
    </div>
  );
}

function Activity({ dot, title, text }) {
  return (
    <div className="activity">
      <div className={`activityDot dot-${dot}`} />
      <div>
        <div className="activityTitle">{title}</div>
        <div className="activityText">{text}</div>
      </div>
    </div>
  );
}

/* ---------- tiny icons (no libs needed) ---------- */

function IconMoney() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16v10H4V7Z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 17c0-2 0-8 0-10" stroke="currentColor" strokeWidth="2" opacity=".5" />
      <path d="M16 17c0-2 0-8 0-10" stroke="currentColor" strokeWidth="2" opacity=".5" />
      <path d="M12 10a2 2 0 1 0 0 4a2 2 0 0 0 0-4Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconReceipt() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1-0 1V3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" opacity=".7" />
    </svg>
  );
}

function IconTable() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 10h16" stroke="currentColor" strokeWidth="2" />
      <path d="M6 10V6h12v4" stroke="currentColor" strokeWidth="2" />
      <path d="M7 10v8M17 10v8" stroke="currentColor" strokeWidth="2" opacity=".7" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" />
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
function IconBolt() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M13 2L3 14h7l-1 8 12-14h-7l-1-6Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l8 4v6c0 6-3.5 9.5-8 10-4.5-.5-8-4-8-10V6l8-4Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9 12l2 2 4-5" stroke="currentColor" strokeWidth="2" opacity=".7" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l1.2 4.2L17 8l-3.8 1.8L12 14l-1.2-4.2L7 8l3.8-1.8L12 2Z" stroke="currentColor" strokeWidth="2" />
      <path d="M5 14l.8 2.6L8 18l-2.2 1.4L5 22l-.8-2.6L2 18l2.2-1.4L5 14Z" stroke="currentColor" strokeWidth="2" opacity=".7" />
    </svg>
  );
}
