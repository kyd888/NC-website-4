import { Router } from "express";
import { clearAdminCookie, requireAdminPage, setAdminCookie, verifyAdminKey } from "../lib/adminAuth.js";

export const adminUiRouter = Router();

adminUiRouter.get("/login", (req, res) => {
  const next = typeof req.query.next === "string" && req.query.next.startsWith("/admin") ? req.query.next : "/admin";
  const error = req.query.error === "1";
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>NC Admin Login</title>
<style>
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0b0b0b; color:#e8e8e8; font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; padding:20px; }
  .login { width:min(420px,100%); background:#121212; border:1px solid #242424; border-radius:14px; padding:24px; }
  h1 { margin:0 0 8px; font-size:24px; letter-spacing:-.02em; }
  p { margin:0 0 18px; color:#909090; font-size:13px; line-height:1.5; }
  label { display:block; color:#a3a3a3; font-size:12px; margin-bottom:6px; }
  input { width:100%; background:#0f0f0f; color:#f5f5f5; border:1px solid #2a2a2a; border-radius:10px; padding:10px 12px; font-size:14px; }
  button { width:100%; margin-top:14px; background:#f5f5f5; color:#050505; border:1px solid #f5f5f5; border-radius:10px; padding:10px 12px; cursor:pointer; font-weight:600; }
  .error { margin:0 0 12px; padding:10px 12px; border-radius:10px; background:#3a1111; color:#fecaca; font-size:13px; }
</style>
</head>
<body>
  <form class="login" method="post" action="/admin/login">
    <h1>NC Admin</h1>
    <p>Enter the admin key to manage products, drops, saved data, and orders.</p>
    ${error ? '<div class="error">Invalid admin key.</div>' : ""}
    <input type="hidden" name="next" value="${next.replace(/"/g, "&quot;")}" />
    <label for="adminKey">Admin key</label>
    <input id="adminKey" name="adminKey" type="password" autocomplete="current-password" autofocus required />
    <button type="submit">Sign in</button>
  </form>
</body>
</html>`);
});

adminUiRouter.post("/login", (req, res) => {
  const key = typeof req.body?.adminKey === "string" ? req.body.adminKey.trim() : "";
  const next = typeof req.body?.next === "string" && req.body.next.startsWith("/admin") ? req.body.next : "/admin";
  if (!verifyAdminKey(key)) {
    return res.redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }
  setAdminCookie(res, key);
  res.redirect(next);
});

adminUiRouter.post("/logout", (_req, res) => {
  clearAdminCookie(res);
  res.redirect("/admin/login");
});

adminUiRouter.get("/", requireAdminPage, (_req, res) => {
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
  .topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:18px; }
  .topbar h1 { margin:0; }
  .topbar .btnline { display:flex; align-items:center; gap:10px; }
  .tabs { display:flex; gap:4px; flex-wrap:wrap; border-bottom:1px solid #1f1f1f; margin-bottom:18px; }
  .tab { appearance:none; background:transparent; border:0; border-bottom:2px solid transparent; color:#8a8a8a; font:inherit; font-size:13px; font-weight:500; padding:9px 14px; cursor:pointer; border-radius:8px 8px 0 0; }
  .tab:hover { color:#d4d4d4; background:#101010; }
  .tab[aria-selected="true"] { color:#f5f5f5; border-bottom-color:#f5f5f5; }
  .tabpanel[hidden] { display:none; }
  details.raw { border:1px solid #1f1f1f; border-radius:10px; background:#0f0f0f; }
  details.raw > summary { cursor:pointer; padding:9px 12px; color:#969696; font-size:11px; text-transform:uppercase; letter-spacing:.14em; list-style:none; }
  details.raw > summary::-webkit-details-marker { display:none; }
  details.raw > summary:hover { color:#d4d4d4; }
  details.raw pre { margin:0 12px 12px; }
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
  input, select, textarea { width: 100%; background: #0f0f0f; color: #f2f2f2; border: 1px solid #2a2a2a; border-radius: 10px; padding: 8px 10px; font-size: 13px; font-family: inherit; }
  textarea { resize: vertical; line-height: 1.5; }
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
  .kyd-rows { display:grid; gap:8px; margin-bottom:10px; }
  .kyd-row {
    display:grid; gap:8px; padding:12px 14px;
    border:1px solid #1f1f1f; border-radius:12px; background:#0f0f0f;
  }
  .kyd-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; }
  .kyd-field label {
    display:block; font-size:10px; letter-spacing:.08em; text-transform:uppercase;
    color:#7d7d7d; margin-bottom:3px;
  }
  .kyd-field input { font-size:12px; padding:7px 9px; }
  .kyd-row__foot { display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .kyd-row__slug { font-size:11px; color:#6f6f6f; font-family:ui-monospace,Menlo,monospace; }
  .kyd-row__foot .btn { font-size:11px; padding:5px 10px; }
  .vault-list { display:grid; gap:8px; }
  .vault-row {
    display:grid; grid-template-columns:1fr auto; gap:10px 14px; align-items:center;
    padding:12px 14px; border:1px solid #1f1f1f; border-radius:12px; background:#0f0f0f;
  }
  .vault-row.is-out { opacity:.55; }
  .vault-row__name { font-size:13px; font-weight:500; }
  .vault-row__id { font-size:11px; color:#7d7d7d; font-family:ui-monospace,Menlo,monospace; }
  .vault-row__time { font-size:12px; color:#c8c8c8; margin-top:3px; }
  .vault-row__time b { color:#f2f2f2; font-weight:500; font-variant-numeric:tabular-nums; }
  .vault-chip {
    display:inline-block; font-size:10px; letter-spacing:.08em; text-transform:uppercase;
    padding:2px 7px; border-radius:999px; margin-left:8px;
  }
  .vault-chip.in { background:#14351f; color:#7ee2a8; }
  .vault-chip.out { background:#2b2b2b; color:#b9b9b9; }
  .vault-chip.custom { background:#31280f; color:#e4c56b; }
  .vault-row__actions { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
  .vault-row__actions .btn { font-size:11px; padding:6px 10px; }
  @media (max-width:640px){
    .vault-row { grid-template-columns:1fr; }
    .vault-row__actions { justify-content:flex-start; }
  }
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
    <div class="topbar">
      <h1>NC Admin</h1>
      <div class="btnline">
        <a class="btn small" href="/admin/saved-data">Saved data</a>
        <form method="post" action="/admin/logout" style="margin:0;"><button class="btn small" type="submit">Sign out</button></form>
      </div>
    </div>

    <div class="tabs" role="tablist">
      <button class="tab" role="tab" type="button" data-tab="drop" aria-controls="panel-drop" aria-selected="true">Drop</button>
      <button class="tab" role="tab" type="button" data-tab="catalog" aria-controls="panel-catalog" aria-selected="false">Catalog</button>
      <button class="tab" role="tab" type="button" data-tab="kyd" aria-controls="panel-kyd" aria-selected="false">KYD</button>
      <button class="tab" role="tab" type="button" data-tab="vault" aria-controls="panel-vault" aria-selected="false">Vault</button>
      <button class="tab" role="tab" type="button" data-tab="analytics" aria-controls="panel-analytics" aria-selected="false">Analytics</button>
      <button class="tab" role="tab" type="button" data-tab="settings" aria-controls="panel-settings" aria-selected="false">Settings</button>
    </div>

    <div class="tabpanel" id="panel-drop" role="tabpanel">
      <div class="card card-stack">
        <section class="card-section">
          <div class="card-section-header">
            <h3>Drop controls</h3>
            <p class="meta">Launch, schedule, or end a release.</p>
          </div>
          <div class="row">
            <div hidden>
              <label>Admin session</label>
              <input id="adminKey" type="password" placeholder="Signed in" autocomplete="off" />
            </div>
            <div>
              <label>Start time (local)</label>
              <input id="startAt" type="datetime-local" />
              <div class="form-note">Leave blank to launch immediately.</div>
            </div>
            <div>
              <label>End time (local)</label>
              <input id="endAt" type="datetime-local" />
              <div class="form-note" id="durNote">Ends 2h after it starts.</div>
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
            <div class="muted">Loading&hellip;</div>
          </div>
        </section>
        <section class="card-section">
          <div class="card-section-header">
            <h3>Vault-ready products</h3>
            <p class="meta">Recently live items still within the Save window. <span id="vaultReadyInfo"></span></p>
          </div>
          <div class="card-surface">
            <div class="list" id="vaultReadyList">
              <div class="muted">Loading&hellip;</div>
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
              <div class="muted">Loading&hellip;</div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <div class="tabpanel" id="panel-catalog" role="tabpanel" hidden>
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
                <div><label>Image URLs (optional, one per line — front, back, detail)</label><textarea id="np_image" rows="3" placeholder="/uploads/tee-front.png&#10;/uploads/tee-back.png"></textarea></div>
                <div><label>Tags (comma separated)</label><input id="np_tags" placeholder="T-Shirt, Essentials" /></div>
              </div>
              <div class="btnline">
                <input id="np_upload" type="file" accept="image/*" multiple style="display:none" />
                <button class="btn" id="btnUploadProdImage" type="button">Upload images</button>
                <button class="btn primary" id="btnAddProd" type="button">Add product</button>
              </div>
              <div class="form-note" id="np_status"></div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <div class="tabpanel" id="panel-kyd" role="tabpanel" hidden>
      <div class="card card-stack">
        <section class="card-section">
          <div class="card-section-header">
            <h3>KYD pages</h3>
            <p class="meta">Live dates, music and visuals. Changes go live as soon as you save.</p>
          </div>
          <div class="btnline" style="margin-bottom:14px">
            <button class="btn primary" id="btnKydSave" type="button">Save KYD content</button>
            <button class="btn" id="btnKydReload" type="button">Discard changes</button>
            <span class="form-note" id="kydStatus"></span>
          </div>

          <div class="section-title">Live dates</div>
          <div id="kydShows" class="kyd-rows"></div>
          <div class="btnline"><button class="btn small" data-kyd-add="shows" type="button">Add a date</button></div>

          <div class="section-title">Music</div>
          <div id="kydProjects" class="kyd-rows"></div>
          <div class="btnline"><button class="btn small" data-kyd-add="projects" type="button">Add a release</button></div>

          <div class="section-title">Visuals</div>
          <div id="kydVisuals" class="kyd-rows"></div>
          <div class="btnline"><button class="btn small" data-kyd-add="visuals" type="button">Add a visual</button></div>

          <div class="section-title">Booking</div>
          <div class="kyd-field" style="max-width:420px;margin-bottom:14px">
            <label>Photo URL</label>
            <input id="kydPhoto" type="text" placeholder="https://res.cloudinary.com/..." />
          </div>

          <div class="subheading">Available for</div>
          <div id="kydServices" class="kyd-rows"></div>
          <div class="btnline"><button class="btn small" data-kydb-add="services" type="button">Add a service</button></div>

          <div class="subheading">Contacts</div>
          <div id="kydContacts" class="kyd-rows"></div>
          <div class="btnline"><button class="btn small" data-kydb-add="contacts" type="button">Add a contact</button></div>

          <div class="subheading">Links</div>
          <div id="kydLinks" class="kyd-rows"></div>
          <div class="btnline"><button class="btn small" data-kydb-add="links" type="button">Add a link</button></div>
        </section>
      </div>
    </div>

    <div class="tabpanel" id="panel-vault" role="tabpanel" hidden>
      <div class="card card-stack">
        <section class="card-section">
          <div class="card-section-header">
            <h3>Vault</h3>
            <p class="meta">Products people can still save after a drop ends. Hide one to pull it out early, or change how long it stays.</p>
          </div>
          <div class="form-note" id="vaultWindowNote"></div>
          <div id="vaultList" class="vault-list"><div class="muted">Loading&hellip;</div></div>
        </section>
      </div>
    </div>

    <div class="tabpanel" id="panel-analytics" role="tabpanel" hidden>
      <div class="card card-stack">
        <section class="card-section">
          <div class="card-section-header">
            <h3>Drop history</h3>
            <p class="meta">Recent drops and their top-performing products.</p>
          </div>
          <div id="dropHistoryWrap" class="drop-history-grid card-surface">
            <div class="muted">Loading&hellip;</div>
          </div>
        </section>
        <section class="card-section">
          <div class="card-section-header">
            <h3>Compare drops</h3>
            <p class="meta">Stacked revenue and sell-through for the latest releases.</p>
          </div>
          <div id="dropCompareWrap" class="drop-compare-grid card-surface">
            <div class="muted">Loading&hellip;</div>
          </div>
        </section>
        <section class="card-section">
          <div class="card-section-toolbar">
            <div class="card-section-header">
              <h3>Recent sales</h3>
              <p class="meta">Last 200 orders, newest first.</p>
            </div>
            <div class="btnline">
              <button class="btn" id="btnDownloadSalesCsv" type="button">Download CSV</button>
            </div>
          </div>
          <div id="salesWrap" class="card-surface">
            <div class="muted">Loading&hellip;</div>
          </div>
        </section>
      </div>
    </div>

    <div class="tabpanel" id="panel-settings" role="tabpanel" hidden>
      <div class="card card-stack">
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
            <h3>System state</h3>
            <p class="meta">Realtime diagnostics and demand forecasting.</p>
          </div>
          <div class="card-surface stack">
            <details class="raw">
              <summary>State</summary>
              <pre id="out">Click "Refresh state"</pre>
            </details>
            <details class="raw">
              <summary>Predictions</summary>
              <pre id="pred">Loading...</pre>
            </details>
          </div>
        </section>
      </div>
    </div>

  </div>

<script>
(() => {
  // ── Tabs ───────────────────────────────────────────────────────────────────
  (() => {
    const tabs = [...document.querySelectorAll(".tab")];
    if (!tabs.length) return;
    const show = (name) => {
      let matched = false;
      for (const tab of tabs) {
        const on = tab.dataset.tab === name;
        if (on) matched = true;
        tab.setAttribute("aria-selected", on ? "true" : "false");
        const panel = document.getElementById("panel-" + tab.dataset.tab);
        if (panel) panel.hidden = !on;
      }
      if (!matched) return false;
      try { localStorage.setItem("nc_admin_tab", name); } catch {}
      return true;
    };
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        show(tab.dataset.tab);
        // Countdown only ticks while the panel is on screen.
        if (tab.dataset.tab === "vault") {
          if (typeof refreshVault === "function") void refreshVault();
        } else if (tab.dataset.tab === "kyd") {
          if (typeof refreshKyd === "function") void refreshKyd();
        } else if (typeof vaultTimer !== "undefined" && vaultTimer) {
          clearInterval(vaultTimer);
          vaultTimer = null;
        }
      });
    }
    let saved = null;
    try { saved = localStorage.getItem("nc_admin_tab"); } catch {}
    if (!saved || !show(saved)) show(tabs[0].dataset.tab);
    if (saved === "vault") {
      // The panel is already open on load, so populate it.
      setTimeout(() => { if (typeof refreshVault === "function") void refreshVault(); }, 0);
    } else if (saved === "kyd") {
      setTimeout(() => { if (typeof refreshKyd === "function") void refreshKyd(); }, 0);
    }
  })();

  const PLACEHOLDER_IMG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='12' ry='12' fill='%23141414'/%3E%3Cpath d='M26 62l12-16 10 12 8-10 14 18H26z' fill='%23333333'/%3E%3Ccircle cx='36' cy='34' r='6' fill='%23333333'/%3E%3C/svg%3E";

  const keyInput = document.getElementById("adminKey");
  const productList = document.getElementById("productList");
  const statePre = document.getElementById("out");
  const predPre = document.getElementById("pred");
  const salesWrap = document.getElementById("salesWrap");
  const downloadSalesCsvBtn = document.getElementById("btnDownloadSalesCsv");
  const dropCurrentWrap = document.getElementById("dropCurrentWrap");
  const dropHistoryWrap = document.getElementById("dropHistoryWrap");
  const dropCompareWrap = document.getElementById("dropCompareWrap");
  const vaultReadyList = document.getElementById("vaultReadyList");
  const vaultReadyInfo = document.getElementById("vaultReadyInfo");
  const vaultSavesList = document.getElementById("vaultSavesList");
  const newProductTags = document.getElementById("np_tags");
  const newProductIdInput = document.getElementById("np_id");
  const newProductImageInput = document.getElementById("np_image");
  const newProductUploadInput = document.getElementById("np_upload");
  const newProductUploadButton = document.getElementById("btnUploadProdImage");
  const newProductStatus = document.getElementById("np_status");

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
    if (key) window.localStorage.setItem("nc_admin_key", key);
    return key;
  }

  async function apiJson(path, init = {}) {
    const key = requireKey();
    const headers = new Headers(init.headers || {});
    if (key) headers.set("x-admin-key", key);
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

  async function downloadAdminFile(path, fallbackName) {
    const key = requireKey();
    const headers = new Headers({ Accept: "text/csv" });
    if (key) headers.set("x-admin-key", key);
    const res = await fetch(path, { headers });
    if (!res.ok) {
      let message = res.statusText || "Download failed";
      try {
        const data = await res.json();
        if (data && data.error) message = data.error;
      } catch (_error) {
        // ignore non-JSON response bodies
      }
      throw new Error(message);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match && match[1] ? match[1] : fallbackName;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  var SITE_ORIGIN = ${JSON.stringify(
    (process.env.FRONTEND_ORIGIN || process.env.FRONTEND_ORIGIN_2 || "").trim().replace(/\/+$/, ""),
  )};

  /** The link a fan should get: the public site when we know it, else this host. */
  function productShareUrl(id) {
    return (SITE_ORIGIN || window.location.origin) + "/p/" + encodeURIComponent(id);
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

      // The shareable link exists as soon as the product does — you should not
      // have to wait for a drop to go live to get hold of it.
      const btnLink = document.createElement("button");
      btnLink.className = "btn small";
      btnLink.type = "button";
      btnLink.textContent = "Copy link";
      btnLink.addEventListener("click", async () => {
        const url = productShareUrl(p.id);
        try {
          await navigator.clipboard.writeText(url);
          btnLink.textContent = "Copied";
        } catch {
          // Clipboard blocked (usually a non-secure origin) — show it instead.
          window.prompt("Product link:", url);
          btnLink.textContent = "Copy link";
          return;
        }
        setTimeout(() => { btnLink.textContent = "Copy link"; }, 1600);
      });

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn small danger";
      btnDelete.type = "button";
      btnDelete.textContent = "Delete";
      btnDelete.addEventListener("click", () => handleDelete(p.id));

      actions.appendChild(uploadInput);
      actions.appendChild(btnUpload);
      actions.appendChild(btnLink);
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

  async function handleUpload(productId, input, options = {}) {
    const { skipPatchOnMissing = false, refresh = true } = options;
    try {
      requireKey();
      if (!input.files || !input.files.length) return null;
      const fd = new FormData();
      for (const file of Array.from(input.files)) fd.append("files", file);
      const res = await fetch("/api/admin/upload-images", {
        method: "POST",
        headers: { "x-admin-key": getKey() },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      const urls = Array.isArray(data.urls) ? data.urls.filter(Boolean) : [];
      if (!res.ok || !urls.length) {
        throw new Error(data.error || "Upload failed");
      }
      data.url = urls[0];
      let patched = false;
      if (options.patch !== false) {
        try {
          // Append to whatever gallery the product already has rather than
          // replacing it, so uploading a back shot keeps the front one.
          const existing = (products.find(function (p) { return p.id === productId; }) || {}).images || [];
          const merged = existing.slice();
          for (const url of urls) if (!merged.includes(url)) merged.push(url);
          await apiJson("/api/admin/products/" + encodeURIComponent(productId), {
            method: "PATCH",
            body: { images: merged },
          });
          patched = true;
        } catch (err) {
          const message = typeof err?.message === "string" ? err.message.toLowerCase() : "";
          const skip = skipPatchOnMissing && message.includes("not found");
          if (!skip) {
            throw err;
          }
        }
      }
      if (patched && refresh) {
        await refreshProducts();
      }
      if (typeof options.onUploaded === "function") {
        options.onUploaded(data.url, patched);
      }
      return { url: data.url, urls: urls, patched: patched };
    } catch (err) {
      alert(err.message || String(err));
      return null;
    } finally {
      input.value = "";
    }
  }

  if (newProductUploadButton && newProductUploadInput) {
    newProductUploadButton.addEventListener("click", () => {
      try {
        requireKey();
      } catch {
        return;
      }
      const productId = newProductIdInput ? newProductIdInput.value.trim() : "";
      if (!productId) {
        alert("Enter the product ID first so the image can be linked.");
        return;
      }
      newProductUploadInput.click();
    });

    newProductUploadInput.addEventListener("change", async () => {
      if (!newProductUploadInput.files || !newProductUploadInput.files.length) return;
      const productId = newProductIdInput ? newProductIdInput.value.trim() : "";
      if (!productId) {
        alert("Enter the product ID first so the image can be linked.");
        newProductUploadInput.value = "";
        return;
      }
      if (newProductStatus) {
        newProductStatus.textContent = "";
      }
      const result = await handleUpload(productId, newProductUploadInput, {
        skipPatchOnMissing: true,
        refresh: false,
      });
      if (!result) {
        return;
      }
      var uploaded = result.urls && result.urls.length ? result.urls : [result.url];
      if (newProductImageInput) {
        // Append rather than replace, so a second upload adds the back shot
        // instead of throwing away the front one.
        var existing = newProductImageInput.value
          .split(/[\\r\\n,]/)
          .map(function (line) { return line.trim(); })
          .filter(Boolean);
        uploaded.forEach(function (url) {
          if (existing.indexOf(url) === -1) existing.push(url);
        });
        newProductImageInput.value = existing.join("\\n");
      }
      if (newProductStatus) {
        var count = uploaded.length;
        var noun = count === 1 ? "Image" : count + " images";
        newProductStatus.textContent = result.patched
          ? noun + " uploaded and product updated."
          : noun + " uploaded. Complete the product details and click Add product to create it.";
      }
      if (result.patched) {
        await refreshProducts();
      }
    });
  }

  // ---------- KYD pages ----------
  // Edits are held locally and written in one PUT, so a half-finished row
  // never reaches the live site.
  var kydDraft = null;

  var KYD_FIELDS = {
    shows: [
      { key: "title", label: "Title", w: 2 },
      { key: "date", label: "Date", type: "date" },
      { key: "city", label: "City" },
      { key: "venue", label: "Venue" },
      { key: "poster", label: "Poster URL", w: 2 },
      { key: "tickets", label: "Tickets URL", w: 2 },
      { key: "info", label: "Info URL", w: 2 }
    ],
    projects: [
      { key: "title", label: "Title", w: 2 },
      { key: "year", label: "Year" },
      { key: "image", label: "Cover URL", w: 2 },
      { key: "listen", label: "Listen URL", w: 2 },
      { key: "video", label: "Video URL", w: 2 }
    ],
    visuals: [
      { key: "title", label: "Title", w: 2 },
      { key: "year", label: "Year" },
      { key: "image", label: "Image URL", w: 2 },
      { key: "url", label: "Link URL", w: 2 }
    ]
  };

  var KYD_TARGET = { shows: "kydShows", projects: "kydProjects", visuals: "kydVisuals" };

  function kydSetStatus(text, isError) {
    var el = document.getElementById("kydStatus");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isError ? "#e08585" : "";
  }

  function renderKydSection(section) {
    var wrap = document.getElementById(KYD_TARGET[section]);
    if (!wrap || !kydDraft) return;
    var rows = kydDraft[section] || [];
    if (!rows.length) {
      wrap.innerHTML = '<div class="muted">Nothing here yet.</div>';
      return;
    }
    wrap.innerHTML = rows.map(function (row, i) {
      var fields = KYD_FIELDS[section].map(function (f) {
        var value = row[f.key] == null ? "" : String(row[f.key]);
        return '<div class="kyd-field"' + (f.w === 2 ? ' style="grid-column:span 2"' : "") + '>' +
          "<label>" + escapeHtml(f.label) + "</label>" +
          '<input type="' + (f.type || "text") + '"' +
            ' data-kyd-section="' + section + '" data-kyd-index="' + i + '" data-kyd-key="' + f.key + '"' +
            ' value="' + escapeHtml(value) + '" />' +
        "</div>";
      }).join("");
      var slug = row.slug || row.id || "";
      return '<div class="kyd-row">' +
        '<div class="kyd-grid">' + fields + "</div>" +
        '<div class="kyd-row__foot">' +
          '<span class="kyd-row__slug">' + (slug ? escapeHtml(slug) : "new — id set on save") + "</span>" +
          '<span>' +
            '<button class="btn" data-kyd-move="' + section + ':' + i + ':-1" type="button">Up</button> ' +
            '<button class="btn" data-kyd-move="' + section + ':' + i + ':1" type="button">Down</button> ' +
            '<button class="btn" data-kyd-del="' + section + ':' + i + '" type="button">Remove</button>' +
          "</span>" +
        "</div>" +
      "</div>";
    }).join("");
  }

  var KYD_BOOKING_FIELDS = {
    contacts: [
      { key: "label", label: "Label" },
      { key: "email", label: "Email", type: "email", w: 2 }
    ],
    links: [
      { key: "label", label: "Label" },
      { key: "href", label: "URL", w: 2 }
    ]
  };
  var KYDB_TARGET = { services: "kydServices", contacts: "kydContacts", links: "kydLinks" };

  function bookingDraft() {
    if (!kydDraft) return null;
    if (!kydDraft.booking || typeof kydDraft.booking !== "object") kydDraft.booking = {};
    var b = kydDraft.booking;
    if (!Array.isArray(b.services)) b.services = [];
    if (!Array.isArray(b.contacts)) b.contacts = [];
    if (!Array.isArray(b.links)) b.links = [];
    return b;
  }

  function renderBookingList(list) {
    var wrap = document.getElementById(KYDB_TARGET[list]);
    var b = bookingDraft();
    if (!wrap || !b) return;
    var rows = b[list];
    if (!rows.length) {
      wrap.innerHTML = '<div class="muted">Nothing here yet.</div>';
      return;
    }
    wrap.innerHTML = rows.map(function (row, i) {
      var fields;
      if (list === "services") {
        // Services are plain strings, so the input holds the value itself.
        fields = '<div class="kyd-field" style="grid-column:span 2">' +
          "<label>Service</label>" +
          '<input type="text" data-kydb-list="services" data-kydb-index="' + i + '"' +
          ' value="' + escapeHtml(row == null ? "" : String(row)) + '" /></div>';
      } else {
        fields = KYD_BOOKING_FIELDS[list].map(function (f) {
          var value = row && row[f.key] != null ? String(row[f.key]) : "";
          return '<div class="kyd-field"' + (f.w === 2 ? ' style="grid-column:span 2"' : "") + ">" +
            "<label>" + escapeHtml(f.label) + "</label>" +
            '<input type="' + (f.type || "text") + '"' +
              ' data-kydb-list="' + list + '" data-kydb-index="' + i + '" data-kydb-key="' + f.key + '"' +
              ' value="' + escapeHtml(value) + '" /></div>';
        }).join("");
      }
      return '<div class="kyd-row">' +
        '<div class="kyd-grid">' + fields + "</div>" +
        '<div class="kyd-row__foot"><span class="kyd-row__slug"></span><span>' +
          '<button class="btn" data-kydb-move="' + list + ":" + i + ':-1" type="button">Up</button> ' +
          '<button class="btn" data-kydb-move="' + list + ":" + i + ':1" type="button">Down</button> ' +
          '<button class="btn" data-kydb-del="' + list + ":" + i + '" type="button">Remove</button>' +
        "</span></div></div>";
    }).join("");
  }

  function renderBooking() {
    var b = bookingDraft();
    if (!b) return;
    var photo = document.getElementById("kydPhoto");
    if (photo && document.activeElement !== photo) photo.value = b.photo || "";
    renderBookingList("services");
    renderBookingList("contacts");
    renderBookingList("links");
  }

  function renderKyd() {
    renderKydSection("shows");
    renderKydSection("projects");
    renderKydSection("visuals");
    renderBooking();
  }

  async function refreshKyd() {
    try {
      kydDraft = await apiJson("/api/admin/kyd");
      renderKyd();
      kydSetStatus("");
    } catch (err) {
      kydSetStatus(err.message || String(err), true);
    }
  }

  // Typing only touches the draft; nothing is sent until Save.
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (!el || !el.getAttribute) return;

    if (el.id === "kydPhoto") {
      var bp = bookingDraft();
      if (bp) { bp.photo = el.value; kydSetStatus("Unsaved changes."); }
      return;
    }

    var blist = el.getAttribute("data-kydb-list");
    if (blist) {
      var bd = bookingDraft();
      if (!bd) return;
      var bi = Number(el.getAttribute("data-kydb-index"));
      var bkey = el.getAttribute("data-kydb-key");
      if (blist === "services") bd.services[bi] = el.value;
      else if (bd[blist] && bd[blist][bi]) bd[blist][bi][bkey] = el.value;
      kydSetStatus("Unsaved changes.");
      return;
    }

    if (!el.getAttribute("data-kyd-section")) return;
    if (!kydDraft) return;
    var section = el.getAttribute("data-kyd-section");
    var index = Number(el.getAttribute("data-kyd-index"));
    var key = el.getAttribute("data-kyd-key");
    if (!kydDraft[section] || !kydDraft[section][index]) return;
    kydDraft[section][index][key] = el.value;
    kydSetStatus("Unsaved changes.");
  });

  document.addEventListener("click", async function (e) {
    if (!e.target.closest) return;

    var add = e.target.closest("[data-kyd-add]");
    if (add) {
      if (!kydDraft) return;
      var section = add.getAttribute("data-kyd-add");
      var blank = { title: "" };
      if (section === "shows") blank.date = "";
      else blank.year = String(new Date().getFullYear());
      kydDraft[section] = (kydDraft[section] || []).concat([blank]);
      renderKydSection(section);
      kydSetStatus("Unsaved changes.");
      return;
    }

    var del = e.target.closest("[data-kyd-del]");
    if (del) {
      if (!kydDraft) return;
      var parts = del.getAttribute("data-kyd-del").split(":");
      var sec = parts[0], idx = Number(parts[1]);
      var row = (kydDraft[sec] || [])[idx];
      if (row && row.title && !confirm("Remove " + row.title + "?")) return;
      kydDraft[sec].splice(idx, 1);
      renderKydSection(sec);
      kydSetStatus("Unsaved changes.");
      return;
    }

    var badd = e.target.closest("[data-kydb-add]");
    if (badd) {
      var bl = badd.getAttribute("data-kydb-add");
      var bdA = bookingDraft();
      if (!bdA) return;
      bdA[bl].push(bl === "services" ? "" : bl === "contacts" ? { label: "", email: "" } : { label: "", href: "" });
      renderBookingList(bl);
      kydSetStatus("Unsaved changes.");
      return;
    }

    var bdel = e.target.closest("[data-kydb-del]");
    if (bdel) {
      var dp = bdel.getAttribute("data-kydb-del").split(":");
      var bdD = bookingDraft();
      if (!bdD) return;
      bdD[dp[0]].splice(Number(dp[1]), 1);
      renderBookingList(dp[0]);
      kydSetStatus("Unsaved changes.");
      return;
    }

    var bmove = e.target.closest("[data-kydb-move]");
    if (bmove) {
      var bmp = bmove.getAttribute("data-kydb-move").split(":");
      var bdM = bookingDraft();
      if (!bdM) return;
      var blist2 = bdM[bmp[0]], bfrom = Number(bmp[1]), bto = bfrom + Number(bmp[2]);
      if (bto < 0 || bto >= blist2.length) return;
      var swap = blist2[bfrom]; blist2[bfrom] = blist2[bto]; blist2[bto] = swap;
      renderBookingList(bmp[0]);
      kydSetStatus("Unsaved changes.");
      return;
    }

    var move = e.target.closest("[data-kyd-move]");
    if (move) {
      if (!kydDraft) return;
      var mp = move.getAttribute("data-kyd-move").split(":");
      var msec = mp[0], mi = Number(mp[1]), dir = Number(mp[2]);
      var list = kydDraft[msec] || [];
      var target = mi + dir;
      if (target < 0 || target >= list.length) return;
      var tmp = list[mi]; list[mi] = list[target]; list[target] = tmp;
      renderKydSection(msec);
      kydSetStatus("Unsaved changes.");
      return;
    }
  });

  var kydSaveBtn = document.getElementById("btnKydSave");
  if (kydSaveBtn) {
    kydSaveBtn.addEventListener("click", async function () {
      if (!kydDraft) return;
      kydSaveBtn.disabled = true;
      kydSetStatus("Saving\u2026");
      try {
        var saved = await apiJson("/api/admin/kyd", { method: "PUT", body: kydDraft });
        // Take back what the server stored, so generated ids show immediately.
        kydDraft = saved.content || kydDraft;
        renderKyd();
        kydSetStatus("Saved.");
      } catch (err) {
        kydSetStatus(err.message || String(err), true);
      } finally {
        kydSaveBtn.disabled = false;
      }
    });
  }

  var kydReloadBtn = document.getElementById("btnKydReload");
  if (kydReloadBtn) {
    kydReloadBtn.addEventListener("click", function () {
      if (kydDraft && !confirm("Discard unsaved changes?")) return;
      void refreshKyd();
    });
  }

  // ---------- Vault ----------
  var vaultRows = [];
  var vaultTimer = null;

  function formatLeft(ms) {
    if (ms === null || ms === undefined) return "\u2014";
    if (ms <= 0) return "expired";
    var mins = Math.floor(ms / 60000);
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h >= 24) {
      var d = Math.floor(h / 24);
      return d + "d " + (h % 24) + "h";
    }
    if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
    var secs = Math.floor((ms % 60000) / 1000);
    return m + "m " + String(secs).padStart(2, "0") + "s";
  }

  function renderVault() {
    var wrap = document.getElementById("vaultList");
    if (!wrap) return;
    if (!vaultRows.length) {
      wrap.innerHTML = '<div class="muted">Nothing has been in the vault yet. Products land here once a drop they were in ends.</div>';
      return;
    }
    var now = Date.now();
    wrap.innerHTML = vaultRows.map(function (r) {
      // Recompute from the expiry so the countdown ticks without refetching.
      var left = r.expiresAt ? new Date(r.expiresAt).getTime() - now : null;
      var live = !r.hiddenByAdmin && left !== null && left > 0;
      var chip = r.hiddenByAdmin
        ? '<span class="vault-chip out">Hidden</span>'
        : live
          ? '<span class="vault-chip in">In vault</span>'
          : '<span class="vault-chip out">Expired</span>';
      var custom = r.customExpiry ? '<span class="vault-chip custom">Custom</span>' : "";
      return '<div class="vault-row' + (live ? "" : " is-out") + '">' +
        '<div>' +
          '<div class="vault-row__name">' + escapeHtml(r.title) + chip + custom + '</div>' +
          '<div class="vault-row__id">' + escapeHtml(r.id) + '</div>' +
          '<div class="vault-row__time">Leaves in <b>' + formatLeft(left) + '</b>' +
            (r.expiresAt ? ' \u00b7 ' + new Date(r.expiresAt).toLocaleString() : "") + '</div>' +
        '</div>' +
        '<div class="vault-row__actions">' +
          '<button class="btn" data-vault="' + escapeHtml(r.id) + '" data-act="-60">&minus;1h</button>' +
          '<button class="btn" data-vault="' + escapeHtml(r.id) + '" data-act="60">+1h</button>' +
          '<button class="btn" data-vault="' + escapeHtml(r.id) + '" data-act="1440">+1d</button>' +
          '<button class="btn" data-vault="' + escapeHtml(r.id) + '" data-act="at">Set time</button>' +
          (r.customExpiry ? '<button class="btn" data-vault="' + escapeHtml(r.id) + '" data-act="clear">Reset</button>' : "") +
          '<button class="btn" data-vault="' + escapeHtml(r.id) + '" data-act="' + (r.hiddenByAdmin ? "show" : "hide") + '">' +
            (r.hiddenByAdmin ? "Show" : "Hide") + '</button>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  async function refreshVault() {
    try {
      var data = await apiJson("/api/admin/vault");
      vaultRows = Array.isArray(data.products) ? data.products : [];
      var note = document.getElementById("vaultWindowNote");
      if (note) {
        note.textContent = "Default window: " + Math.round((data.windowMs || 0) / 3600000) +
          "h after a drop ends. Set VAULT_SAVE_WINDOW_HOURS to change it for everything.";
      }
      renderVault();
      if (vaultTimer) clearInterval(vaultTimer);
      vaultTimer = setInterval(renderVault, 1000);
    } catch (err) {
      var w = document.getElementById("vaultList");
      if (w) w.innerHTML = '<div class="muted">' + escapeHtml(err.message || String(err)) + "</div>";
    }
  }

  document.addEventListener("click", async function (e) {
    var btn = e.target.closest ? e.target.closest("[data-vault]") : null;
    if (!btn) return;
    var id = btn.getAttribute("data-vault");
    var act = btn.getAttribute("data-act");
    var body = null;
    if (act === "hide") body = { hidden: true };
    else if (act === "show") body = { hidden: false };
    else if (act === "clear") body = { expiresAt: null };
    else if (act === "at") {
      var current = (vaultRows.find(function (r) { return r.id === id; }) || {}).expiresAt;
      var suggested = current ? new Date(current).toISOString().slice(0, 16) : "";
      var input = prompt("Leave the vault at (YYYY-MM-DDTHH:MM, local time):", suggested);
      if (!input) return;
      var parsed = new Date(input);
      if (isNaN(parsed.getTime())) { alert("Could not read that date."); return; }
      body = { expiresAt: parsed.toISOString() };
    } else body = { extendMinutes: Number(act) };

    btn.disabled = true;
    try {
      await apiJson("/api/admin/vault/" + encodeURIComponent(id), { method: "PATCH", body: body });
      await refreshVault();
    } catch (err) {
      alert(err.message || String(err));
      btn.disabled = false;
    }
  });

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

  // ---------- Start / end / duration stay in step ----------
  // The API only takes durationMinutes, so the end picker is a nicer way to
  // express the same number: pick a moment, and the minutes follow.
  var startInput = document.getElementById("startAt");
  var endInput = document.getElementById("endAt");
  var durInput = document.getElementById("dur");
  var durNote = document.getElementById("durNote");
  var syncing = false;

  function toLocalInputValue(date) {
    var offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function dropStartDate() {
    // Blank start means "launch immediately", so measure from now.
    if (startInput && startInput.value) {
      var d = new Date(startInput.value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  function describeMinutes(mins) {
    if (!Number.isFinite(mins) || mins <= 0) return "";
    var h = Math.floor(mins / 60);
    var m = Math.round(mins % 60);
    if (h >= 24) {
      var d = Math.floor(h / 24);
      var rem = h % 24;
      return rem ? d + "d " + rem + "h" : d + "d";
    }
    if (h > 0) return h + "h" + (m ? " " + m + "m" : "");
    return m + "m";
  }

  function noteFor(mins, invalid) {
    if (!durNote) return;
    if (invalid) {
      durNote.textContent = "End time must be after the start.";
      durNote.style.color = "#e08585";
      return;
    }
    durNote.style.color = "";
    durNote.textContent = mins > 0 ? "Runs for " + describeMinutes(mins) + "." : "";
  }

  /** Duration changed (or the start moved): move the end to match. */
  function syncEndFromDuration() {
    if (syncing || !endInput || !durInput) return;
    var mins = Number(durInput.value);
    if (!Number.isFinite(mins) || mins <= 0) { noteFor(0); return; }
    syncing = true;
    endInput.value = toLocalInputValue(new Date(dropStartDate().getTime() + mins * 60000));
    syncing = false;
    noteFor(mins);
  }

  /** End picked: derive the minutes the API actually wants. */
  function syncDurationFromEnd() {
    if (syncing || !endInput || !durInput) return;
    if (!endInput.value) { noteFor(Number(durInput.value)); return; }
    var end = new Date(endInput.value);
    if (isNaN(end.getTime())) return;
    var mins = Math.round((end.getTime() - dropStartDate().getTime()) / 60000);
    if (mins <= 0) { noteFor(0, true); return; }
    syncing = true;
    durInput.value = String(mins);
    syncing = false;
    noteFor(mins);
  }

  if (durInput) durInput.addEventListener("input", syncEndFromDuration);
  if (endInput) endInput.addEventListener("input", syncDurationFromEnd);
  // Moving the start slides the whole window, keeping the length.
  if (startInput) startInput.addEventListener("input", syncEndFromDuration);
  syncEndFromDuration();

  /** Minutes to send, preferring an explicitly picked end time. */
  function scheduledMinutes() {
    if (endInput && endInput.value) {
      var end = new Date(endInput.value);
      if (!isNaN(end.getTime())) {
        var mins = Math.round((end.getTime() - dropStartDate().getTime()) / 60000);
        if (mins > 0) return mins;
        return null;
      }
    }
    var typed = Number(durInput ? durInput.value : 120);
    return Number.isFinite(typed) && typed > 0 ? Math.floor(typed) : 120;
  }

  document.getElementById("btnSchedule").addEventListener("click", async () => {
    try {
      const { selected } = buildQtyPayload();
      if (!Object.keys(selected).length) {
        alert("Set at least one quantity above zero.");
        return;
      }
      const startVal = document.getElementById("startAt").value;
      const minutes = scheduledMinutes();
      if (minutes === null) {
        alert("End time must be after the start time.");
        return;
      }
      const startsAt = startVal ? new Date(startVal).toISOString() : "now";
      const body = {
        startsAt,
        durationMinutes: minutes,
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
      const images = document.getElementById("np_image").value
        .split(/[\\r\\n,]/)
        .map(function (line) { return line.trim(); })
        .filter(Boolean);
      const tags = parseTags(newProductTags ? newProductTags.value : "");
      if (newProductStatus) newProductStatus.textContent = "";
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
          images,
          tags,
        },
      });
      document.getElementById("np_id").value = "";
      document.getElementById("np_title").value = "";
      document.getElementById("np_price").value = "";
      document.getElementById("np_image").value = "";
      if (newProductTags) newProductTags.value = "";
      if (newProductStatus) newProductStatus.textContent = "Product saved.";
      dropQty[id] = 0;
      await refreshProducts();
    } catch (err) {
      alert(err.message || String(err));
      if (newProductStatus) {
        newProductStatus.textContent = err.message || String(err);
      }
    }
  });

  if (downloadSalesCsvBtn) {
    downloadSalesCsvBtn.addEventListener("click", async () => {
      try {
        await downloadAdminFile("/api/admin/sales/export.csv", "orders-export.csv");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
  }

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

  refreshProducts();
  refreshState();
  refreshSales();
  loadAutoDrop();
  refreshDrops();
  refreshVaultReady();
  refreshVaultSaves();

  refreshPred();
  setInterval(refreshPred, 15000);
  setInterval(() => {
    refreshDrops();
    refreshVaultReady();
    refreshVaultSaves();
  }, 20000);
})();
</script>
</body>
</html>`);
});

adminUiRouter.get("/saved-data", requireAdminPage, (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>NC Saved Data</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; background:#0b0b0b; color:#e8e8e8; font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .wrap { max-width:1180px; margin:28px auto; padding:0 16px 64px; }
  .top { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; flex-wrap:wrap; margin-bottom:18px; }
  h1 { margin:0; font-size:28px; letter-spacing:-.02em; }
  a { color:#f5f5f5; }
  .muted { color:#909090; font-size:13px; }
  .toolbar { display:flex; gap:8px; align-items:end; flex-wrap:wrap; margin:18px 0; padding:14px; background:#121212; border:1px solid #242424; border-radius:12px; }
  label { display:block; color:#a3a3a3; font-size:12px; margin-bottom:6px; }
  input { min-width:280px; background:#0f0f0f; color:#f5f5f5; border:1px solid #2a2a2a; border-radius:10px; padding:9px 10px; }
  button { background:#f5f5f5; color:#050505; border:1px solid #f5f5f5; border-radius:10px; padding:9px 12px; cursor:pointer; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }
  .card { background:#121212; border:1px solid #242424; border-radius:12px; padding:14px; min-width:0; }
  .card h2 { margin:0 0 10px; font-size:15px; }
  .metric { font-size:28px; font-weight:700; margin:4px 0; }
  .section { margin-top:16px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { padding:8px 6px; border-bottom:1px solid #242424; text-align:left; vertical-align:top; }
  th { color:#bcbcbc; text-transform:uppercase; font-size:10px; letter-spacing:.08em; }
  .scroll { overflow:auto; max-height:420px; }
  .json { white-space:pre-wrap; overflow:auto; max-height:360px; font-size:12px; line-height:1.45; background:#0f0f0f; border:1px solid #242424; border-radius:10px; padding:10px; }
  .thumb { width:44px; height:44px; object-fit:cover; border-radius:8px; background:#1f1f1f; }
  .pill { display:inline-flex; padding:3px 8px; border:1px solid #333; border-radius:999px; color:#cfcfcf; font-size:11px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <h1>Saved Data</h1>
      <div class="muted">Products, uploads, customers, purchases, saves, drops, analytics, and recommendations.</div>
    </div>
    <div style="display:flex;gap:12px;align-items:center;">
      <a href="/admin">Back to admin</a>
      <form method="post" action="/admin/logout" style="margin:0;"><button type="submit">Sign out</button></form>
    </div>
  </div>

  <div class="toolbar">
    <div>
      <label>Admin key override</label>
      <input id="adminKey" type="password" placeholder="Signed in" autocomplete="off" />
    </div>
    <button id="loadBtn" type="button">Load saved data</button>
    <button id="downloadBtn" type="button">Download JSON</button>
    <span id="status" class="muted"></span>
  </div>

  <div id="summary" class="grid"></div>
  <div id="content"></div>
</div>

<script>
(() => {
  const keyInput = document.getElementById("adminKey");
  const loadBtn = document.getElementById("loadBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const statusEl = document.getElementById("status");
  const summaryEl = document.getElementById("summary");
  const contentEl = document.getElementById("content");
  let latest = null;

  const storedKey = window.localStorage.getItem("nc_admin_key");
  if (storedKey) keyInput.value = storedKey;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function money(cents) {
    return "$" + ((Number(cents) || 0) / 100).toFixed(2);
  }

  function dateText(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value);
  }

  function key() {
    const value = keyInput.value.trim();
    if (value) window.localStorage.setItem("nc_admin_key", value);
    return value;
  }

  async function loadData() {
    statusEl.textContent = "Loading...";
    const adminKey = key();
    const headers = { Accept: "application/json" };
    if (adminKey) headers["x-admin-key"] = adminKey;
    const res = await fetch("/api/admin/saved-data", { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load saved data");
    latest = data;
    render(data);
    statusEl.textContent = "Loaded " + dateText(data.generatedAt);
  }

  function renderSummary(data) {
    const totals = data.sales?.totals || {};
    const activeDrop = data.state?.drop;
    const vaultCount = Object.values(data.vault || {}).reduce((sum, row) => sum + Number(row.saves || 0), 0);
    const cards = [
      ["Storage", data.storage?.database || "unknown", "Uploads: " + (data.storage?.uploads || "unknown")],
      ["Products", (data.products || []).length, "Catalog records"],
      ["Uploaded files", (data.uploads || []).length, "Image files on backend disk"],
      ["Customers", (data.customers || []).length, "Registered accounts"],
      ["Orders", (data.sales?.orders || []).length, money(totals.grossCents || 0) + " gross"],
      ["Vault saves", vaultCount, "Active customer save requests"],
      ["Current drop", activeDrop ? activeDrop.status : "none", activeDrop ? activeDrop.id : "No active/scheduled drop"],
      ["Drop history", (data.drops?.history || []).length, "Saved analytics snapshots"],
    ];
    summaryEl.innerHTML = cards.map(([title, metric, note]) =>
      '<div class="card"><h2>' + escapeHtml(title) + '</h2><div class="metric">' +
      escapeHtml(metric) + '</div><div class="muted">' + escapeHtml(note) + '</div></div>'
    ).join("");
  }

  function renderTable(title, headers, rows, emptyText) {
    const head = headers.map((h) => "<th>" + escapeHtml(h) + "</th>").join("");
    const body = rows.length
      ? rows.map((row) => "<tr>" + row.map((cell) => "<td>" + cell + "</td>").join("") + "</tr>").join("")
      : '<tr><td colspan="' + headers.length + '" class="muted">' + escapeHtml(emptyText || "No data") + "</td></tr>";
    return '<section class="section card"><h2>' + escapeHtml(title) + '</h2><div class="scroll"><table><thead><tr>' +
      head + '</tr></thead><tbody>' + body + '</tbody></table></div></section>';
  }

  function render(data) {
    renderSummary(data);
    const products = (data.products || []).map((p) => [
      p.imageUrl ? '<img class="thumb" src="' + escapeHtml(p.imageUrl) + '" />' : "",
      escapeHtml(p.id),
      escapeHtml(p.title),
      money(p.priceCents),
      p.enabled === false ? '<span class="pill">disabled</span>' : '<span class="pill">enabled</span>',
      escapeHtml((p.tags || []).join(", ")),
      escapeHtml(p.imageUrl || ""),
    ]);
    const uploads = (data.uploads || []).map((f) => [
      '<img class="thumb" src="' + escapeHtml(f.url) + '" />',
      '<a href="' + escapeHtml(f.url) + '" target="_blank" rel="noreferrer">' + escapeHtml(f.filename) + "</a>",
      escapeHtml(String(f.sizeBytes || 0)),
      escapeHtml(dateText(f.updatedAt)),
    ]);
    const customers = (data.customers || []).map((u) => [
      escapeHtml(u.email),
      escapeHtml(u.name || ""),
      escapeHtml(u.id),
      escapeHtml(dateText(u.createdAt)),
      escapeHtml(dateText(u.lastLoginAt)),
      '<pre class="json">' + escapeHtml(JSON.stringify(u.defaultShipping || null, null, 2)) + "</pre>",
    ]);
    const orders = (data.sales?.orders || []).map((o) => [
      escapeHtml(dateText(o.ts)),
      escapeHtml(o.orderId),
      escapeHtml(o.customerName || ""),
      escapeHtml(o.customerEmail || ""),
      escapeHtml(String(o.totalItems || 0)),
      money(o.totalCents),
      '<pre class="json">' + escapeHtml(JSON.stringify(o.shippingAddress || null, null, 2)) + "</pre>",
    ]);
    const vault = Object.entries(data.vault || {}).map(([productId, v]) => [
      escapeHtml(productId),
      escapeHtml(String(v.saves || 0)),
      escapeHtml(String(v.threshold || 0)),
      '<pre class="json">' + escapeHtml(JSON.stringify(v.pendingRelease || null, null, 2)) + "</pre>",
      '<pre class="json">' + escapeHtml(JSON.stringify(v.activeRelease || v.lastRelease || null, null, 2)) + "</pre>",
    ]);
    const drops = [data.drops?.current, ...(data.drops?.history || [])].filter(Boolean).map((d) => [
      escapeHtml(d.id),
      escapeHtml(d.status),
      escapeHtml(dateText(d.startedAt || d.scheduledStartsAt)),
      escapeHtml(dateText(d.endedAt || d.scheduledEndsAt)),
      escapeHtml(String(d.totals?.soldQty || 0)),
      money(d.totals?.revenueCents || 0),
      escapeHtml(String(d.totals?.views || 0)),
    ]);

    contentEl.innerHTML =
      renderTable("Products saved in catalog", ["Image", "ID", "Title", "Price", "Status", "Tags", "Image URL"], products, "No products saved") +
      renderTable("Uploaded image files", ["Preview", "Filename", "Bytes", "Updated"], uploads, "No uploads saved") +
      renderTable("Customers", ["Email", "Name", "ID", "Created", "Last login", "Saved shipping"], customers, "No customers saved") +
      renderTable("Orders and purchases", ["Time", "Order", "Name", "Email", "Items", "Total", "Shipping"], orders, "No orders saved") +
      renderTable("Vault saves", ["Product", "Saves", "Threshold", "Pending release", "Release"], vault, "No vault saves saved") +
      renderTable("Drops and analytics", ["Drop", "Status", "Start", "End", "Sold", "Revenue", "Views"], drops, "No drop analytics saved") +
      '<section class="section card"><h2>Current state, predictions, and auto-drop</h2><pre class="json">' +
      escapeHtml(JSON.stringify({
        state: data.state,
        predictions: data.predictions,
        autoDrop: data.autoDrop,
      }, null, 2)) + '</pre></section>';
  }

  loadBtn.addEventListener("click", () => {
    loadData().catch((err) => {
      statusEl.textContent = err.message || String(err);
    });
  });

  downloadBtn.addEventListener("click", () => {
    if (!latest) {
      statusEl.textContent = "Load data before downloading.";
      return;
    }
    const blob = new Blob([JSON.stringify(latest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nc-saved-data-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  loadData().catch((err) => {
    statusEl.textContent = err.message || String(err);
  });
})();
</script>
</body>
</html>`);
});
