import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

export default function Tables() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // add form
  const [label, setLabel] = useState("");
  const [capacity, setCapacity] = useState(2);
  const [status, setStatus] = useState("free");
  const [saving, setSaving] = useState(false);

  // UI controls
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all/free/occupied/reserved
  const [sort, setSort] = useState("newest"); // newest/label/capHigh/capLow

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const data = await api("/api/tables");
      setRows(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const free = rows.filter((t) => t.status === "free").length;
    const occupied = rows.filter((t) => t.status === "occupied").length;
    const reserved = rows.filter((t) => t.status === "reserved").length;
    return { total, free, occupied, reserved };
  }, [rows]);

  const filtered = useMemo(() => {
    let out = [...rows];

    if (filter !== "all") out = out.filter((t) => t.status === filter);

    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((t) => String(t.label || "").toLowerCase().includes(needle));
    }

    if (sort === "newest") out.sort((a, b) => (b.id || 0) - (a.id || 0));
    if (sort === "label") out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    if (sort === "capHigh") out.sort((a, b) => Number(b.capacity) - Number(a.capacity));
    if (sort === "capLow") out.sort((a, b) => Number(a.capacity) - Number(b.capacity));

    return out;
  }, [rows, q, filter, sort]);

  async function addTable(e) {
    e?.preventDefault();
    setErr("");

    if (!label.trim()) return setErr("Table label is required (e.g. T1, VIP-1).");
    if (!capacity || Number(capacity) <= 0) return setErr("Capacity must be greater than 0.");

    setSaving(true);
    try {
      await api("/api/tables", {
        method: "POST",
        body: { label: label.trim(), capacity: Number(capacity), status }
      });

      setLabel("");
      setCapacity(2);
      setStatus("free");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function setTableStatus(id, newStatus) {
    setErr("");
    try {
      await api(`/api/tables/${id}`, { method: "PUT", body: { status: newStatus } });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeTable(id) {
    setErr("");
    const ok = confirm("Delete this table?");
    if (!ok) return;

    try {
      await api(`/api/tables/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="tablesPage">
      <div className="tablesBlob tablesBlobA" />
      <div className="tablesBlob tablesBlobB" />

      {/* HERO */}
      <div className="tablesHero">
        <div>
          <div className="tablesBadge">Nexus RMS</div>
          <h1 className="tablesTitle">
            Tables <span>Floor Control</span>
          </h1>
          <p className="tablesSub">
            Manage seating like a pro. Switch table status in seconds and keep service flowing.
          </p>

          <div className="tablesKpis">
            <Kpi label="Total" value={loading ? "..." : stats.total} />
            <Kpi label="Free" value={loading ? "..." : stats.free} />
            <Kpi label="Occupied" value={loading ? "..." : stats.occupied} />
            <Kpi label="Reserved" value={loading ? "..." : stats.reserved} />
          </div>
        </div>

        {/* ADD CARD */}
        <div className="tablesAddCard">
          <div className="tablesAddTop">
            <div>
              <div className="tablesAddTitle">Add Table</div>
              <div className="tablesAddSub">Create labels like T1, T2, VIP-1, Outdoor-3</div>
            </div>
            <div className="pillLive">Live</div>
          </div>

          {err && (
            <div className="tablesError">
              <div className="tablesErrorDot" />
              <div>{err}</div>
            </div>
          )}

          <form className="tablesForm" onSubmit={addTable}>
            <label className="field">
              <span>Label</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. T1"
              />
            </label>

            <div className="twoCol">
              <label className="field">
                <span>Capacity</span>
                <input
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  placeholder="2"
                />
              </label>

              <label className="field">
                <span>Starting status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="free">Free</option>
                  <option value="occupied">Occupied</option>
                  <option value="reserved">Reserved</option>
                </select>
              </label>
            </div>

            <button className="tablesPrimaryBtn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add Table"}
            </button>
          </form>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="tablesToolbar">
        <div className="tablesSearch">
          <IconSearch />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search table label..."
          />
        </div>

        <div className="tablesFilters">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="free">Free</option>
            <option value="occupied">Occupied</option>
            <option value="reserved">Reserved</option>
          </select>

          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Sort: Newest</option>
            <option value="label">Sort: Label</option>
            <option value="capHigh">Sort: Capacity (High)</option>
            <option value="capLow">Sort: Capacity (Low)</option>
          </select>
        </div>
      </div>

      {/* GRID */}
      {loading ? (
        <div className="tablesGrid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="tableCard skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="tablesEmpty">
          <div className="tablesEmptyIcon"><IconGrid /></div>
          <div className="tablesEmptyTitle">No tables found</div>
          <div className="tablesEmptyText">Try adjusting filters or add your first table above.</div>
        </div>
      ) : (
        <div className="tablesGrid">
          {filtered.map((t) => (
            <TableCard
              key={t.id}
              t={t}
              onSetStatus={(s) => setTableStatus(t.id, s)}
              onDelete={() => removeTable(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- small components ---------- */

function Kpi({ label, value }) {
  return (
    <div className="kpi">
      <div className="kpiLabel">{label}</div>
      <div className="kpiValue">{value}</div>
    </div>
  );
}

function TableCard({ t, onSetStatus, onDelete }) {
  const status = t.status || "free";

  return (
    <div className={`tableCard status-${status}`}>
      <div className="tableTop">
        <div className="tableIcon">
          <IconTable />
        </div>
        <div className="tableMeta">
          <div className="tableLabel">{t.label}</div>
          <div className="tableCap">Capacity: <b>{t.capacity}</b></div>
        </div>

        <span className={`tableTag tag-${status}`}>
          {status.toUpperCase()}
        </span>
      </div>

      <div className="tableActions">
        <button
          className={`chip ${status === "free" ? "active" : ""}`}
          onClick={() => onSetStatus("free")}
        >
          Free
        </button>
        <button
          className={`chip ${status === "occupied" ? "active" : ""}`}
          onClick={() => onSetStatus("occupied")}
        >
          Occupied
        </button>
        <button
          className={`chip ${status === "reserved" ? "active" : ""}`}
          onClick={() => onSetStatus("reserved")}
        >
          Reserved
        </button>

        <button className="dangerChip" onClick={onDelete}>
          Delete
        </button>
      </div>

      <div className="tableGlow" />
    </div>
  );
}

/* ---------- icons ---------- */

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15a7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16.5 16.5L21 21"
        stroke="currentColor"
        strokeWidth="2"
        opacity=".8"
      />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" stroke="currentColor" strokeWidth="2" />
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
