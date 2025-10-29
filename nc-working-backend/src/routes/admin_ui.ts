import { Router } from "express";

export const adminUiRouter = Router();

adminUiRouter.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>NC Admin</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #0b0b0b; color: #e8e8e8; }
  .wrap { max-width: 1080px; margin: 28px auto; padding: 0 16px 64px; }
  h1 { margin: 0 0 18px; font-weight: 700; letter-spacing: -0.02em; }
  .grid2 { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(0,0.8fr); gap: 16px; align-items: start; }
  .card { background: #121212; border: 1px solid #242424; border-radius: 14px; padding: 16px; }
  .card h3 { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
  .card.card-stack { padding: 24px; display:flex; flex-direction:column; gap:32px; }
  .card-section { display:flex; flex-direction:column; gap:16px; }
  .card-section + .card-section { border-top:1px solid #1f1f1f; padding-top:28px; }
  .card-section-header { display:flex; flex-direction:column; gap:4px; }
  .card-section-header h3 { margin:0; font-size:16px; font-weight:600; letter-spacing:-0.01em; }
  .card-section-header .meta { margin:0; font-size:12px; color:#9ca3af; }
  .card-section-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
  .card-section-toolbar .meta { font-size:12px; color:#9ca3af; }
  .card-surface { background:#0f0f0f; border:1px solid #1f1f1f; border-radius:12px; padding:14px; }
  .card-surface.stack > * + * { margin-top:16px; border-top:1px solid #1f1f1f; padding-top:16px; }
  .subheading { text-transform:uppercase; font-size:11px; letter-spacing:0.12em; color:#8d8d8d; margin-bottom:6px; }
  .form-note { font-size:12px; color:#808080; margin-top:6px; }
  .section-title { margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.12em; font-size: 11px; color: #8d8d8d; }
  label { font-size: 12px; color: #9aa0a6; display:block; margin-bottom:6px; }
  input, select { width: 100%; background: #0f0f0f; color: #f2f2f2; border: 1px solid #2a2a2a; border-radius: 10px; padding: 8px 10px; font-size: 13px; }
  input[type="datetime-local"] { padding: 7px 8px; }
  .row { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 10px; }
  .btn { padding: 8px 12px; border-radius: 10px; border: 1px solid #2a2a2a; background:#1a1a1a; color:#fff; cursor:pointer; font-size:13px; transition: background 0.2s ease; }
  .btn:hover { background:#222; }
  .btn.primary { background:#f5f5f5; color:#000; border-color:#f5f5f5; }
  .btn.small { padding: 6px 8px; font-size: 12px; }
  .btn.danger { border-color:#ff6b6b; color:#ff6b6b; }
  .btnline { display:flex; gap:8px; flex-wrap:wrap; }
  .list { display:grid; gap:8px; margin-top:12px; }
  .card-surface .list { margin-top:0; }
  .rowItem { display:grid; grid-template-columns: minmax(0,1fr) 88px 40px 220px; gap:12px; align-items:center; padding:10px 12px; border:1px solid #1f1f1f; border-radius:12px; background:#0f0f0f; }
  .rowItem.inactive { opacity:0.45; border-style:dashed; }
  .pi { display:flex; align-items:center; gap:12px; min-width:0; }
  .pi img { width:48px; height:48px; border-radius:10px; object-fit:cover; background:#1c1c1c; }
  .pi .badge { display:inline-flex; align-items:center; gap:4px; font-size:10px; text-transform:uppercase; letter-spacing:0.08em; background:#2b2b2b; color:#c3c3c3; border-radius:999px; padding:2px 6px; margin-top:4px; }
  .tags { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
  .tag-chip { font-size:10px; letter-spacing:0.05em; text-transform:uppercase; padding:2px 6px; border-radius:8px; background:#1f1f1f; color:#c8c8c8; }
  .title { font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .id { color:#8e8e8e; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:11px; margin-top:2px; }
  .price { font-size:13px; font-weight:600; color:#bcbcbc; text-align:center; }
  .qtyWrap { display:flex; align-items:center; gap:6px; justify-content:flex-end; }
  .qtyWrap label { font-size:11px; color:#7d7d7d; text-transform:uppercase; letter-spacing:0.05em; }
  .qtyWrap input { width:55px; text-align:right; }
  .rowItem.inactive .qtyWrap input { pointer-events:none; opacity:0.4; }
  .actions { display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap; }
  pre { background:#0f0f0f; padding:12px; border-radius:12px; border:1px solid #242424; overflow:auto; font-size:12px; line-height:1.5; max-height:220px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { padding:8px 6px; border-bottom:1px solid #1f1f1f; text-align:left; }
  th { font-weight:500; color:#bcbcbc; text-transform:uppercase; font-size:11px; letter-spacing:0.08em; }
  tbody tr:hover { background:#161616; }
  .totals { display:flex; justify-content:space-between; font-size:12px; margin-top:8px; color:#bcbcbc; }
  .order-list { display:flex; flex-direction:column; gap:12px; }
  .order-card { background:#0f0f0f; border:1px solid #1f1f1f; border-radius:12px; padding:12px 14px; }
  .order-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  .order-id { font-size:13px; font-weight:600; color:#eaeaea; }
  .order-meta { color:#909090; font-size:11px; margin-top:2px; }
  .order-total { font-size:14px; font-weight:600; color:#f1f1f1; }
  .order-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }
  .order-label { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7d7d7d; margin-bottom:4px; }
  .order-value { font-size:12px; color:#d4d4d4; line-height:1.5; }
  .order-items table { width:100%; border-collapse:collapse; font-size:12px; }
  .order-items th, .order-items td { border-bottom:1px solid #1f1f1f; padding:6px 4px; }
  .order-items th { font-weight:500; color:#9aa0a6; text-transform:uppercase; font-size:11px; letter-spacing:0.08em; }
  .order-item-id { color:#808080; font-size:11px; margin-top:2px; }
  .order-account { display:block; font-size:10px; color:#6b6b6b; margin-top:4px; letter-spacing:0.06em; text-transform:uppercase; }
  .muted { color:#808080; font-size:12px; }
  .drop-card { background:#0f0f0f; border:1px solid #1f1f1f; border-radius:12px; padding:12px 14px; margin-bottom:16px; }
  .drop-summary { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:12px; font-size:12px; color:#bcbcbc; }
  .drop-summary strong { color:#f5f5f5; }
  .drop-status-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; border:1px solid #1f1f1f; font-size:11px; letter-spacing:.14em; text-transform:uppercase; }
  .drop-status-chip.live { border-color:#16a34a; color:#bbf7d0; }
  .drop-status-chip.scheduled { border-color:#facc15; color:#fde68a; }
  .drop-status-chip.ended { border-color:#4b5563; color:#cbd5f5; }
  .drop-table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:12px; }
  .drop-table th, .drop-table td { padding:6px 8px; border-bottom:1px solid #1f1f1f; text-align:left; }
  .drop-table th { font-weight:500; color:#969696; text-transform:uppercase; font-size:10px; letter-spacing:.14em; }
  .drop-table input { width:70px; padding:6px 8px; border-radius:6px; border:1px solid #2b2b2b; background:#0f0f0f; color:#f5f5f5; font-size:12px; }
  .drop-table .btn.small { padding:6px 10px; font-size:11px; }
  .drop-empty { font-size:12px; color:#8a8a8a; }
  .drop-history-grid, .drop-compare-grid { display:grid; gap:12px; margin-top:12px; }
  .drop-history-card, .drop-compare-row { background:#0f0f0f; border:1px solid #1f1f1f; border-radius:12px; padding:12px 14px; }
  .drop-history-head { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#e8e8e8; margin-bottom:6px; }
  .drop-history-meta { font-size:11px; color:#9ca3af; display:flex; gap:12px; flex-wrap:wrap; }
  .drop-history-products { margin-top:8px; display:grid; gap:6px; font-size:12px; }
  .drop-history-product { display:flex; justify-content:space-between; gap:12px; }
  .drop-history-product span:last-child { color:#e5e5e5; }
  .drop-bar-label { font-size:10px; color:#9ca3af; letter-spacing:.12em; text-transform:uppercase; display:flex; justify-content:space-between; }
  .drop-bar { height:8px; border-radius:999px; background:linear-gradient(90deg,#2563eb,#38bdf8); }
  .drop-bar.sales { background:linear-gradient(90deg,#10b981,#34d399); }
  .drop-compare-row { display:grid; gap:10px; }
  .drop-compare-header { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#e8e8e8; }
  .drop-compare-bars { display:grid; gap:6px; }
  @media (max-width: 860px) {
    .grid2 { grid-template-columns: 1fr; }
    .rowItem { grid-template-columns: minmax(0,1fr); grid-template-rows:auto auto auto auto; }
    .price, .qtyWrap, .actions { justify-self:flex-start; }
    .card.card-stack { padding:20px; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <h1>NC Admin</h1>

    <div class="grid2">
      <div class="card card-stack">
        <section class="card-section">
          <div class="card-section-header">
            <h3>Drop controls</h3>
            <p class="meta">Launch, schedule, or end a release.</p>
          </div>
          <div class="row">
            <div>
              <label>Admin key (x-admin-key)</label>
              <input id="adminKey" type="password" placeholder="super-secret-key" autocomplete="off" />
            </div>
            <div>
              <label>Start time (local)</label>
              <input id="startAt" type="datetime-local" />
              <div class="form-note">Leave blank to launch immediately.</div>
            </div>
            <div>
              <label>Duration (minutes)</label>
              <input id="dur" type="number" value="120" min="5" />
            </div>
          </div>
          <div class="card-section-toolbar">
            <span class="meta">Quick quantity presets</span>
            <div class="btnline">
              <button class="btn small" id="preset50" type="button">Preset 50 ea</button>
              <button class="btn small" id="preset10" type="button">Preset 10 ea</button>
              <button class="btn small" id="selectAll" type="button">Select all</button>
              <button class="btn small" id="selectNone" type="button">Clear</button>
            </div>
          </div>
          <div class="card-surface">
            <div class="subheading">Include products</div>
            <div id="productList" class="list"></div>
          </div>
          <div class="btnline">
            <button class="btn primary" id="btnLiveNow" type="button">Go live now</button>
            <button class="btn" id="btnAddLive" type="button">Add to live drop</button>
            <button class="btn" id="btnSchedule" type="button">Schedule manual drop</button>
            <button class="btn" id="btnState" type="button">Refresh state</button>
            <button class="btn danger" id="btnEnd" type="button">End current drop</button>
          </div>
        </section>

        <section class="card-section">
          <div class="card-section-header">
            <h3>Live drop overview</h3>
            <p class="meta">Edit inventory, monitor sell-through, and track views in real time.</p>
          </div>
          <div id="dropCurrentWrap" class="card-surface">
            <div class="muted">Load drop data with admin key.</div>
          </div>
        </section>

        <section class="card-section">
          <div class="card-section-header">
            <h3>Vault-ready products</h3>
            <p class="meta">Recently live items still within the Save window. <span id="vaultReadyInfo"></span></p>
          </div>
          <div class="card-surface">
            <div class="list" id="vaultReadyList">
              <div class="muted">Load drop data with admin key.</div>
            </div>
          </div>
        </section>

        <section class="card-section">
          <div class="card-section-header">
            <h3>Save activity</h3>
            <p class="meta">Track how many customers have saved each product.</p>
          </div>
          <div class="card-surface">
            <div class="list" id="vaultSavesList">
              <div class="muted">Load save data with admin key.</div>
            </div>
          </div>
        </section>

        <section class="card-section">
          <div class="card-section-header">
            <h3>Drop history</h3>
            <p class="meta">Recent drops and their top-performing products.</p>
          </div>
          <div id="dropHistoryWrap" class="drop-history-grid card-surface">
            <div class="muted">Load drop data with admin key.</div>
          </div>
        </section>

        <section class="card-section">
          <div class="card-section-header">
            <h3>Compare drops</h3>
            <p class="meta">Stacked revenue and sell-through for the latest releases.</p>
          </div>
          <div id="dropCompareWrap" class="drop-compare-grid card-surface">
            <div class="muted">Load drop data with admin key.</div>
          </div>
        </section>
      </div>

      <div class="card card-stack">
        <section class="card-section">
          <div class="card-section-header">
            <h3>Catalog</h3>
            <p class="meta">Add new products or adjust existing listings.</p>
          </div>
          <div class="card-surface stack">
            <div>
              <div class="row">
                <div><label>Product ID</label><input id="np_id" placeholder="tee-cream" /></div>
                <div><label>Title</label><input id="np_title" placeholder="Logo Tee - Cream" /></div>
                <div><label>Price (cents)</label><input id="np_price" type="number" placeholder="3500" /></div>
                <div><label>Image URL (optional)</label><input id="np_image" placeholder="/uploads/tee-cream.png" /></div>
                <div><label>Tags (comma separated)</label><input id="np_tags" placeholder="T-Shirt, Essentials" /></div>
              </div>
              <div class="btnline">
                <button class="btn primary" id="btnAddProd" type="button">Add product</button>
              </div>
            </div>
          </div>
        </section>

        <section class="card-section">
          <div class="card-section-header">
            <h3>System state</h3>
            <p class="meta">Realtime diagnostics and demand forecasting.</p>
          </div>
          <div class="card-surface stack">
            <div>
              <div class="subheading">State</div>
              <pre id="out">Click "Refresh state"</pre>
            </div>
            <div>
              <div class="subheading">Predictions</div>
              <pre id="pred">Loading...</pre>
            </div>
          </div>
        </section>

        <section class="card-section">
          <div class="card-section-header">
            <h3>Auto-drop</h3>
            <p class="meta">Automatically trigger drops when velocity spikes.</p>
          </div>
          <div class="card-surface">
            <div class="row">
              <label style="display:flex;align-items:center;gap:8px;">
                <input id="ad_enabled" type="checkbox" style="width:auto;accent-color:#0ff;" />
                Enable auto-drop
              </label>
              <div><label>Start velocity (items/hr, 10m)</label><input id="ad_start" type="number" value="15" /></div>
              <div><label>Stay live threshold</label><input id="ad_stay" type="number" value="5" /></div>
              <div><label>Duration (minutes)</label><input id="ad_dur" type="number" value="120" /></div>
              <div><label>Initial qty per item</label><input id="ad_qty" type="number" value="50" /></div>
            </div>
            <div class="btnline">
              <button class="btn" id="ad_save" type="button">Save auto-drop</button>
            </div>
          </div>
        </section>

        <section class="card-section">
          <div class="card-section-header">
            <h3>Recent sales</h3>
            <p class="meta">Last 200 orders, newest first.</p>
          </div>
          <div id="salesWrap" class="card-surface">
            <div class="muted">Load sales with admin key.</div>
          </div>
        </section>
      </div>
    </div>
  </div>

<script>
(() => {
  const PLACEHOLDER_IMG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='12' ry='12' fill='%23141414'/%3E%3Cpath d='M26 62l12-16 10 12 8-10 14 18H26z' fill='%23333333'/%3E%3Ccircle cx='36' cy='34' r='6' fill='%23333333'/%3E%3C/svg%3E";

  const keyInput = document.getElementById("adminKey");
  const productList = document.getElementById("productList");
  const statePre = document.getElementById("out");
  const predPre = document.getElementById("pred");
  const salesWrap = document.getElementById("salesWrap");
  const dropCurrentWrap = document.getElementById("dropCurrentWrap");
  const dropHistoryWrap = document.getElementById("dropHistoryWrap");
  const dropCompareWrap = document.getElementById("dropCompareWrap");
  const vaultReadyList = document.getElementById("vaultReadyList");
  const vaultReadyInfo = document.getElementById("vaultReadyInfo");
  const vaultSavesList = document.getElementById("vaultSavesList");
  const newProductTags = document.getElementById("np_tags");

  const storedKey = window.localStorage.getItem("nc_admin_key");
  if (storedKey) keyInput.value = storedKey;

  const dropQty = {};
  const qtyInputs = new Map();
  let products = [];

  function getKey() {
    return keyInput.value.trim();
  }

  function requireKey() {
    const key = getKey();
    if (!key) {
      alert("Enter your admin key first.");
      throw new Error("Missing admin key");
    }
    window.localStorage.setItem("nc_admin_key", key);
    return key;
  }

  async function apiJson(path, init = {}) {
    const key = requireKey();
    const headers = new Headers(init.headers || {});
    headers.set("x-admin-key", key);
    headers.set("Accept", "application/json");
    let body = init.body;
    if (body && !(body instanceof FormData) && typeof body !== "string") {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }
    const res = await fetch(path, { ...init, headers, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data && data.error ? data.error : res.statusText;
      throw new Error(msg);
    }
    return data;
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] || ch));
  }

  function formatMoney(cents) {
    const amount = Number(cents);
    if (!Number.isFinite(amount)) return "$0.00";
    return "$" + (amount / 100).toFixed(2);
  }

  function formatPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0%";
    return Math.round(num * 100) + "%";
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(Number(seconds))) return "—";
    let remaining = Math.max(0, Math.floor(Number(seconds)));
    const hours = Math.floor(remaining / 3600);
    remaining -= hours * 3600;
    const minutes = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const parts = [];
    if (hours) parts.push(hours + "h");
    if (minutes || hours) parts.push(minutes + "m");
    parts.push(secs + "s");
    return parts.join(" ");
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString();
  }

  function formatOrderAddress(address) {
    if (!address) return "—";
    const parts = [
      address.line1,
      address.line2,
      [address.city, address.state, address.postalCode].filter(Boolean).join(", ").trim(),
      address.country,
    ]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter((part) => part.length > 0);
    if (!parts.length) return "—";
    return parts.map((part) => escapeHtml(part)).join("<br/>");
  }

  function parseTags(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((tag) => String(tag).trim())
        .filter((tag) => tag.length > 0);
    }
    return String(value)
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  function buildQtyPayload() {
    const selected = {};
    let total = 0;
    for (const product of products) {
      if (product.enabled === false) {
        dropQty[product.id] = 0;
        continue;
      }
      const qty = Math.max(0, Math.floor(Number(dropQty[product.id] ?? 0)));
      if (qty > 0) {
        selected[product.id] = qty;
        total += qty;
      }
    }
    return { selected, total };
  }

  function syncInputs(targetValue) {
    qtyInputs.forEach((input, id) => {
      const product = products.find((p) => p.id === id);
      if (product && product.enabled === false) {
        dropQty[id] = 0;
        input.value = "0";
        return;
      }
      dropQty[id] = targetValue(id);
      input.value = String(dropQty[id]);
    });
  }

  async function refreshProducts() {
    try {
      const data = await apiJson("/api/admin/products");
      products = Array.isArray(data.products)
        ? data.products.map((p) => ({
            ...p,
            tags: Array.isArray(p.tags) ? p.tags : parseTags(p.tags),
          }))
        : [];
      renderProducts();
    } catch (err) {
      productList.innerHTML = '<div class="muted">' + escapeHtml(err.message || String(err)) + "</div>";
    }
  }

  function renderProducts() {
    productList.innerHTML = "";
    qtyInputs.clear();
    if (!products.length) {
      productList.innerHTML = '<div class="muted">No products yet.</div>';
      return;
    }

    for (const p of products) {
      if (typeof dropQty[p.id] !== "number") dropQty[p.id] = 0;
      if (p.enabled === false) dropQty[p.id] = 0;

      const row = document.createElement("div");
      row.className = "rowItem";
      const isEnabled = p.enabled !== false;
      if (!isEnabled) row.classList.add("inactive");

      const info = document.createElement("div");
      info.className = "pi";
      const img = document.createElement("img");
      img.src = p.imageUrl || PLACEHOLDER_IMG;
      img.alt = p.title;
      img.onerror = () => {
        img.onerror = null;
        img.src = PLACEHOLDER_IMG;
      };
      const meta = document.createElement("div");
      meta.innerHTML = '<div class="title">' + escapeHtml(p.title) + '</div><div class="id">' + escapeHtml(p.id) + '</div>';
      if (!isEnabled) {
        const badge = document.createElement("div");
        badge.className = "badge";
        badge.textContent = "Hidden";
        meta.appendChild(badge);
      }
      if (Array.isArray(p.tags) && p.tags.length) {
        const tagsWrap = document.createElement("div");
        tagsWrap.className = "tags";
        p.tags.forEach((tag) => {
          const chip = document.createElement("span");
          chip.className = "tag-chip";
          chip.textContent = tag;
          tagsWrap.appendChild(chip);
        });
        meta.appendChild(tagsWrap);
      }
      info.appendChild(img);
      info.appendChild(meta);
      row.appendChild(info);

      const price = document.createElement("div");
      price.className = "price";
      price.textContent = "$" + (p.priceCents / 100).toFixed(2);
      row.appendChild(price);

      const qtyWrap = document.createElement("div");
      qtyWrap.className = "qtyWrap";
      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.min = "0";
      qtyInput.value = String(dropQty[p.id] ?? 0);
      qtyInput.className = "qty-input";
      qtyInput.disabled = !isEnabled;
      qtyInput.addEventListener("input", () => {
        const val = Math.max(0, Math.floor(Number(qtyInput.value) || 0));
        dropQty[p.id] = val;
        qtyInput.value = String(val);
      });
      qtyWrap.appendChild(qtyInput);
      row.appendChild(qtyWrap);
      qtyInputs.set(p.id, qtyInput);

      const actions = document.createElement("div");
      actions.className = "actions";

      const uploadInput = document.createElement("input");
      uploadInput.type = "file";
      uploadInput.accept = "image/*";
      uploadInput.style.display = "none";
      uploadInput.addEventListener("change", () => handleUpload(p.id, uploadInput));

      const btnUpload = document.createElement("button");
      btnUpload.className = "btn small";
      btnUpload.type = "button";
      btnUpload.textContent = "Upload";
      btnUpload.addEventListener("click", () => uploadInput.click());

      const btnToggle = document.createElement("button");
      btnToggle.className = "btn small";
      btnToggle.type = "button";
      btnToggle.textContent = isEnabled ? "Hide" : "Show";
      btnToggle.addEventListener("click", () => handleToggle(p, !isEnabled));

      const btnEdit = document.createElement("button");
      btnEdit.className = "btn small";
      btnEdit.type = "button";
      btnEdit.textContent = "Edit";
      btnEdit.addEventListener("click", () => handleEdit(p));

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn small danger";
      btnDelete.type = "button";
      btnDelete.textContent = "Delete";
      btnDelete.addEventListener("click", () => handleDelete(p.id));

      actions.appendChild(uploadInput);
      actions.appendChild(btnUpload);
      actions.appendChild(btnToggle);
      actions.appendChild(btnEdit);
      actions.appendChild(btnDelete);
      row.appendChild(actions);

      productList.appendChild(row);
    }
  }

  async function refreshVaultReady() {
    if (!vaultReadyList) return;
    const key = getKey();
    if (!key) {
      vaultReadyList.innerHTML = '<div class="muted">Enter admin key to load vault-ready items.</div>';
      if (vaultReadyInfo) vaultReadyInfo.textContent = "";
      return;
    }
    vaultReadyList.innerHTML = '<div class="muted">Loading...</div>';
    try {
      const resp = await apiJson("/api/admin/vault-ready");
      const items = Array.isArray(resp.items) ? resp.items : [];
      if (vaultReadyInfo) {
        const windowMs = Number(resp.windowMs) || 4 * 3_600_000;
        const hours = Math.round(windowMs / 3_600_000);
        vaultReadyInfo.textContent = hours ? "(window: " + hours + "h)" : "";
      }
      if (!items.length) {
        vaultReadyList.innerHTML = '<div class="muted">No vault-ready products right now.</div>';
        return;
      }
      vaultReadyList.innerHTML = "";
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "rowItem";

        const product = item.product || {};

        const info = document.createElement("div");
        info.className = "pi";
        const img = document.createElement("img");
        img.src = product.imageUrl || PLACEHOLDER_IMG;
        img.alt = product.title || item.id;
        img.onerror = () => {
          img.onerror = null;
          img.src = PLACEHOLDER_IMG;
        };

        const meta = document.createElement("div");
        meta.innerHTML =
          '<div class="title">' +
          escapeHtml(product.title || item.id) +
          '</div><div class="id">' +
          escapeHtml(item.id || "") +
          "</div>";
        const badge = document.createElement("div");
        badge.className = "badge";
        badge.textContent = "Vault ready";
        meta.appendChild(badge);
        const last = document.createElement("div");
        last.className = "muted";
        last.textContent = "Last live " + formatDateTime(item.lastLiveAt || "");
        meta.appendChild(last);
        if (Array.isArray(product.tags) && product.tags.length) {
          const tagsWrap = document.createElement("div");
          tagsWrap.className = "tags";
          product.tags.forEach((tag) => {
            const chip = document.createElement("span");
            chip.className = "tag-chip";
            chip.textContent = tag;
            tagsWrap.appendChild(chip);
          });
          meta.appendChild(tagsWrap);
        }
        info.appendChild(img);
        info.appendChild(meta);
        row.appendChild(info);

        const price = document.createElement("div");
        price.className = "price";
        price.textContent = formatMoney(product.priceCents ?? 0);
        row.appendChild(price);

        const qtyWrap = document.createElement("div");
        qtyWrap.className = "qtyWrap";
        const qtyLabel = document.createElement("span");
        qtyLabel.className = "muted";
        qtyLabel.textContent = "Remaining";
        const qtyValue = document.createElement("strong");
        qtyValue.textContent = String(item.remaining ?? 0);
        qtyWrap.appendChild(qtyLabel);
        qtyWrap.appendChild(qtyValue);
        row.appendChild(qtyWrap);

        const actions = document.createElement("div");
        actions.className = "actions";
        const timeSpan = document.createElement("span");
        timeSpan.className = "muted";
        timeSpan.textContent = formatDateTime(item.lastLiveAt || "");
        actions.appendChild(timeSpan);
        row.appendChild(actions);

        vaultReadyList.appendChild(row);
      });
    } catch (err) {
      vaultReadyList.innerHTML =
        '<div class="muted">' + escapeHtml(err.message || String(err)) + "</div>";
      if (vaultReadyInfo) vaultReadyInfo.textContent = "";
    }
  }

  async function refreshVaultSaves() {
    if (!vaultSavesList) return;
    const key = getKey();
    if (!key) {
      vaultSavesList.innerHTML = '<div class="muted">Enter admin key to load save activity.</div>';
      return;
    }
    vaultSavesList.innerHTML = '<div class="muted">Loading...</div>';
    try {
      const resp = await apiJson("/api/admin/vault-saves");
      const items = Array.isArray(resp.items) ? resp.items : [];
      if (!items.length) {
        vaultSavesList.innerHTML = '<div class="muted">No save activity yet.</div>';
        return;
      }
      vaultSavesList.innerHTML = "";
      items.forEach((entry) => {
        const row = document.createElement("div");
        row.className = "rowItem";

        const product = entry.product || {};

        const info = document.createElement("div");
        info.className = "pi";
        const img = document.createElement("img");
        img.src = product.imageUrl || PLACEHOLDER_IMG;
        img.alt = product.title || entry.productId;
        img.onerror = () => {
          img.onerror = null;
          img.src = PLACEHOLDER_IMG;
        };

        const meta = document.createElement("div");
        meta.innerHTML =
          '<div class="title">' +
          escapeHtml(product.title || entry.productId) +
          '</div><div class="id">' +
          escapeHtml(entry.productId || "") +
          "</div>";
        if (Array.isArray(product.tags) && product.tags.length) {
          const tagsWrap = document.createElement("div");
          tagsWrap.className = "tags";
          product.tags.forEach((tag) => {
            const chip = document.createElement("span");
            chip.className = "tag-chip";
            chip.textContent = tag;
            tagsWrap.appendChild(chip);
          });
          meta.appendChild(tagsWrap);
        }
        info.appendChild(img);
        info.appendChild(meta);
        row.appendChild(info);

        const savesCol = document.createElement("div");
        savesCol.className = "price";
        savesCol.style.display = "flex";
        savesCol.style.flexDirection = "column";
        savesCol.style.alignItems = "center";
        const savesStrong = document.createElement("strong");
        savesStrong.textContent = String(entry.saves ?? 0);
        const savesLabel = document.createElement("span");
        savesLabel.style.fontSize = "11px";
        savesLabel.style.color = "#9ca3af";
        savesLabel.style.textTransform = "uppercase";
        savesLabel.style.letterSpacing = "0.12em";
        savesLabel.textContent = "saves";
        savesCol.appendChild(savesStrong);
        savesCol.appendChild(savesLabel);
        row.appendChild(savesCol);

        const thresholdCol = document.createElement("div");
        thresholdCol.className = "qtyWrap";
        const thresholdLabel = document.createElement("span");
        thresholdLabel.className = "muted";
        thresholdLabel.textContent = "Threshold";
        const thresholdValue = document.createElement("strong");
        thresholdValue.textContent = String(entry.threshold ?? 0);
        thresholdCol.appendChild(thresholdLabel);
        thresholdCol.appendChild(thresholdValue);
        row.appendChild(thresholdCol);

        const statusCol = document.createElement("div");
        statusCol.className = "actions";
        const statusBadge = document.createElement("span");
        statusBadge.className = "btn small";
        statusBadge.style.background = "rgba(255,255,255,0.06)";
        statusBadge.style.color = "#d1d5db";
        statusBadge.style.cursor = "default";
        let statusText = "Collecting saves";
        if (entry.activeRelease) statusText = "Release live";
        else if (entry.pendingRelease) statusText = "Release scheduled";
        statusBadge.textContent = statusText;
        statusCol.appendChild(statusBadge);
        row.appendChild(statusCol);

        vaultSavesList.appendChild(row);
      });
    } catch (err) {
      vaultSavesList.innerHTML =
        '<div class="muted">' + escapeHtml(err.message || String(err)) + "</div>";
    }
  }

  async function handleUpload(productId, input) {
    try {
      requireKey();
      if (!input.files || !input.files.length) return;
      const fd = new FormData();
      fd.append("file", input.files[0]);
      const res = await fetch("/api/admin/upload-image", {
        method: "POST",
        headers: { "x-admin-key": getKey() },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Upload failed");
      }
      await apiJson("/api/admin/products/" + encodeURIComponent(productId), {
        method: "PATCH",
        body: { imageUrl: data.url },
      });
      await refreshProducts();
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      input.value = "";
    }
  }

  async function handleToggle(product, nextEnabled) {
    try {
      await apiJson("/api/admin/products/" + encodeURIComponent(product.id), {
        method: "PATCH",
        body: { enabled: nextEnabled },
      });
      if (!nextEnabled) {
        dropQty[product.id] = 0;
      }
      await refreshProducts();
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  async function handleEdit(product) {
    try {
      const title = prompt("Update title", product.title);
      if (title === null) return;
      const priceInput = prompt("Update price (USD)", (product.priceCents / 100).toFixed(2));
      if (priceInput === null) return;
      const price = Math.round(Number(priceInput) * 100);
      if (!Number.isFinite(price) || price <= 0) {
        alert("Invalid price");
        return;
      }
      const tagsInput = prompt(
        "Update tags (comma separated)",
        Array.isArray(product.tags) && product.tags.length ? product.tags.join(", ") : "",
      );
      if (tagsInput === null) return;
      const tags = parseTags(tagsInput);
      await apiJson("/api/admin/products/" + encodeURIComponent(product.id), {
        method: "PATCH",
        body: { title: title.trim(), priceCents: price, tags },
      });
      await refreshProducts();
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  async function handleDelete(productId) {
    if (!confirm("Delete product '" + productId + "'?")) return;
    try {
      await apiJson("/api/admin/products/" + encodeURIComponent(productId), { method: "DELETE" });
      delete dropQty[productId];
      await refreshProducts();
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  async function refreshState() {
    try {
      const state = await apiJson("/api/admin/state");
      statePre.textContent = JSON.stringify(state, null, 2);
    } catch (err) {
      statePre.textContent = err.message || String(err);
    }
  }

  async function refreshPred() {
    try {
      const res = await fetch("/api/predict");
      const data = await res.json();
      predPre.textContent = JSON.stringify({
        generated_at: data.generated_at,
        next_drop_projection: data.next_drop_projection ?? null,
        products: Array.isArray(data.products) ? data.products : [],
      }, null, 2);
    } catch (err) {
      predPre.textContent = err.message || String(err);
    }
  }

  async function loadAutoDrop() {
    try {
      const cfg = await apiJson("/api/admin/autodrop");
      document.getElementById("ad_enabled").checked = !!cfg.enabled;
      document.getElementById("ad_start").value = cfg.minVelocityToStart ?? 15;
      document.getElementById("ad_stay").value = cfg.minVelocityToStayLive ?? 5;
      document.getElementById("ad_dur").value = cfg.defaultDurationMinutes ?? 120;
      document.getElementById("ad_qty").value = cfg.initialQty ?? 50;
    } catch (err) {
      console.warn(err);
    }
  }

  function renderDropCurrent(data) {
    if (!dropCurrentWrap) return;
    const addBtn = document.getElementById("btnAddLive");
    if (!data || !data.products || !data.products.length) {
      if (addBtn) {
        addBtn.disabled = true;
        addBtn.title = "Live drop not active";
      }
      dropCurrentWrap.innerHTML = '<div class="muted">No live drop at the moment.</div>';
      return;
    }
    const canEdit = data.status === "live";
    if (addBtn) {
      addBtn.disabled = !canEdit;
      addBtn.title = canEdit ? "Add selected products to live drop" : "Live drop not active";
    }
    const statusClass =
      data.status === "live" ? "live" : data.status === "scheduled" ? "scheduled" : "ended";
    const started = data.startedAt || data.scheduledStartsAt;
    const ended = data.endedAt || data.scheduledEndsAt;
    const summary =
      '<div class="drop-summary">' +
      '<span class="drop-status-chip ' + statusClass + '">' + escapeHtml(data.status || "unknown") + "</span>" +
      '<span><strong>Start:</strong> ' + escapeHtml(formatDateTime(started)) + "</span>" +
      '<span><strong>End:</strong> ' + escapeHtml(formatDateTime(ended)) + "</span>" +
      '<span><strong>Sold:</strong> ' + escapeHtml(String(data.totals?.soldQty ?? 0)) + "</span>" +
      '<span><strong>Revenue:</strong> ' + escapeHtml(formatMoney(data.totals?.revenueCents ?? 0)) + "</span>" +
      '<span><strong>Views:</strong> ' + escapeHtml(String(data.totals?.views ?? 0)) + "</span>" +
      '<span><strong>Sell-through:</strong> ' + escapeHtml(formatPercent(data.totals?.sellThrough ?? 0)) + "</span>" +
      "</div>";

    const rows = data.products
      .map((product) => {
        const productId = escapeHtml(product.productId || "");
        const editCell = canEdit
          ? '<form class="drop-edit-form" data-product-id="' +
            productId +
            '"><input name="remaining" type="number" min="0" value="' +
            escapeHtml(String(product.remainingQty ?? 0)) +
            '" /><button type="submit" class="btn small">Update</button></form>'
          : '<span>' + escapeHtml(String(product.remainingQty ?? 0)) + "</span>";
        return (
          "<tr>" +
          "<td><div>" +
          escapeHtml(product.title || productId) +
          '</div><div class="muted">' +
          productId +
          "</div></td>" +
          "<td>" +
          escapeHtml(String(product.initialQty ?? 0)) +
          "</td>" +
          "<td>" +
          editCell +
          "</td>" +
          "<td>" +
          escapeHtml(String(product.soldQty ?? 0)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatPercent(product.sellThrough ?? 0)) +
          "</td>" +
          "<td>" +
          escapeHtml(String(product.views ?? 0)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatMoney(product.revenueCents ?? 0)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    dropCurrentWrap.innerHTML =
      '<div class="drop-card">' +
      summary +
      '<table class="drop-table"><thead><tr><th>Product</th><th>Initial</th><th>Remaining</th><th>Sold</th><th>Sell-through</th><th>Views</th><th>Revenue</th></tr></thead><tbody>' +
      rows +
      "</tbody></table>" +
      "</div>";

    if (canEdit) {
      dropCurrentWrap.querySelectorAll(".drop-edit-form").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const productId = form.getAttribute("data-product-id");
          const input = form.querySelector("input[name='remaining']");
          if (!productId || !input) return;
          const value = Number(input.value);
          if (!Number.isFinite(value) || value < 0) {
            alert("Enter a valid remaining quantity.");
            return;
          }
          try {
            await apiJson("/api/admin/drops/current/inventory", {
              method: "PATCH",
              body: { productId, remaining: Math.max(0, Math.floor(value)) },
            });
            await refreshDrops();
          } catch (err) {
            alert(err.message || String(err));
          }
        });
      });
    }
  }

  function renderDropHistory(list) {
    if (!dropHistoryWrap) return;
    if (!Array.isArray(list) || !list.length) {
      dropHistoryWrap.innerHTML = '<div class="muted">No past drops yet.</div>';
      return;
    }
    const cards = list
      .map((drop) => {
        const start = formatDateTime(drop.startedAt || drop.scheduledStartsAt);
        const end = formatDateTime(drop.endedAt || drop.scheduledEndsAt);
        const topProducts = (Array.isArray(drop.products) ? drop.products : [])
          .slice()
          .sort((a, b) => (b.revenueCents ?? 0) - (a.revenueCents ?? 0))
          .slice(0, 3)
          .map(
            (prod) =>
              '<div class="drop-history-product"><span>' +
              escapeHtml(prod.title || prod.productId || "") +
              "</span><span>" +
              escapeHtml(String(prod.soldQty ?? 0)) +
              " sold &middot; " +
              escapeHtml(formatMoney(prod.revenueCents ?? 0)) +
              "</span></div>",
          )
          .join("");
        const metaParts = [
          "<span>Start: " + escapeHtml(start) + "</span>",
          "<span>End: " + escapeHtml(end) + "</span>",
          "<span>Sold: " + escapeHtml(String(drop.totals?.soldQty ?? 0)) + "</span>",
          "<span>Revenue: " + escapeHtml(formatMoney(drop.totals?.revenueCents ?? 0)) + "</span>",
          "<span>Views: " + escapeHtml(String(drop.totals?.views ?? 0)) + "</span>",
          "<span>Sell-through: " + escapeHtml(formatPercent(drop.totals?.sellThrough ?? 0)) + "</span>",
        ];
        if (Number.isFinite(Number(drop.durationSeconds))) {
          metaParts.push(
            "<span>Duration: " + escapeHtml(formatDuration(Number(drop.durationSeconds))) + "</span>",
          );
        }
        return (
          '<div class="drop-history-card">' +
          '<div class="drop-history-head">' +
          '<div>' +
          escapeHtml(drop.id || "") +
          "</div>" +
          '<div class="drop-status-chip ' +
          (drop.status === "live" ? "live" : drop.status === "scheduled" ? "scheduled" : "ended") +
          '">' +
          escapeHtml(drop.status || "") +
          "</div>" +
          "</div>" +
          '<div class="drop-history-meta">' +
          metaParts.join("") +
          "</div>" +
          (topProducts ? '<div class="drop-history-products">' + topProducts + "</div>" : "") +
          "</div>"
        );
      })
      .join("");
    dropHistoryWrap.innerHTML = cards;
  }

  function renderDropCompare(list) {
    if (!dropCompareWrap) return;
    if (!Array.isArray(list) || !list.length) {
      dropCompareWrap.innerHTML = '<div class="muted">No drop analytics yet.</div>';
      return;
    }
    const maxRevenue = Math.max(
      1,
      ...list.map((drop) => Number(drop.totals?.revenueCents ?? 0)),
    );
    const maxSold = Math.max(1, ...list.map((drop) => Number(drop.totals?.soldQty ?? 0)));
    const rows = list
      .map((drop) => {
        const label =
          formatDateTime(drop.startedAt || drop.scheduledStartsAt) +
          " &middot; " +
          escapeHtml(drop.id || "");
        const revenueWidth = Math.round(
          Math.min(100, ((drop.totals?.revenueCents ?? 0) / maxRevenue) * 100),
        );
        const soldWidth = Math.round(
          Math.min(100, ((drop.totals?.soldQty ?? 0) / maxSold) * 100),
        );
        return (
          '<div class="drop-compare-row">' +
          '<div class="drop-compare-header">' +
          "<span>" +
          escapeHtml(label) +
          "</span>" +
          "<span>" +
          escapeHtml(formatMoney(drop.totals?.revenueCents ?? 0)) +
          "</span>" +
          "</div>" +
          '<div class="drop-compare-bars">' +
          '<div class="drop-bar-label"><span>Revenue</span><span>' +
          escapeHtml(formatMoney(drop.totals?.revenueCents ?? 0)) +
          "</span></div>" +
          '<div class="drop-bar" style="width:' +
          revenueWidth +
          '%"></div>' +
          '<div class="drop-bar-label"><span>Sold</span><span>' +
          escapeHtml(String(drop.totals?.soldQty ?? 0)) +
          "</span></div>" +
          '<div class="drop-bar sales" style="width:' +
          soldWidth +
          '%"></div>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    dropCompareWrap.innerHTML = rows;
  }

  async function refreshDrops() {
    if (!dropCurrentWrap || !dropHistoryWrap || !dropCompareWrap) return;
    try {
      const data = await apiJson("/api/admin/drops?limit=8");
      const current = data.current || null;
      const history = Array.isArray(data.history) ? data.history : [];
      renderDropCurrent(current);
      renderDropHistory(history);
      const compare = current ? [current, ...history] : history.slice();
      renderDropCompare(compare.slice(0, 6));
      await refreshVaultReady();
      await refreshVaultSaves();
    } catch (err) {
      const msg = escapeHtml(err.message || String(err));
      dropCurrentWrap.innerHTML = '<div class="muted">' + msg + "</div>";
      dropHistoryWrap.innerHTML = '<div class="muted">' + msg + "</div>";
      dropCompareWrap.innerHTML = '<div class="muted">' + msg + "</div>";
    }
  }

  async function refreshSales() {
    try {
      const data = await apiJson("/api/admin/sales?limit=200");
      const totals = data.totals || { count: 0, items: 0, grossCents: 0 };
      const orders = Array.isArray(data.orders) ? data.orders : [];
      const rows = Array.isArray(data.sales) ? data.sales : [];

      if (!orders.length && !rows.length) {
        salesWrap.innerHTML = '<div class="muted">No sales yet.</div>';
        return;
      }

      if (orders.length) {
        let html = '<div class="order-list">';
        for (const order of orders) {
          const customerLines = [];
          if (order.customerName) customerLines.push(escapeHtml(order.customerName));
          if (order.customerEmail) customerLines.push(escapeHtml(order.customerEmail));
          let customerHtml = customerLines.join("<br/>");
          if (order.userId) {
            const accountHtml = '<span class="order-account">Account ID: ' + escapeHtml(order.userId) + "</span>";
            customerHtml = customerHtml ? customerHtml + "<br/>" + accountHtml : accountHtml;
          }
          if (!customerHtml) customerHtml = "—";

          const addressHtml = formatOrderAddress(order.shippingAddress);

          const headerMeta = [];
          const dateText = formatDateTime(order.ts);
          if (dateText) headerMeta.push('<div class="order-meta">' + escapeHtml(dateText) + "</div>");
          const itemsCount = Number.isFinite(Number(order.totalItems)) ? Number(order.totalItems) : 0;
          headerMeta.push('<div class="order-meta">Items: ' + escapeHtml(String(itemsCount)) + "</div>");
          if (order.paymentRef) {
            headerMeta.push('<div class="order-meta">Payment: ' + escapeHtml(order.paymentRef) + "</div>");
          }

          const itemRows = Array.isArray(order.items) ? order.items : [];
          let itemsTable = '<div class="muted">No line items.</div>';
          if (itemRows.length) {
            const rowsHtml = itemRows
              .map((item) => {
                const title = item.productTitle || item.productId || "Item";
                const qtyText = Number.isFinite(Number(item.qty)) ? Number(item.qty) : 0;
                const each = formatMoney(item.priceCents);
                const subtotal = formatMoney(item.lineTotalCents ?? (Number(item.priceCents) || 0) * qtyText);
                const productId = item.productId ? '<div class="order-item-id">' + escapeHtml(item.productId) + "</div>" : "";
                return (
                  "<tr>" +
                  "<td><div>" +
                  escapeHtml(title) +
                  "</div>" +
                  productId +
                  "</td>" +
                  '<td style="text-align:center;">' +
                  escapeHtml(String(qtyText)) +
                  "</td>" +
                  '<td style="text-align:right;">' +
                  escapeHtml(each) +
                  "</td>" +
                  '<td style="text-align:right;">' +
                  escapeHtml(subtotal) +
                  "</td>" +
                  "</tr>"
                );
              })
              .join("");
            itemsTable =
              '<div class="order-items"><table><thead><tr><th>Product</th><th>Qty</th><th>Each</th><th>Subtotal</th></tr></thead><tbody>' +
              rowsHtml +
              "</tbody></table></div>";
          }

          html +=
            '<div class="order-card">' +
            '<div class="order-header">' +
            '<div><div class="order-id">Order ' +
            escapeHtml(order.orderId || "") +
            "</div>" +
            headerMeta.join("") +
            "</div>" +
            '<div class="order-total">' +
            escapeHtml(formatMoney(order.totalCents)) +
            "</div>" +
            "</div>" +
            '<div class="order-grid">' +
            '<div><div class="order-label">Customer</div><div class="order-value">' +
            customerHtml +
            "</div></div>" +
            '<div><div class="order-label">Ship to</div><div class="order-value">' +
            addressHtml +
            "</div></div>" +
            "</div>" +
            itemsTable +
            "</div>";
        }
        html += "</div>";
        html +=
          '<div class="totals"><span>' +
          escapeHtml(String(orders.length)) +
          " orders / " +
          escapeHtml(String(totals.items ?? 0)) +
          " items</span><span>" +
          escapeHtml(formatMoney(totals.grossCents)) +
          "</span></div>";
        salesWrap.innerHTML = html;
        return;
      }

      // Legacy fallback (no order grouping available)
      let legacyHtml =
        '<table><thead><tr><th>ID</th><th>Product</th><th>Qty</th><th>Price</th><th>When</th></tr></thead><tbody>';
      for (const row of rows) {
        legacyHtml +=
          "<tr><td>" +
          escapeHtml(row.id || "") +
          "</td><td>" +
          escapeHtml(row.productId || "") +
          "</td><td>" +
          escapeHtml(String(row.qty ?? 0)) +
          "</td><td>" +
          escapeHtml(formatMoney((row.priceCents ?? 0) * (row.qty ?? 0))) +
          "</td><td>" +
          escapeHtml(formatDateTime(row.ts || "")) +
          "</td></tr>";
      }
      legacyHtml += "</tbody></table>";
      legacyHtml +=
        '<div class="totals"><span>' +
        escapeHtml(String(rows.length)) +
        " lines / " +
        escapeHtml(String(totals.items ?? 0)) +
        " items</span><span>" +
        escapeHtml(formatMoney(totals.grossCents)) +
        "</span></div>";
      salesWrap.innerHTML = legacyHtml;
    } catch (err) {
      salesWrap.innerHTML = '<div class="muted">' + escapeHtml(err.message || String(err)) + "</div>";
    }
  }

  document.getElementById("preset50").addEventListener("click", () =>
    syncInputs(() => 50)
  );
  document.getElementById("preset10").addEventListener("click", () =>
    syncInputs(() => 10)
  );
  document.getElementById("selectAll").addEventListener("click", () =>
    syncInputs((id) => dropQty[id] > 0 ? dropQty[id] : 1)
  );
  document.getElementById("selectNone").addEventListener("click", () =>
    syncInputs(() => 0)
  );

  document.getElementById("btnLiveNow").addEventListener("click", async () => {
    try {
      const { selected, total } = buildQtyPayload();
      if (!Object.keys(selected).length) {
        alert("Set at least one quantity above zero.");
        return;
      }
      const resp = await apiJson("/api/admin/drop/live-now", {
        method: "POST",
        body: { qty: selected },
      });
      statePre.textContent = JSON.stringify(resp, null, 2);
      await refreshState();
      await refreshDrops();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.getElementById("btnAddLive").addEventListener("click", async () => {
    try {
      const { selected } = buildQtyPayload();
      if (!Object.keys(selected).length) {
        alert("Select at least one product and quantity.");
        return;
      }
      const resp = await apiJson("/api/admin/drops/current/add", {
        method: "POST",
        body: { additions: selected },
      });
      statePre.textContent = JSON.stringify(resp, null, 2);
      Object.keys(selected).forEach((id) => {
        dropQty[id] = 0;
      });
      renderProducts();
      await refreshState();
      await refreshDrops();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.getElementById("btnSchedule").addEventListener("click", async () => {
    try {
      const { selected } = buildQtyPayload();
      if (!Object.keys(selected).length) {
        alert("Set at least one quantity above zero.");
        return;
      }
      const startVal = document.getElementById("startAt").value;
      const durationVal = Number(document.getElementById("dur").value || 120);
      const startsAt = startVal ? new Date(startVal).toISOString() : "now";
      const body = {
        startsAt,
        durationMinutes: Number.isFinite(durationVal) && durationVal > 0 ? Math.floor(durationVal) : 120,
        initialQty: selected,
      };
      const resp = await apiJson("/api/admin/drop/manual", {
        method: "POST",
        body,
      });
      statePre.textContent = JSON.stringify(resp, null, 2);
      await refreshState();
      await refreshDrops();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.getElementById("btnState").addEventListener("click", () => {
    refreshState();
    refreshProducts();
    refreshSales();
    loadAutoDrop();
    refreshDrops();
    refreshVaultReady();
    refreshVaultSaves();
  });

  document.getElementById("btnEnd").addEventListener("click", async () => {
    if (!confirm("End the current drop?")) return;
    try {
      const resp = await apiJson("/api/admin/drop/end", { method: "POST" });
      statePre.textContent = JSON.stringify(resp, null, 2);
      await refreshState();
      await refreshDrops();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.getElementById("btnAddProd").addEventListener("click", async () => {
    try {
      const id = document.getElementById("np_id").value.trim();
      const title = document.getElementById("np_title").value.trim();
      const priceCents = Number(document.getElementById("np_price").value.trim());
      const imageUrl = document.getElementById("np_image").value.trim();
      const tags = parseTags(newProductTags ? newProductTags.value : "");
      if (!id || !title || !Number.isFinite(priceCents)) {
        alert("Fill all fields.");
        return;
      }
      await apiJson("/api/admin/products", {
        method: "POST",
        body: {
          id,
          title,
          priceCents: Math.round(priceCents),
          imageUrl: imageUrl || undefined,
          tags,
        },
      });
      document.getElementById("np_id").value = "";
      document.getElementById("np_title").value = "";
      document.getElementById("np_price").value = "";
      document.getElementById("np_image").value = "";
      if (newProductTags) newProductTags.value = "";
      dropQty[id] = 0;
      await refreshProducts();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.getElementById("ad_save").addEventListener("click", async () => {
    try {
      const body = {
        enabled: document.getElementById("ad_enabled").checked,
        minVelocityToStart: Number(document.getElementById("ad_start").value || 15),
        minVelocityToStayLive: Number(document.getElementById("ad_stay").value || 5),
        defaultDurationMinutes: Number(document.getElementById("ad_dur").value || 120),
        initialQty: Number(document.getElementById("ad_qty").value || 50),
      };
      const resp = await apiJson("/api/admin/autodrop", {
        method: "POST",
        body,
      });
      alert("Saved.");
      console.info(resp);
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  keyInput.addEventListener("change", () => {
    const val = keyInput.value.trim();
    window.localStorage.setItem("nc_admin_key", val);
    if (val) {
      refreshProducts();
      refreshDrops();
      refreshState();
      refreshSales();
      loadAutoDrop();
      refreshVaultReady();
      refreshVaultSaves();
    } else {
      if (vaultReadyList) {
        vaultReadyList.innerHTML = '<div class="muted">Enter admin key to load vault-ready items.</div>';
        if (vaultReadyInfo) vaultReadyInfo.textContent = "";
      }
      if (vaultSavesList) {
        vaultSavesList.innerHTML = '<div class="muted">Enter admin key to load save activity.</div>';
      }
    }
  });

  if (storedKey) {
    refreshProducts();
    refreshState();
    refreshSales();
    loadAutoDrop();
    refreshDrops();
    refreshVaultReady();
    refreshVaultSaves();
  }

  refreshPred();
  setInterval(refreshPred, 15000);
  setInterval(() => {
    const key = getKey();
    if (key) {
      refreshDrops();
      refreshVaultReady();
      refreshVaultSaves();
    }
  }, 20000);
})();
</script>
</body>
</html>`);
});




