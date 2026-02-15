import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);

  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // add item controls
  const [menuItemId, setMenuItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [addingItem, setAddingItem] = useState(false);

  // pay controls
  const [paying, setPaying] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [receiptNo, setReceiptNo] = useState("");
  const [amountOverride, setAmountOverride] = useState("");

  // list controls
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all/open/kitchen/served/closed/cancelled

  async function loadAll() {
    setErr("");
    setLoading(true);
    try {
      const [o, m] = await Promise.all([api("/api/orders"), api("/api/menu")]);
      setOrders(Array.isArray(o) ? o : []);
      setMenu(Array.isArray(m) ? m : []);
    } catch (e) {
      setErr(e?.message || "Failed to load orders/menu");
    } finally {
      setLoading(false);
    }
  }

  async function openOrder(id) {
    setErr("");
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const d = await api(`/api/orders/${id}`);
      setDetails(d);
    } catch (e) {
      setErr(e?.message || "Failed to open order");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const filteredOrders = useMemo(() => {
    let out = [...orders];

    if (statusFilter !== "all") out = out.filter((o) => o.status === statusFilter);

    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((o) => {
        const id = String(o?.id ?? "");
        const status = String(o?.status || "");
        const table = String(o?.table_label || "");
        return (
          id.includes(needle) ||
          status.toLowerCase().includes(needle) ||
          table.toLowerCase().includes(needle)
        );
      });
    }

    return out;
  }, [orders, q, statusFilter]);

  const kpis = useMemo(() => {
    const total = orders.length;
    const open = orders.filter((o) => ["open", "kitchen", "served"].includes(o.status)).length;
    const closed = orders.filter((o) => o.status === "closed").length;
    const todaySales = orders
      .filter((o) => o.status === "closed")
      .reduce((s, o) => s + Number(o.total || 0), 0);

    return {
      total,
      open,
      closed,
      todaySales
    };
  }, [orders]);

  async function createOrder() {
    setErr("");
    try {
      const r = await api("/api/orders", { method: "POST", body: { table_id: null } });
      await loadAll();
      await openOrder(r.id);
    } catch (e) {
      setErr(e?.message || "Failed to create order");
    }
  }

  async function addItem() {
    if (!details?.order?.id) return;
    if (!menuItemId) return;

    setErr("");
    setAddingItem(true);
    try {
      await api(`/api/orders/${details.order.id}/items`, {
        method: "POST",
        body: { menu_item_id: Number(menuItemId), qty: Number(qty) }
      });
      setMenuItemId("");
      setQty(1);
      await openOrder(details.order.id);
      await loadAll();
    } catch (e) {
      setErr(e?.message || "Failed to add item");
    } finally {
      setAddingItem(false);
    }
  }

  async function setStatus(newStatus) {
    if (!details?.order?.id) return;
    setErr("");
    try {
      await api(`/api/orders/${details.order.id}/status`, {
        method: "PUT",
        body: { status: newStatus }
      });
      await openOrder(details.order.id);
      await loadAll();
    } catch (e) {
      setErr(e?.message || "Failed to update status");
    }
  }

  async function markPaid() {
    if (!details?.order?.id) return;

    setErr("");
    setPaying(true);
    try {
      const amount = amountOverride ? Number(amountOverride) : Number(details.order.total);
      const rec = receiptNo?.trim() || `R-${Date.now()}`;

      await api(`/api/orders/${details.order.id}/pay`, {
        method: "POST",
        body: { method: payMethod, amount, receipt_no: rec }
      });

      setReceiptNo("");
      setAmountOverride("");
      await openOrder(details.order.id);
      await loadAll();
    } catch (e) {
      setErr(e?.message || "Failed to mark paid");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="ordersPage">
      <div className="ordersBlob ordersBlobA" />
      <div className="ordersBlob ordersBlobB" />

      {/* HERO */}
      <div className="ordersHero">
        <div>
          <div className="ordersBadge">Nexus RMS</div>
          <h1 className="ordersTitle">
            Orders <span>POS Control</span>
          </h1>
          <p className="ordersSub">
            Create orders, add items, update kitchen status, and close payments — fast and clean.
          </p>

          <div className="ordersKpis">
            <Kpi label="Total Orders" value={loading ? "..." : kpis.total} />
            <Kpi label="Open" value={loading ? "..." : kpis.open} />
            <Kpi label="Closed" value={loading ? "..." : kpis.closed} />
            <Kpi
              label="Sales (Closed)"
              value={loading ? "..." : `₦${Number(kpis.todaySales).toLocaleString()}`}
            />
          </div>
        </div>

        <div className="ordersHeroCard">
          <div className="heroCardTop">
            <div>
              <div className="heroCardTitle">Quick Actions</div>
              <div className="heroCardSub">One click to start selling.</div>
            </div>
            <div className="pillLive">Live</div>
          </div>

          {err && (
            <div className="ordersError">
              <div className="ordersErrorDot" />
              <div>{err}</div>
            </div>
          )}

          <div className="heroBtns">
            <button className="ordersPrimaryBtn" onClick={createOrder} disabled={loading}>
              <IconPlus /> New Order
            </button>
            <a className="ordersGhostBtn" href="/menu">
              <IconMenu /> Add Menu Items
            </a>
            <a className="ordersGhostBtn" href="/tables">
              <IconGrid /> Manage Tables
            </a>
          </div>

          <div className="heroHint">
            Tip: Add menu items → create an order → add items → mark paid.
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="ordersLayout">
        {/* LEFT: LIST */}
        <div className="ordersPanel">
          <div className="panelTopRow">
            <div>
              <div className="panelTitle">Orders</div>
              <div className="panelSub">Search, filter, and open an order.</div>
            </div>
            <button className="miniBtn" onClick={createOrder} disabled={loading}>
              <IconPlus /> New
            </button>
          </div>

          <div className="ordersToolbar">
            <div className="ordersSearch">
              <IconSearch />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by #id, status, table..."
              />
            </div>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="kitchen">Kitchen</option>
              <option value="served">Served</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {loading ? (
            <div className="ordersList">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="orderRow skeleton" />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="ordersEmpty">
              <div className="ordersEmptyIcon"><IconReceipt /></div>
              <div className="ordersEmptyTitle">No orders yet</div>
              <div className="ordersEmptyText">Create a new order to get started.</div>
              <button className="ordersPrimaryBtn" onClick={createOrder}>
                <IconPlus /> New Order
              </button>
            </div>
          ) : (
            <div className="ordersList">
              {filteredOrders.map((o) => (
                <button
                  key={o.id}
                  className={`orderRow ${selectedId === o.id ? "active" : ""}`}
                  onClick={() => openOrder(o.id)}
                >
                  <div className="orderRowLeft">
                    <div className="orderId">#{o.id}</div>
                    <div className="orderMeta">
                      <span className={`statusTag s-${o.status}`}>{o.status}</span>
                      <span className="dotSep">•</span>
                      <span className="mutedText">
                        {o.table_label ? `Table ${o.table_label}` : "Walk-in"}
                      </span>
                    </div>
                  </div>
                  <div className="orderRowRight">
                    <div className="orderAmt">₦{Number(o.total || 0).toLocaleString()}</div>
                    <div className="mutedText">{formatTime(o.created_at)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: DETAILS */}
        <div className="ordersPanel details">
          <div className="panelTopRow">
            <div>
              <div className="panelTitle">Order Details</div>
              <div className="panelSub">Add items, update status, and close payment.</div>
            </div>
            <button className="miniBtn ghost" onClick={loadAll} title="Refresh">
              <IconRefresh /> Refresh
            </button>
          </div>

          {!selectedId ? (
            <div className="detailsEmpty">
              <div className="detailsEmptyIcon"><IconSpark /></div>
              <div className="detailsEmptyTitle">Select an order</div>
              <div className="detailsEmptyText">
                Choose an order from the left panel to view and manage it here.
              </div>
            </div>
          ) : detailLoading || !details ? (
            <div className="detailsSkeleton">
              <div className="block sk" />
              <div className="block sk" />
              <div className="block sk" />
            </div>
          ) : (
            <OrderDetails
              details={details}
              menu={menu}
              menuItemId={menuItemId}
              setMenuItemId={setMenuItemId}
              qty={qty}
              setQty={setQty}
              addItem={addItem}
              addingItem={addingItem}
              setStatus={setStatus}
              payMethod={payMethod}
              setPayMethod={setPayMethod}
              receiptNo={receiptNo}
              setReceiptNo={setReceiptNo}
              amountOverride={amountOverride}
              setAmountOverride={setAmountOverride}
              markPaid={markPaid}
              paying={paying}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ✅✅ KPI COMPONENT (THIS FIXES: "Kpi is not defined") */
function Kpi({ label, value }) {
  return (
    <div className="kpi">
      <div className="kpiLabel">{label}</div>
      <div className="kpiValue">{value}</div>
    </div>
  );
}

/* ---------- details component ---------- */

function OrderDetails({
  details,
  menu,
  menuItemId,
  setMenuItemId,
  qty,
  setQty,
  addItem,
  addingItem,
  setStatus,
  payMethod,
  setPayMethod,
  receiptNo,
  setReceiptNo,
  amountOverride,
  setAmountOverride,
  markPaid,
  paying
}) {
  const o = details.order;
  const items = details.items || [];
  const payment = details.payment;

  return (
    <>
      {/* header */}
      <div className="detailHeader">
        <div>
          <div className="detailId">Order #{o.id}</div>
          <div className="detailLine">
            <span className={`statusTag big s-${o.status}`}>{o.status}</span>
            <span className="dotSep">•</span>
            <span className="mutedText">
              {o.table_id ? `Table ID: ${o.table_id}` : "Walk-in"}
            </span>
            <span className="dotSep">•</span>
            <span className="mutedText">{formatTime(o.created_at)}</span>
          </div>
        </div>

        <div className="detailTotal">
          <div className="mutedText">Total</div>
          <div className="bigMoney">₦{Number(o.total || 0).toLocaleString()}</div>
        </div>
      </div>

      {/* status buttons */}
      <div className="statusRow">
        <button className="chip" onClick={() => setStatus("open")}>Open</button>
        <button className="chip" onClick={() => setStatus("kitchen")}>Kitchen</button>
        <button className="chip" onClick={() => setStatus("served")}>Served</button>
        <button className="chip" onClick={() => setStatus("closed")}>Close</button>
        <button className="chip danger" onClick={() => setStatus("cancelled")}>Cancel</button>
      </div>

      {/* add item */}
      <div className="card">
        <div className="cardTop">
          <div>
            <div className="cardTitle">Add Items</div>
            <div className="cardSub">Select from menu and add quantity.</div>
          </div>
          <div className="pillSoft">Fast</div>
        </div>

        <div className="addRow">
          <select value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)}>
            <option value="">Select menu item</option>
            {menu.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} (₦{Number(m.price).toLocaleString()})
              </option>
            ))}
          </select>

          <input value={qty} onChange={(e) => setQty(Number(e.target.value))} />

          <button className="ordersPrimaryBtn" onClick={addItem} disabled={!menuItemId || addingItem}>
            {addingItem ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      {/* items */}
      <div className="card">
        <div className="cardTop">
          <div>
            <div className="cardTitle">Items</div>
            <div className="cardSub">{items.length} item(s) in this order.</div>
          </div>
          <div className="pillSoft">
            Subtotal ₦{Number(o.subtotal || 0).toLocaleString()}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="emptyMini">
            <div className="mutedText">No items yet. Add your first item above.</div>
          </div>
        ) : (
          <div className="itemsList">
            {items.map((it) => (
              <div key={it.id} className="itemRow">
                <div className="itemLeft">
                  <div className="itemName">{it.name}</div>
                  <div className="mutedText">
                    ₦{Number(it.unit_price).toLocaleString()} × {it.qty}
                  </div>
                </div>
                <div className="itemRight">
                  ₦{Number(it.line_total).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="totals">
          <TotalLine label="Subtotal" value={o.subtotal} />
          <TotalLine label="Tax" value={o.tax} />
          <TotalLine label="Service Charge" value={o.service_charge} />
          <div className="totalLine grand">
            <span>Grand Total</span>
            <span>₦{Number(o.total || 0).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* payment */}
      <div className="card">
        <div className="cardTop">
          <div>
            <div className="cardTitle">Payment</div>
            <div className="cardSub">Mark paid and auto-close the order.</div>
          </div>
          {payment ? <div className="paidPill">PAID</div> : <div className="pillSoft">Pending</div>}
        </div>

        {payment ? (
          <div className="paidBox">
            <div className="paidRow">
              <span className="mutedText">Method</span>
              <b>{payment.method}</b>
            </div>
            <div className="paidRow">
              <span className="mutedText">Receipt</span>
              <b>{payment.receipt_no || "-"}</b>
            </div>
            <div className="paidRow">
              <span className="mutedText">Amount</span>
              <b>₦{Number(payment.amount || 0).toLocaleString()}</b>
            </div>
          </div>
        ) : (
          <>
            <div className="payRow">
              <label className="field">
                <span>Method</span>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="pos">POS</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>

              <label className="field">
                <span>Receipt No</span>
                <input
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  placeholder="e.g. R-10023 (optional)"
                />
              </label>
            </div>

            <label className="field">
              <span>Amount (optional override)</span>
              <input
                value={amountOverride}
                onChange={(e) => setAmountOverride(e.target.value)}
                placeholder={`Default: ₦${Number(o.total || 0).toLocaleString()}`}
              />
            </label>

            <button className="ordersPrimaryBtn" onClick={markPaid} disabled={paying}>
              {paying ? "Processing..." : "Mark Paid"}
            </button>
          </>
        )}
      </div>
    </>
  );
}

function TotalLine({ label, value }) {
  return (
    <div className="totalLine">
      <span className="mutedText">{label}</span>
      <span>₦{Number(value || 0).toLocaleString()}</span>
    </div>
  );
}

function formatTime(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return String(ts);
  }
}

/* ---------- icons (no libs) ---------- */
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
function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15a7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="2" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" opacity=".8" />
    </svg>
  );
}
function IconReceipt() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1 0 1V3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" opacity=".7" />
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M20 12a8 8 0 1 1-2.35-5.65" stroke="currentColor" strokeWidth="2" />
      <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l1.2 4.2L17 8l-3.8 1.8L12 14l-1.2-4.2L7 8l3.8-1.8L12 2Z" stroke="currentColor" strokeWidth="2" />
      <path d="M5 14l.8 2.6L8 18l-2.2 1.4L5 22l-.8-2.6L2 18l2.2-1.4L5 14Z" stroke="currentColor" strokeWidth="2" opacity=".7" />
    </svg>
  );
}
