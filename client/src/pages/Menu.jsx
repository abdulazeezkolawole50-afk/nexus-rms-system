import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

export default function Menu() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // Add form
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [image_url, setImageUrl] = useState("");
  const [is_available, setIsAvailable] = useState(true);
  const [saving, setSaving] = useState(false);

  // UI controls
  const [q, setQ] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all"); // all/available/unavailable
  const [sortBy, setSortBy] = useState("newest"); // newest/priceLow/priceHigh/name

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const data = await api("/api/menu");
      setItems(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let out = [...items];

    // filter by availability
    if (availabilityFilter === "available") out = out.filter((x) => x.is_available === 1);
    if (availabilityFilter === "unavailable") out = out.filter((x) => x.is_available === 0);

    // search
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((x) => (x.name || "").toLowerCase().includes(needle));
    }

    // sort
    if (sortBy === "newest") out.sort((a, b) => (b.id || 0) - (a.id || 0));
    if (sortBy === "priceLow") out.sort((a, b) => Number(a.price) - Number(b.price));
    if (sortBy === "priceHigh") out.sort((a, b) => Number(b.price) - Number(a.price));
    if (sortBy === "name") out.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    return out;
  }, [items, q, availabilityFilter, sortBy]);

  async function addItem(e) {
    e?.preventDefault();
    setErr("");

    if (!name.trim()) return setErr("Menu name is required.");
    if (!price || Number(price) <= 0) return setErr("Price must be greater than 0.");

    setSaving(true);
    try {
      await api("/api/menu", {
        method: "POST",
        body: {
          name: name.trim(),
          price: Number(price),
          image_url: image_url.trim() ? image_url.trim() : null,
          is_available
        }
      });

      setName("");
      setPrice("");
      setImageUrl("");
      setIsAvailable(true);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(id, current) {
    setErr("");
    try {
      await api(`/api/menu/${id}`, {
        method: "PUT",
        body: { is_available: !current }
      });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeItem(id) {
    setErr("");
    const ok = confirm("Delete this menu item?");
    if (!ok) return;

    try {
      await api(`/api/menu/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  const totalCount = items.length;
  const availableCount = items.filter((x) => x.is_available === 1).length;

  return (
    <div className="menuPage">
      <div className="menuBlob menuBlobA" />
      <div className="menuBlob menuBlobB" />

      {/* HERO */}
      <div className="menuHero">
        <div>
          <div className="menuBadge">Nexus RMS</div>
          <h1 className="menuTitle">
            Menu <span>Control</span>
          </h1>
          <p className="menuSub">
            Create, manage, and showcase your restaurant offerings with a clean,
            premium layout. Fast updates. Smooth operations.
          </p>

          <div className="menuKpis">
            <Kpi label="Total Items" value={loading ? "..." : totalCount} />
            <Kpi label="Available" value={loading ? "..." : availableCount} />
            <Kpi
              label="Unavailable"
              value={loading ? "..." : totalCount - availableCount}
            />
          </div>
        </div>

        {/* ADD CARD */}
        <div className="menuAddCard">
          <div className="menuAddTop">
            <div>
              <div className="menuAddTitle">Add Menu Item</div>
              <div className="menuAddSub">Make it irresistible. Price it right.</div>
            </div>
            <div className="pillLive">Live</div>
          </div>

          {err && (
            <div className="menuError">
              <div className="menuErrorDot" />
              <div>{err}</div>
            </div>
          )}

          <form className="menuForm" onSubmit={addItem}>
            <label className="field">
              <span>Item name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jollof Rice + Chicken"
              />
            </label>

            <div className="twoCol">
              <label className="field">
                <span>Price (₦)</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 2500"
                />
              </label>

              <label className="field">
                <span>Availability</span>
                <select
                  value={is_available ? "1" : "0"}
                  onChange={(e) => setIsAvailable(e.target.value === "1")}
                >
                  <option value="1">Available</option>
                  <option value="0">Unavailable</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Image URL (optional)</span>
              <input
                value={image_url}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>

            <button className="menuPrimaryBtn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add Item"}
            </button>
          </form>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="menuToolbar">
        <div className="menuSearch">
          <IconSearch />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search menu items..."
          />
        </div>

        <div className="menuFilters">
          <select value={availabilityFilter} onChange={(e) => setAvailabilityFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="available">Available only</option>
            <option value="unavailable">Unavailable only</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="newest">Sort: Newest</option>
            <option value="name">Sort: Name</option>
            <option value="priceLow">Sort: Price (Low)</option>
            <option value="priceHigh">Sort: Price (High)</option>
          </select>
        </div>
      </div>

      {/* GRID */}
      {loading ? (
        <div className="menuGrid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="menuCard skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="menuEmpty">
          <div className="menuEmptyIcon"><IconMenu /></div>
          <div className="menuEmptyTitle">No items found</div>
          <div className="menuEmptyText">
            Try adjusting filters or add your first menu item above.
          </div>
        </div>
      ) : (
        <div className="menuGrid">
          {filtered.map((it) => (
            <MenuCard
              key={it.id}
              it={it}
              onToggle={() => toggleAvailability(it.id, it.is_available === 1)}
              onDelete={() => removeItem(it.id)}
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

function MenuCard({ it, onToggle, onDelete }) {
  const price = `₦${Number(it.price).toLocaleString()}`;
  const available = it.is_available === 1;

  return (
    <div className={`menuCard ${available ? "" : "muted"}`}>
      <div className="menuCardTop">
        <div className="menuThumb">
          {it.image_url ? (
            <img src={it.image_url} alt={it.name} />
          ) : (
            <div className="menuThumbFallback">
              <IconDish />
            </div>
          )}
        </div>

        <div className="menuStatus">
          <span className={`tag ${available ? "tagOn" : "tagOff"}`}>
            {available ? "Available" : "Unavailable"}
          </span>
        </div>
      </div>

      <div className="menuCardBody">
        <div className="menuName">{it.name}</div>
        <div className="menuPrice">{price}</div>

        <div className="menuActionsRow">
          <button className="toggleBtn" onClick={onToggle}>
            {available ? "Set Unavailable" : "Set Available"}
          </button>
          <button className="dangerBtn" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="menuGlow" />
    </div>
  );
}

/* ---------- icons (no libs) ---------- */

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

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconDish() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 14c0 4 4 7 8 7s8-3 8-7"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6 14a6 6 0 0 1 12 0"
        stroke="currentColor"
        strokeWidth="2"
        opacity=".75"
      />
      <path
        d="M12 3v6"
        stroke="currentColor"
        strokeWidth="2"
        opacity=".5"
      />
    </svg>
  );
}
