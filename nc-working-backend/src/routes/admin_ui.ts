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
  .btn:disabled, .btn[disabled] { opacity:.4; cursor:not-allowed; }
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
  .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
  /* Show merch: settings, per-show pickup, order fulfillment */
  .sm-checklist { list-style:none; margin:0; padding:0; display:grid; gap:6px; font-size:13px; }
  .sm-checklist li { display:flex; gap:8px; align-items:flex-start; line-height:1.45; }
  .sm-checklist .sm-mark { width:14px; flex:none; text-align:center; }
  .sm-checklist .ok .sm-mark { color:#7ee2a8; }
  .sm-checklist .todo .sm-mark { color:#e4c56b; }
  .sm-checklist a { color:inherit; text-decoration:underline; text-decoration-color:rgba(255,255,255,.25); text-underline-offset:3px; }
  .sm-checklist a:hover { text-decoration-color:#fff; }
  .sm-tag { display:inline-block; font-size:10px; letter-spacing:.08em; text-transform:uppercase; padding:1px 7px; border-radius:999px; margin-left:6px; vertical-align:middle; }
  .sm-tag.test { background:#3a2b11; color:#f1c56f; }
  .sm-tag.optional { background:#1f1f1f; color:#9a9a9a; }
  .sm-pill { display:inline-block; font-size:10px; letter-spacing:.08em; text-transform:uppercase; padding:2px 8px; border-radius:999px; white-space:nowrap; }
  .sm-pill.open { background:#14351f; color:#7ee2a8; }
  .sm-pill.closed { background:#3a1111; color:#fecaca; }
  .sm-pill.off { background:#2b2b2b; color:#b9b9b9; }
  .sm-pill.draft { background:#2b2b2b; color:#c8c8c8; }
  .sm-pill.ready { background:#12263a; color:#9ecbff; }
  .sm-pill.selling { background:#14351f; color:#7ee2a8; }
  .sm-pill.dirty { background:#31280f; color:#e4c56b; }
  .sm-pill.approved { background:#14351f; color:#7ee2a8; }
  .sm-pill.changed { background:#31280f; color:#e4c56b; }
  .sm-pill.pending { background:#2b2b2b; color:#b9b9b9; }
  .sm-list { display:grid; gap:8px; }
  .sm-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px 14px; align-items:center; padding:12px 14px; border:1px solid #1f1f1f; border-radius:12px; background:#0f0f0f; }
  .sm-row__name { font-size:14px; font-weight:600; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .sm-row__meta { font-size:12px; color:#9a9a9a; margin-top:3px; line-height:1.5; }
  .sm-row__actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
  .sm-editor-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
  .sm-editor-head input { max-width:360px; font-size:15px; font-weight:600; }
  .sm-editor-head .btnline { align-items:center; }
  .sm-groups { display:grid; gap:8px; }
  .sm-group { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 10px; border:1px solid #1f1f1f; border-radius:10px; background:#0b0b0b; font-size:13px; }
  .sm-group .btn { font-size:11px; padding:5px 10px; }
  .sm-product { border:1px solid #1f1f1f; border-radius:12px; padding:12px 14px; background:#0b0b0b; display:grid; gap:10px; }
  .sm-product__head { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; font-weight:600; font-size:13px; }
  .sm-product .row { grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
  .sm-images { display:grid; gap:8px; }
  .sm-image { display:grid; grid-template-columns:56px minmax(0,1fr) auto; gap:10px; align-items:center; }
  .sm-image img { width:56px; height:56px; object-fit:contain; background:#fff; border-radius:8px; }
  .sm-image__actions { display:flex; gap:4px; }
  .sm-image__actions .btn { padding:4px 8px; font-size:11px; }
  .sm-sizeguide { display:grid; gap:6px; }
  .sm-sizeguide__row { display:grid; grid-template-columns:80px 1fr 1fr auto; gap:6px; align-items:center; }
  .sm-sizeguide__row .btn { padding:5px 8px; font-size:11px; }
  .sm-preview { background:#f2f2ee; color:#111; border-radius:14px; padding:18px; display:grid; gap:18px; font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Helvetica,Arial,sans-serif; }
  .sm-preview h4 { margin:0; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:rgba(17,17,17,.55); }
  .sm-preview__tiles { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); }
  .sm-tile { background:#fff; border:1px solid rgba(0,0,0,.08); border-radius:16px; overflow:hidden; }
  .sm-tile__img { aspect-ratio:4/5; background:#f2f2ee; display:grid; place-items:center; }
  .sm-tile__img img { width:100%; height:100%; object-fit:contain; }
  .sm-tile__body { padding:12px 14px; display:grid; gap:4px; }
  .sm-tile__title { font-weight:700; font-size:15px; }
  .sm-tile__price { font-size:13px; }
  .sm-tile__desc { font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:rgba(17,17,17,.6); }
  .sm-tile__note { font-size:11px; color:rgba(17,17,17,.6); }
  .sm-tile__views { display:flex; gap:6px; flex-wrap:wrap; margin-top:4px; }
  .sm-tile__views span { font-size:10px; letter-spacing:.08em; text-transform:uppercase; border:1px solid rgba(0,0,0,.14); border-radius:999px; padding:2px 8px; }
  .sm-fulfill { display:grid; gap:8px; }
  .sm-fulfill__sub { font-size:12px; color:rgba(17,17,17,.6); }
  .sm-opt { display:flex; gap:12px; align-items:flex-start; padding:14px; border:1.5px solid rgba(0,0,0,.14); border-radius:14px; background:#fff; }
  .sm-opt.is-on { border-color:#111; background:#fafaf8; }
  .sm-opt.is-off { border-style:dashed; background:#f4f4f2; color:rgba(17,17,17,.55); }
  .sm-opt__radio { width:18px; height:18px; border-radius:999px; border:2px solid #111; flex:none; margin-top:2px; }
  .sm-opt.is-on .sm-opt__radio { background:radial-gradient(circle,#111 45%,transparent 50%); }
  .sm-opt.is-off .sm-opt__radio { border-color:rgba(17,17,17,.3); }
  .sm-opt__body { display:grid; gap:4px; font-size:12px; line-height:1.45; }
  .sm-opt__title { font-size:14px; font-weight:600; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .sm-badge { font-size:10px; letter-spacing:.1em; text-transform:uppercase; background:#111; color:#fff; border-radius:999px; padding:2px 8px; }
  .sm-opt.is-off .sm-badge { background:rgba(17,17,17,.35); }
  .sm-preview__banner { font-size:12px; background:#fff3cd; color:#7a5a00; border-radius:10px; padding:8px 12px; }
  .sm-summary { background:#fff; border:1px solid rgba(0,0,0,.08); border-radius:14px; padding:12px 14px; font-size:13px; display:flex; justify-content:space-between; gap:12px; align-items:center; }
  .sm-summary b { font-weight:600; }
  .sm-summary .change { font-size:11px; letter-spacing:.14em; text-transform:uppercase; text-decoration:underline; text-underline-offset:3px; }
  .sm-stats { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); }
  .sm-stat { background:#0b0b0b; border:1px solid #1f1f1f; border-radius:10px; padding:10px 12px; }
  .sm-stat b { display:block; font-size:20px; font-weight:700; }
  .sm-stat span { font-size:11px; color:#9a9a9a; text-transform:uppercase; letter-spacing:.08em; }
  .sm-sticky-save { position:sticky; bottom:0; z-index:2; background:#121212; border-top:1px solid #1f1f1f; padding:10px 0 2px; margin-top:-4px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .kyd-pickup { display:grid; gap:8px; padding:10px 12px; border:1px dashed #262626; border-radius:10px; }
  .kyd-pickup__head { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
  .kyd-field select, .kyd-field textarea { font-size:12px; padding:7px 9px; }
  .kyd-check { display:flex; align-items:center; gap:8px; font-size:12px; color:#d4d4d4; margin:0; cursor:pointer; }
  .kyd-check input { width:auto; accent-color:#f5f5f5; }
  .queue-tabs { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .queue-tabs .btn[aria-pressed="true"] { background:#f5f5f5; color:#000; border-color:#f5f5f5; }
  .queue-tabs select { width:auto; min-width:200px; }
  .queue-tabs input[type="search"] { width:auto; min-width:220px; }
  .order-fulfillment { margin-top:12px; padding:10px 12px; border:1px solid #1f1f1f; border-radius:10px; background:#0b0b0b; display:grid; gap:10px; }
  .order-fulfillment__row { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; }
  .order-fulfillment__row > div { min-width:150px; }
  .order-fulfillment__row input, .order-fulfillment__row select { width:auto; min-width:150px; }
  .order-fulfillment__status { font-size:12px; color:#9ecbff; }
  .order-fulfillment__addr { display:grid; gap:8px; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); }
  .order-fulfillment__addr input { width:100%; min-width:0; }
  .fulfill-chip { display:inline-block; font-size:10px; letter-spacing:.08em; text-transform:uppercase; padding:2px 8px; border-radius:999px; margin:4px 6px 0 0; }
  .fulfill-chip.pickup { background:#31280f; color:#e4c56b; }
  .fulfill-chip.ship { background:#12263a; color:#9ecbff; }
  .fulfill-chip.missed { background:#3a1111; color:#fecaca; }
  .fulfill-chip.done { background:#14351f; color:#7ee2a8; }
  .order-number { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing:.04em; }
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
      <button class="tab" role="tab" type="button" data-tab="showmerch" aria-controls="panel-showmerch" aria-selected="false">Show merch</button>
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

    <div class="tabpanel" id="panel-showmerch" role="tabpanel" hidden>
      <div class="card card-stack">
        <section class="card-section">
          <div class="card-section-toolbar">
            <div class="card-section-header">
              <h3>Show merch</h3>
              <p class="meta">One place for a show, its merch, the pickup and shipping terms, and the drop that sells it. A setup sells nothing until every required field is filled, approved, and it is published.</p>
            </div>
            <div class="btnline">
              <a class="btn small" href="/admin/checkin" target="_blank" rel="noopener">Pickup check-in (phone)</a>
              <button class="btn small primary" id="smNew" type="button">New setup</button>
            </div>
          </div>
          <div id="smLive" class="form-note">Loading&hellip;</div>
          <div id="smList" class="sm-list"><div class="muted">Loading&hellip;</div></div>
        </section>
        <section class="card-section" id="smEditor" hidden>
          <div id="smEditorBody"></div>
        </section>
        <section class="card-section">
          <div class="card-section-header">
            <h3>Sales tax</h3>
            <p class="meta">What checkout does about tax today, and what the owner has to set up to change it.</p>
          </div>
          <div id="smTax" class="card-surface"><div class="muted">Loading&hellip;</div></div>
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
          <p class="form-note" style="margin:0 0 10px">Merch pickup opens for a show only when it&rsquo;s confirmed, has a timezone, is within two calendar months, has pickup on, and its order cutoff hasn&rsquo;t passed. Canceled and past shows never offer pickup.</p>
          <datalist id="kydTimezones">
            <option value="America/New_York"></option>
            <option value="America/Chicago"></option>
            <option value="America/Denver"></option>
            <option value="America/Phoenix"></option>
            <option value="America/Los_Angeles"></option>
            <option value="America/Anchorage"></option>
            <option value="Pacific/Honolulu"></option>
          </datalist>
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
              <h3>Orders</h3>
              <p class="meta">Newest first. Pickup and shipping each have their own queue and status.</p>
            </div>
            <div class="btnline">
              <button class="btn" id="btnDownloadSalesCsv" type="button">Download all orders CSV</button>
            </div>
          </div>
          <div class="card-section-toolbar">
            <div class="queue-tabs" role="group" aria-label="Filter orders by fulfillment">
              <button class="btn small" type="button" data-queue="all" aria-pressed="true">All</button>
              <button class="btn small" type="button" data-queue="pickup" aria-pressed="false">Pickup</button>
              <button class="btn small" type="button" data-queue="ship" aria-pressed="false">Shipping</button>
              <select id="queueShow" aria-label="Pickup show" hidden><option value="">All shows</option></select>
              <input id="orderSearch" type="search" placeholder="Search name, email, order number" aria-label="Search orders" autocomplete="off" />
            </div>
            <div class="btnline">
              <button class="btn small" id="btnExportPickup" type="button">Export pickup list</button>
              <button class="btn small" id="btnExportShipping" type="button">Export shipping queue</button>
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
            <h3>Notifications</h3>
            <p class="meta">Where purchase and cart alerts go, and proof they arrive.</p>
          </div>
          <div class="card-surface stack">
            <div id="notif_state" class="meta">Loading…</div>
            <div class="row">
              <div>
                <label>Send a test to</label>
                <input id="notif_to" type="email" placeholder="Configured address" />
              </div>
            </div>
            <div class="btnline">
              <button class="btn" id="notif_test_purchase" type="button">Test purchase alert</button>
              <button class="btn" id="notif_test_cart" type="button">Test cart alert</button>
              <button class="btn" id="notif_refresh" type="button">Refresh</button>
            </div>
            <div id="notif_result" class="meta"></div>
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
        } else if (tab.dataset.tab === "showmerch") {
          if (typeof refreshShowMerch === "function") void refreshShowMerch();
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
    } else if (saved === "showmerch") {
      setTimeout(() => { if (typeof refreshShowMerch === "function") void refreshShowMerch(); }, 0);
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

  // Merch pickup per show. The pill is the server's verdict on the saved show;
  // edits here take effect on Save.
  var kydShowChecks = {};

  async function refreshKydChecks() {
    try {
      var data = await apiJson("/api/admin/show-merch");
      kydShowChecks = {};
      // A show's pill is the verdict of the setup that sells for it, published first.
      (data.setups || []).slice().sort(function (a, b) { return Number(b.published) - Number(a.published); }).forEach(function (setup) {
        if (setup.showId && setup.pickup && !kydShowChecks[setup.showId]) kydShowChecks[setup.showId] = setup.pickup;
      });
    } catch (_err) {
      // Without the checks the pills just read "Not saved yet"; editing still works.
    }
  }

  function showPickupFields(row, i) {
    var pickup = row.merchPickup || {};
    var check = row.id ? kydShowChecks[row.id] : null;
    var pill = check
      ? '<span class="sm-pill ' + (check.eligible ? "open" : check.closed ? "closed" : "off") + '">' + escapeHtml(check.reason) + "</span>"
      : '<span class="sm-pill off">Not in a show merch setup</span>';
    var status = row.status || "";
    function opt(value, label) {
      return '<option value="' + value + '"' + (status === value ? " selected" : "") + ">" + label + "</option>";
    }
    return '<div class="kyd-pickup">' +
      '<div class="kyd-pickup__head"><span class="subheading" style="margin:0">Merch pickup</span>' + pill + "</div>" +
      '<div class="kyd-grid">' +
        '<div class="kyd-field"><label>Show status</label>' +
          '<select data-kyds-index="' + i + '" data-kyds-key="status">' +
            opt("", "Not set") + opt("confirmed", "Confirmed") + opt("tentative", "Tentative") + opt("canceled", "Canceled") +
          "</select></div>" +
        '<div class="kyd-field"><label>Timezone (where the show is)</label>' +
          '<input type="text" list="kydTimezones" autocomplete="off" data-kyds-index="' + i + '" data-kyds-key="timezone" value="' + escapeHtml(row.timezone || "") + '" /></div>' +
        '<div class="kyd-field"><label>Pickup orders close (show time)</label>' +
          '<input type="datetime-local" data-kydp-index="' + i + '" data-kydp-key="cutoff" value="' + escapeHtml(pickup.cutoff || "") + '" /></div>' +
        '<div class="kyd-field" style="align-self:end"><label class="kyd-check">' +
          '<input type="checkbox" data-kydp-index="' + i + '" data-kydp-key="enabled"' + (pickup.enabled ? " checked" : "") + " /> Offer merch pickup</label></div>" +
        '<div class="kyd-field"><label>Pickup hours (shown up front)</label>' +
          '<input type="text" data-kydp-index="' + i + '" data-kydp-key="hours" value="' + escapeHtml(pickup.hours || "") + '" placeholder="e.g. Merch table, 6–10 pm" /></div>' +
        '<div class="kyd-field"><label>Public pickup location (optional)</label>' +
          '<input type="text" data-kydp-index="' + i + '" data-kydp-key="location" value="' + escapeHtml(pickup.location || "") + '" placeholder="Defaults to venue · city" /></div>' +
      "</div>" +
      '<div class="kyd-field"><label>Pickup instructions (shown to customers exactly as written, up to 500 characters)</label>' +
        '<textarea rows="2" maxlength="500" data-kydp-index="' + i + '" data-kydp-key="instructions">' + escapeHtml(pickup.instructions || "") + "</textarea></div>" +
    "</div>";
  }

  // Selects and checkboxes: handled on change too, for browsers that don't fire input for them.
  function applyShowPickupEdit(el) {
    if (!kydDraft || !Array.isArray(kydDraft.shows)) return false;
    var showIndex = el.getAttribute("data-kyds-index");
    if (showIndex !== null) {
      var show = kydDraft.shows[Number(showIndex)];
      if (show) show[el.getAttribute("data-kyds-key")] = el.value;
      kydSetStatus("Unsaved changes.");
      return true;
    }
    var pickupIndex = el.getAttribute("data-kydp-index");
    if (pickupIndex !== null) {
      var target = kydDraft.shows[Number(pickupIndex)];
      if (!target) return true;
      if (!target.merchPickup) target.merchPickup = { enabled: false };
      var key = el.getAttribute("data-kydp-key");
      target.merchPickup[key] = key === "enabled" ? el.checked : el.value;
      kydSetStatus("Unsaved changes.");
      return true;
    }
    return false;
  }

  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el && el.getAttribute) applyShowPickupEdit(el);
  });

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
        (section === "shows" ? showPickupFields(row, i) : "") +
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
      await refreshKydChecks();
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

    if (applyShowPickupEdit(el)) return;

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
        var typedZones = (kydDraft.shows || []).map(function (s) {
          return { title: s.title, zone: String(s.timezone || "").trim() };
        });
        var saved = await apiJson("/api/admin/kyd", { method: "PUT", body: kydDraft });
        // Take back what the server stored, so generated ids show immediately.
        kydDraft = saved.content || kydDraft;
        await refreshKydChecks();
        renderKyd();
        // An unrecognized timezone is dropped on save; say so rather than let it vanish.
        var lostZones = typedZones.filter(function (t) {
          return t.zone && !(kydDraft.shows || []).some(function (s) { return s.title === t.title && s.timezone === t.zone; });
        });
        kydSetStatus(
          lostZones.length
            ? "Saved, but these timezones weren't recognized and were cleared: " +
                lostZones.map(function (t) { return t.zone + " (" + t.title + ")"; }).join(", ")
            : "Saved.",
          lostZones.length > 0,
        );
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

  // ---------- Show merch setups ----------
  // One setup = one show + its products + the pickup/shipping terms. The list
  // and the editor read the same records the KYD tab, the catalog and the drop
  // controls use; nothing here is a second copy.
  var smOverview = null;
  var smSetup = null;         // the open setup, as the server describes it
  var smShows = [];
  var smCatalog = [];
  var smDraft = null;         // setup fields being edited
  var smShowDraft = null;     // the show's fields being edited (saved to the KYD content)
  var smProductDrafts = {};   // productId -> product fields being edited (saved to the catalog)
  var smDirty = false;
  var smReport = null;
  var smSaving = false;

  var SM_SETUP_FIELDS = ["name", "showId", "productIds", "productCutoffs", "pickupWindowMonths", "pickupBonus", "shippingIncluded", "shippingFeeCents", "shippingCountries", "excludedRegions", "shipsAfterDate", "dispatchEstimate", "missedPickupPolicy"];

  function smClone(value) { return JSON.parse(JSON.stringify(value)); }
  function smMoney(cents) { return "$" + ((Number(cents) || 0) / 100).toFixed(2); }
  function smPid(id) { return encodeURIComponent(id); }
  function smShortDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }

  var smNoteText = "";
  var smNoteError = false;
  function smNote(text, isError) {
    smNoteText = text || "";
    smNoteError = Boolean(isError);
    var el = document.getElementById("smStatusNote");
    if (!el) return;
    el.textContent = smNoteText;
    el.style.color = smNoteError ? "#e08585" : "";
  }

  function smSetDirty(dirty) {
    // An edit after a save makes "Saved" stale.
    if (dirty && !smSaving && smNoteText.indexOf("Saved") === 0) smNote("");
    smDirty = dirty;
    var pill = document.getElementById("smDirtyPill");
    if (pill) pill.hidden = !dirty;
    var save = document.getElementById("smSave");
    if (save) save.disabled = !dirty || smSaving;
    var discard = document.getElementById("smDiscard");
    if (discard) discard.disabled = !dirty || smSaving;
  }

  window.addEventListener("beforeunload", function (e) {
    if (!smDirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  function smPill(status, label) {
    return '<span class="sm-pill ' + status + '">' + escapeHtml(label) + "</span>";
  }

  function smPickupPill(pickup) {
    if (!pickup) return '<span class="sm-pill off">No show chosen</span>';
    return '<span class="sm-pill ' + (pickup.eligible ? "open" : pickup.closed ? "closed" : "off") + '">Pickup: ' + escapeHtml(pickup.reason) + "</span>";
  }

  // ---- overview list
  function renderSmList() {
    var list = document.getElementById("smList");
    var live = document.getElementById("smLive");
    if (!list || !smOverview) return;
    var setups = smOverview.setups || [];
    if (live) {
      var offer = smOverview.live || {};
      var pickup = offer.pickup || {};
      var shipping = offer.shipping || {};
      var parts = [];
      if (!offer.productIds || !offer.productIds.length) {
        parts.push("Nothing is published: the shop sells everything the normal way right now.");
      } else {
        parts.push("Live in the shop: " + offer.productIds.length + " show merch product" + (offer.productIds.length === 1 ? "" : "s") + ".");
        parts.push(pickup.state === "available"
          ? "Pickup open for " + (pickup.shows || []).map(function (s) { return s.name; }).join(", ") + "."
          : "Pickup greyed out: “" + (pickup.message || "") + "”");
        parts.push(shipping.available ? "Shipping open to " + shipping.regionLabel + ", after " + shipping.shipsAfterLabel + "." : "Shipping unavailable.");
      }
      live.textContent = parts.join(" ");
    }
    if (!setups.length) {
      list.innerHTML = '<div class="muted">No setups yet. Create one, pick the show, attach the shirts, fill in pickup and shipping, approve each group, then publish.</div>';
      return;
    }
    list.innerHTML = setups.map(function (s) {
      var meta = [];
      meta.push(s.show ? escapeHtml(s.show.title) + " &middot; " + escapeHtml(s.show.date) + (s.show.location ? " &middot; " + escapeHtml(s.show.location) : "") : "No show chosen");
      meta.push((s.productIds || []).length + " product" + ((s.productIds || []).length === 1 ? "" : "s"));
      if (s.blockers && !s.published) meta.push(s.blockers + " item" + (s.blockers === 1 ? "" : "s") + " before it can launch");
      if (s.copiedFrom) meta.push("Copied from " + escapeHtml(s.copiedFrom));
      return '<div class="sm-row">' +
        '<div><div class="sm-row__name">' + escapeHtml(s.name) + smPill(s.status, s.statusLabel) + smPickupPill(s.pickup) + "</div>" +
        '<div class="sm-row__meta">' + meta.join(" &middot; ") + "</div></div>" +
        '<div class="sm-row__actions">' +
          '<button class="btn small primary" type="button" data-sm-open="' + escapeHtml(s.id) + '">Open</button>' +
          '<button class="btn small" type="button" data-sm-dup="' + escapeHtml(s.id) + '">Duplicate</button>' +
          (s.published ? "" : '<button class="btn small danger" type="button" data-sm-del="' + escapeHtml(s.id) + '">Delete</button>') +
        "</div></div>";
    }).join("");
  }

  function renderSmTax() {
    var box = document.getElementById("smTax");
    if (!box || !smOverview || !smOverview.tax) return;
    var tax = smOverview.tax;
    box.innerHTML = '<div class="sm-row__name">' + smPill(tax.configured ? "selling" : "off", tax.label) + "</div>" +
      '<p class="form-note" style="margin:8px 0 10px">' + escapeHtml(tax.summary) + "</p>" +
      '<div class="subheading">Owner setup, if tax should be added at checkout</div>' +
      '<ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#d4d4d4">' + (tax.ownerSteps || []).map(function (step) { return "<li>" + escapeHtml(step) + "</li>"; }).join("") + "</ol>";
  }

  async function refreshShowMerch() {
    try {
      smOverview = await apiJson("/api/admin/show-merch");
      renderSmList();
      renderSmTax();
      if (smSetup && !smDirty) await smOpen(smSetup.id, true);
    } catch (err) {
      var list = document.getElementById("smList");
      if (list) list.innerHTML = '<div class="muted">' + escapeHtml(err.message || String(err)) + "</div>";
    }
  }

  // ---- open / close
  async function smOpen(id, quiet) {
    if (smDirty && !quiet && !confirm("Discard unsaved changes?")) return;
    if (!quiet || !smSetup || smSetup.id !== id) smNote("");
    try {
      var data = await apiJson("/api/admin/show-merch/setups/" + encodeURIComponent(id));
      smSetup = data.setup;
      smShows = data.shows || [];
      smCatalog = data.catalog || [];
      smDraft = {};
      SM_SETUP_FIELDS.forEach(function (key) { smDraft[key] = smClone(smSetup[key]); });
      smShowDraft = smSetup.show ? {
        title: smSetup.show.title || "", date: smSetup.show.date || "", city: smSetup.show.city || "", venue: smSetup.show.venue || "",
        status: smSetup.show.status || "", timezone: smSetup.show.timezone || "",
        merchPickup: Object.assign({ enabled: false, cutoff: "", hours: "", location: "", instructions: "" }, smSetup.show.merchPickup || {}),
      } : null;
      smProductDrafts = {};
      (smSetup.products || []).forEach(function (p) { if (p) smProductDrafts[p.id] = smProductDraft(p); });
      smReport = null;
      renderSmEditor();
      smSetDirty(false);
      document.getElementById("smEditor").hidden = false;
      if (!quiet) document.getElementById("smEditor").scrollIntoView({ behavior: "smooth", block: "start" });
      smLoadReport();
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  function smProductDraft(p) {
    var guide = p.sizeGuide || { rows: [] };
    return {
      id: p.id,
      title: p.title || "",
      priceDollars: ((p.priceCents || 0) / 100).toFixed(2),
      enabled: p.enabled !== false,
      inventoryMode: p.inventoryMode || "stocked",
      printPlacement: p.printPlacement || "",
      garment: p.garment || "",
      description: p.description || "",
      sizes: Array.isArray(p.sizes) ? p.sizes.join(", ") : "",
      images: (p.images || []).slice(),
      imageLabels: Object.assign({}, p.imageLabels || {}),
      sizeGuideNote: guide.note || "",
      sizeGuideRows: (guide.rows || []).map(function (r) { return { size: r.size || "", chest: r.chest || "", length: r.length || "" }; }),
    };
  }

  function smClose() {
    if (smDirty && !confirm("Discard unsaved changes?")) return;
    smSetup = null;
    smDraft = null;
    smSetDirty(false);
    document.getElementById("smEditor").hidden = true;
    document.getElementById("smEditorBody").innerHTML = "";
  }

  // ---- editor rendering
  function smField(id, label, inputHtml, note) {
    return '<div><label for="' + id + '">' + label + "</label>" + inputHtml + (note ? '<div class="form-note">' + note + "</div>" : "") + "</div>";
  }
  function smInput(id, attr, value, extra) {
    return '<input id="' + id + '" ' + attr + ' value="' + escapeHtml(value == null ? "" : String(value)) + '" ' + (extra || "") + " />";
  }
  function smOption(value, label, current) {
    return '<option value="' + escapeHtml(value) + '"' + (String(current) === String(value) ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }
  function smCheck(id, attr, checked, label) {
    return '<label class="kyd-check" style="font-size:13px;margin-top:6px"><input id="' + id + '" type="checkbox" ' + attr + (checked ? " checked" : "") + " /> " + label + "</label>";
  }

  function smChecklistHtml(items, filter) {
    var rows = items.filter(filter);
    if (!rows.length) return '<div class="muted">Nothing here.</div>';
    return '<ul class="sm-checklist">' + rows.map(function (item) {
      var cls = item.ok && !item.placeholder ? "ok" : "todo";
      var text = escapeHtml(item.label);
      if (item.field) text = '<a href="#' + escapeHtml(item.field) + '" data-sm-goto="' + escapeHtml(item.field) + '">' + text + "</a>";
      return '<li class="' + cls + '"><span class="sm-mark" aria-hidden="true">' + (cls === "ok" ? "&#10003;" : "&#9675;") + "</span>" +
        '<span><span class="sr-only">' + (cls === "ok" ? "Done: " : "To do: ") + "</span>" + text +
        (item.placeholder ? '<span class="sm-tag test">Looks like test text</span>' : "") +
        (!item.required ? '<span class="sm-tag optional">Optional</span>' : "") + "</span></li>";
    }).join("") + "</ul>";
  }

  function smApprovalsHtml() {
    var keys = ["show", "products", "prices", "pickup", "shipping"];
    return '<div class="sm-groups">' + keys.map(function (key) {
      var state = smSetup.approvals[key];
      var label = smSetup.approvalLabels[key];
      var text = state === "approved" ? "Approved" : state === "changed" ? "Changed since approval" : "Not approved";
      return '<div class="sm-group" id="sm-a-' + key + '"><span>' + escapeHtml(label) + " " + smPill(state, text) + "</span>" +
        '<span class="btnline">' +
          (state === "approved"
            ? '<button class="btn" type="button" data-sm-approve="' + key + '" data-sm-approved="0">Withdraw</button>'
            : '<button class="btn primary" type="button" data-sm-approve="' + key + '" data-sm-approved="1">Approve for launch</button>') +
        "</span></div>";
    }).join("") + "</div>";
  }

  function smShowSectionHtml() {
    var options = '<option value="">Choose a show…</option>' + smShows.map(function (s) {
      return smOption(s.id, s.title + " · " + s.date + (s.city ? " · " + s.city : ""), smDraft.showId);
    }).join("");
    var html = '<div class="subheading">Show</div>' +
      '<div class="row">' + smField("sm-f-show", "Which show", '<select id="sm-f-show" data-smf="showId">' + options + "</select>", "Shows are managed under Live dates in the KYD tab. Editing the fields below changes that same show.") + "</div>";
    if (smShowDraft) {
      var d = smShowDraft;
      var p = d.merchPickup;
      html += '<div class="row" style="margin-top:10px">' +
        smField("sm-f-show-title", "Title", smInput("sm-f-show-title", 'type="text" data-sms="title"', d.title)) +
        smField("sm-f-show-date", "Show date", smInput("sm-f-show-date", 'type="date" data-sms="date"', d.date)) +
        smField("sm-f-show-venue", "Venue", smInput("sm-f-show-venue", 'type="text" data-sms="venue"', d.venue)) +
        smField("sm-f-show-city", "City", smInput("sm-f-show-city", 'type="text" data-sms="city"', d.city)) +
        smField("sm-f-show-status", "Show status", '<select id="sm-f-show-status" data-sms="status">' + smOption("", "Not set", d.status) + smOption("confirmed", "Confirmed", d.status) + smOption("tentative", "Tentative", d.status) + smOption("canceled", "Canceled", d.status) + "</select>") +
        smField("sm-f-show-timezone", "Timezone (where the show is)", smInput("sm-f-show-timezone", 'type="text" list="kydTimezones" autocomplete="off" data-sms="timezone"', d.timezone)) +
      "</div>" +
      '<div class="subheading" style="margin-top:14px">Pickup at this show</div>' +
      '<div class="row">' +
        '<div style="align-self:end">' + smCheck("sm-f-pickup-enabled", 'data-smp="enabled"', p.enabled, "Offer merch pickup at this show") + "</div>" +
        smField("sm-f-pickup-cutoff", "Pickup orders close (show time)", smInput("sm-f-pickup-cutoff", 'type="datetime-local" data-smp="cutoff"', p.cutoff), "Keep the printer’s completion date in mind: orders placed before this must be ready at the show.") +
        smField("sm-f-pickup-hours", "Pickup hours (shown up front)", smInput("sm-f-pickup-hours", 'type="text" maxlength="160" data-smp="hours"', p.hours, 'placeholder="e.g. Merch table, 6–10 pm"')) +
        smField("sm-f-pickup-location", "Public pickup location (optional)", smInput("sm-f-pickup-location", 'type="text" maxlength="160" data-smp="location"', p.location, 'placeholder="Defaults to venue · city"'), "Shown as the pickup location. Current: " + escapeHtml(smSetup.show ? smSetup.show.location : "")) +
      "</div>" +
      '<div style="margin-top:10px">' + smField("sm-f-pickup-instructions", "Pickup instructions (extended; shown under “More about pickup” and in the receipt)", '<textarea id="sm-f-pickup-instructions" rows="3" maxlength="500" data-smp="instructions">' + escapeHtml(p.instructions) + "</textarea>", "Up to 500 characters; copied onto each paid order as written.") + "</div>";
    }
    return html;
  }

  function smProductCardHtml(p) {
    var pid = smPid(p.id);
    var cutoff = smDraft.productCutoffs[p.id] || "";
    var images = p.images.map(function (url, i) {
      return '<div class="sm-image">' +
        '<img src="' + escapeHtml(url) + '" alt="" onerror="this.style.visibility=&quot;hidden&quot;" />' +
        '<input type="text" placeholder="Label: Front / Back (blank) / Artwork close-up" maxlength="40" data-smimg="' + escapeHtml(p.id) + '" data-url="' + escapeHtml(url) + '" value="' + escapeHtml(p.imageLabels[url] || "") + '" />' +
        '<div class="sm-image__actions">' +
          '<button class="btn" type="button" data-smimg-move="' + escapeHtml(p.id) + '" data-index="' + i + '" data-dir="-1" title="Move up">&uarr;</button>' +
          '<button class="btn" type="button" data-smimg-move="' + escapeHtml(p.id) + '" data-index="' + i + '" data-dir="1" title="Move down">&darr;</button>' +
          '<button class="btn danger" type="button" data-smimg-del="' + escapeHtml(p.id) + '" data-index="' + i + '">Remove</button>' +
        "</div></div>";
    }).join("");
    var rows = p.sizeGuideRows.map(function (r, i) {
      return '<div class="sm-sizeguide__row">' +
        '<input type="text" placeholder="Size" data-smsg="' + escapeHtml(p.id) + '" data-row="' + i + '" data-key="size" value="' + escapeHtml(r.size) + '" />' +
        '<input type="text" placeholder="Chest (e.g. 20 in)" data-smsg="' + escapeHtml(p.id) + '" data-row="' + i + '" data-key="chest" value="' + escapeHtml(r.chest) + '" />' +
        '<input type="text" placeholder="Length (e.g. 28 in)" data-smsg="' + escapeHtml(p.id) + '" data-row="' + i + '" data-key="length" value="' + escapeHtml(r.length) + '" />' +
        '<button class="btn danger" type="button" data-smsg-del="' + escapeHtml(p.id) + '" data-row="' + i + '">&times;</button>' +
      "</div>";
    }).join("");
    return '<div class="sm-product" data-sm-product="' + escapeHtml(p.id) + '">' +
      '<div class="sm-product__head"><span>' + escapeHtml(p.title || p.id) + ' <span class="id">' + escapeHtml(p.id) + "</span></span>" +
        '<button class="btn small" type="button" data-smprod-remove="' + escapeHtml(p.id) + '">Remove from setup</button></div>' +
      '<div class="row">' +
        smField("sm-p-" + pid + "-title", "Name", smInput("sm-p-" + pid + "-title", 'type="text" data-smpr="' + escapeHtml(p.id) + '" data-key="title"', p.title)) +
        smField("sm-p-" + pid + "-price", "Price (USD)", smInput("sm-p-" + pid + "-price", 'type="number" step="0.01" min="0" data-smpr="' + escapeHtml(p.id) + '" data-key="priceDollars"', p.priceDollars), "Suggested until production quotes are in; approve under Prices when confirmed.") +
        smField("sm-p-" + pid + "-inventory", "Inventory", '<select id="sm-p-' + pid + '-inventory" data-smpr="' + escapeHtml(p.id) + '" data-key="inventoryMode">' + smOption("stocked", "Stocked — units reserved while in a bag", p.inventoryMode) + smOption("made_to_order", "Made to order — no count, no hold timer", p.inventoryMode) + "</select>") +
        smField("sm-p-" + pid + "-print", "Print placement", '<select id="sm-p-' + pid + '-print" data-smpr="' + escapeHtml(p.id) + '" data-key="printPlacement">' + smOption("", "Not set", p.printPlacement) + smOption("front", "Front print (blank back)", p.printPlacement) + smOption("front_back", "Front + back print", p.printPlacement) + "</select>") +
        smField("sm-p-" + pid + "-garment", "Garment (the blank, as verified)", smInput("sm-p-" + pid + "-garment", 'type="text" maxlength="120" data-smpr="' + escapeHtml(p.id) + '" data-key="garment"', p.garment, 'placeholder="e.g. Standard black tee"')) +
        smField("sm-p-" + pid + "-sizes", "Sizes (comma separated; blank = S, M, L, XL)", smInput("sm-p-" + pid + "-sizes", 'type="text" data-smpr="' + escapeHtml(p.id) + '" data-key="sizes"', p.sizes)) +
        smField("sm-f-cutoff-" + pid, "Own pickup cutoff (optional)", smInput("sm-f-cutoff-" + pid, 'type="datetime-local" data-smcut="' + escapeHtml(p.id) + '"', cutoff), "Overrides the show’s cutoff for this product, e.g. a longer production time.") +
        '<div style="align-self:end">' + smCheck("sm-p-" + pid + "-enabled", 'data-smpr="' + escapeHtml(p.id) + '" data-key="enabled"', p.enabled, "Shown in the shop") + "</div>" +
      "</div>" +
      smField("sm-p-" + pid + "-description", "Description", '<textarea id="sm-p-' + pid + '-description" rows="2" maxlength="600" data-smpr="' + escapeHtml(p.id) + '" data-key="description">' + escapeHtml(p.description) + "</textarea>") +
      '<div id="sm-p-' + pid + '-images"><div class="subheading">Images (front, back, artwork close-up)</div>' +
        '<div class="sm-images">' + (images || '<div class="muted">No images yet.</div>') + "</div>" +
        '<div class="btnline" style="margin-top:8px"><input type="file" accept="image/*" multiple style="display:none" data-smimg-file="' + escapeHtml(p.id) + '" />' +
        '<button class="btn small" type="button" data-smimg-up="' + escapeHtml(p.id) + '">Upload images</button></div></div>' +
      '<div id="sm-p-' + pid + '-size-guide"><div class="subheading">Size guide (the blank’s measurements)</div>' +
        '<div class="sm-sizeguide">' + rows + "</div>" +
        '<div class="btnline" style="margin-top:8px"><button class="btn small" type="button" data-smsg-add="' + escapeHtml(p.id) + '">Add size</button></div>' +
        '<div style="margin-top:8px">' + smField("sm-p-" + pid + "-sgnote", "Note (optional)", smInput("sm-p-" + pid + "-sgnote", 'type="text" maxlength="200" data-smpr="' + escapeHtml(p.id) + '" data-key="sizeGuideNote"', p.sizeGuideNote, 'placeholder="e.g. Measured flat, in inches"')) + "</div></div>" +
    "</div>";
  }

  function smProductsSectionHtml() {
    var chosen = smDraft.productIds;
    var picker = smCatalog.map(function (p) {
      return '<label><input type="checkbox" data-smprod-toggle="' + escapeHtml(p.id) + '"' + (chosen.indexOf(p.id) >= 0 ? " checked" : "") + " /><span>" + escapeHtml(p.title) + ' <span class="id">' + escapeHtml(p.id) + " &middot; " + smMoney(p.priceCents) + (p.enabled ? "" : " &middot; hidden") + "</span></span></label>";
    }).join("");
    var cards = chosen.map(function (id) {
      var draft = smProductDrafts[id];
      if (!draft) return '<div class="muted">' + escapeHtml(id) + " is not in the catalog any more.</div>";
      return smProductCardHtml(draft);
    }).join("");
    return '<div class="subheading">Products in this setup</div>' +
      '<div id="sm-f-products" class="sm-products">' + (picker || '<div class="muted">No products in the catalog yet. Add one in the Catalog tab.</div>') + "</div>" +
      '<div class="form-note">Only these products get the pickup / ship-after-the-show choice. Everything else checks out exactly as before, including in a mixed bag.</div>' +
      '<div style="display:grid;gap:10px;margin-top:12px">' + cards + "</div>";
  }

  function smTermsSectionHtml() {
    var d = smDraft;
    return '<div class="subheading">Pickup terms</div>' +
      '<div class="row">' +
        smField("sm-f-bonus", "Pickup bonus", smInput("sm-f-bonus", 'type="text" maxlength="60" data-smf="pickupBonus"', d.pickupBonus, 'placeholder="e.g. Sticker pack"'), "Shown as a badge: “" + escapeHtml(d.pickupBonus ? d.pickupBonus + " included" : "…") + "”. Clear it if a future offer has no bonus.") +
        smField("sm-f-window", "Pickup opens this many calendar months before a show", smInput("sm-f-window", 'type="number" min="1" max="12" data-smf="pickupWindowMonths"', d.pickupWindowMonths)) +
      "</div>" +
      '<div style="margin-top:10px">' + smField("sm-f-missed", "Missed-pickup policy (shown to customers exactly as written)", '<textarea id="sm-f-missed" rows="3" maxlength="500" data-smf="missedPickupPolicy">' + escapeHtml(d.missedPickupPolicy) + "</textarea>", "Staff can later arrange shipping for an uncollected order from the Orders list without charging shipping again.") + "</div>" +
      '<div class="subheading" style="margin-top:14px">Shipping terms</div>' +
      '<div class="row">' +
        '<div style="align-self:end">' + smCheck("sm-f-shipping-included", 'data-smf="shippingIncluded"', d.shippingIncluded, "Standard shipping is included in the price (same price either way)") + "</div>" +
        smField("sm-f-fee", "Delivery fee (USD) when shipping is not included", smInput("sm-f-fee", 'type="number" step="0.01" min="0" data-smf="shippingFeeDollars"', (d.shippingFeeCents / 100).toFixed(2), d.shippingIncluded ? "disabled" : ""), "Ignored while shipping is included."),
        smField("sm-f-countries", "Ships to (country codes, comma separated)", smInput("sm-f-countries", 'type="text" autocomplete="off" data-smf="shippingCountries"', d.shippingCountries.join(", "), 'placeholder="US"')) +
        smField("sm-f-excluded", "Excluded states / regions (codes)", smInput("sm-f-excluded", 'type="text" autocomplete="off" data-smf="excludedRegions"', d.excludedRegions.join(", "), 'placeholder="AK, HI"')) +
        smField("sm-f-ships-after", "Shipping orders go out after", smInput("sm-f-ships-after", 'type="date" data-smf="shipsAfterDate"', d.shipsAfterDate)) +
        smField("sm-f-dispatch", "Dispatch estimate (shown exactly as written)", smInput("sm-f-dispatch", 'type="text" maxlength="300" data-smf="dispatchEstimate"', d.dispatchEstimate, 'placeholder="e.g. Ships within 7 days after the show"'), "Don’t promise a delivery date you can’t keep.") +
      "</div>";
  }

  function smDropSectionHtml() {
    var drop = smSetup.drop;
    var stocked = smDraft.productIds.filter(function (id) { return smProductDrafts[id] && smProductDrafts[id].inventoryMode !== "made_to_order"; });
    var mto = smDraft.productIds.filter(function (id) { return smProductDrafts[id] && smProductDrafts[id].inventoryMode === "made_to_order"; });
    var html = '<div class="subheading">Drop (sales window)</div><div id="sm-f-drop">';
    if (drop && drop.status !== "ended") {
      var inDrop = smDraft.productIds.filter(function (id) { return drop.productIds.indexOf(id) >= 0; });
      var missing = smDraft.productIds.filter(function (id) { return drop.productIds.indexOf(id) < 0; });
      html += '<div class="form-note">' + smPill(drop.status === "live" ? "selling" : "ready", drop.status === "live" ? "Live drop" : "Scheduled drop") +
        " &nbsp;Sales open " + escapeHtml(smShortDate(drop.startsAt)) + " and close <b>" + escapeHtml(smShortDate(drop.endsAt)) + "</b> (the sale deadline). " +
        "Pickup closing does not close shipping sales while this drop is live.</div>" +
        '<div class="form-note">In the drop: ' + (inDrop.length ? inDrop.map(function (id) { return escapeHtml(smProductDrafts[id] ? smProductDrafts[id].title : id); }).join(", ") : "none of this setup’s products") + "</div>";
      if (missing.length && drop.status === "live") {
        html += '<div class="row" style="margin-top:8px">' + missing.map(function (id) {
          var p = smProductDrafts[id];
          return p.inventoryMode === "made_to_order"
            ? '<div><label>' + escapeHtml(p.title) + '</label><div class="form-note">Made to order — joins with no count</div></div>'
            : smField("sm-dq-" + smPid(id), escapeHtml(p.title) + " — units available", smInput("sm-dq-" + smPid(id), 'type="number" min="1" data-smdq="' + escapeHtml(id) + '"', ""));
        }).join("") + "</div>" +
        '<div class="btnline" style="margin-top:8px"><button class="btn" type="button" id="smDropAdd">Add missing products to the live drop</button></div>';
      }
    } else {
      html += '<div class="form-note">No drop is scheduled. The shop only sells during a drop, so schedule one here with this setup’s products (or from the Drop tab). Its end time is the sale deadline, separate from the pickup cutoff and the ships-after date.</div>' +
        '<div class="row" style="margin-top:8px">' +
          smField("sm-drop-start", "Start (local time; blank = now)", smInput("sm-drop-start", 'type="datetime-local"', "")) +
          smField("sm-drop-minutes", "Duration (minutes)", smInput("sm-drop-minutes", 'type="number" min="5"', "10080"), "10080 = 7 days.") +
          stocked.map(function (id) {
            var p = smProductDrafts[id];
            return smField("sm-dq-" + smPid(id), escapeHtml(p.title) + " — units available", smInput("sm-dq-" + smPid(id), 'type="number" min="1" data-smdq="' + escapeHtml(id) + '"', ""));
          }).join("") +
          (mto.length ? '<div><label>Made to order</label><div class="form-note">' + mto.map(function (id) { return escapeHtml(smProductDrafts[id].title); }).join(", ") + " join with no unit count.</div></div>" : "") +
        "</div>" +
        '<div class="btnline" style="margin-top:8px"><button class="btn" type="button" id="smDropSchedule">Schedule the drop</button></div>';
    }
    return html + "</div>";
  }

  function smPreviewHtml() {
    var view = smSetup.customerView || {};
    var pickup = view.pickup || {};
    var shipping = view.shipping || {};
    var hasPlaceholder = (smSetup.checklist || []).some(function (i) { return i.placeholder; });
    var tiles = smDraft.productIds.map(function (id) {
      var p = smProductDrafts[id];
      if (!p) return "";
      var desc = [p.printPlacement === "front_back" ? "Front + back print" : p.printPlacement === "front" ? "Front print · blank back" : "", p.garment].filter(Boolean).join(" · ");
      var views = p.images.map(function (url) { return p.imageLabels[url] || ""; }).filter(Boolean);
      return '<div class="sm-tile"><div class="sm-tile__img">' + (p.images[0] ? '<img src="' + escapeHtml(p.images[0]) + '" alt="" />' : '<span class="muted">No image</span>') + "</div>" +
        '<div class="sm-tile__body"><div class="sm-tile__title">' + escapeHtml(p.title) + '</div><div class="sm-tile__price">$' + escapeHtml(String(Number(p.priceDollars || 0).toFixed(2)).replace(".00", "")) + "</div>" +
        (desc ? '<div class="sm-tile__desc">' + escapeHtml(desc) + "</div>" : "") +
        '<div class="sm-tile__note">' + (p.inventoryMode === "made_to_order" ? "Made to order" : "Stocked") + (p.sizes ? " · Sizes " + escapeHtml(p.sizes) : " · Sizes S / M / L / XL") + "</div>" +
        (views.length ? '<div class="sm-tile__views">' + views.map(function (v) { return "<span>" + escapeHtml(v) + "</span>"; }).join("") + "</div>" : "") +
        "</div></div>";
    }).join("");
    var single = (pickup.shows || [])[0];
    var pickupOn = pickup.state === "available";
    var pickupCard = '<div class="sm-opt ' + (pickupOn ? "is-on" : "is-off") + '"><span class="sm-opt__radio"></span><div class="sm-opt__body">' +
      '<div class="sm-opt__title">' + escapeHtml((view.labels || {}).pickup || "Show pickup") + (view.bonusBadge ? '<span class="sm-badge">' + escapeHtml(view.bonusBadge) + "</span>" : "") + "</div>" +
      (pickupOn && single
        ? "<div><b>" + escapeHtml(single.name) + "</b><br/>" + escapeHtml(single.dateLabel + " · " + single.location) + "</div>" +
          (single.hours ? "<div>Pickup: " + escapeHtml(single.hours) + "</div>" : "") +
          (single.cutoffLabel ? "<div>Pickup orders close " + escapeHtml(single.cutoffLabel) + "</div>" : "") +
          '<div style="text-decoration:underline;text-underline-offset:3px">More about pickup</div>'
        : "<div>" + escapeHtml(pickup.message || "") + "</div>") +
      "</div></div>";
    var shipCard = '<div class="sm-opt ' + (shipping.available ? "" : "is-off") + '"><span class="sm-opt__radio"></span><div class="sm-opt__body">' +
      '<div class="sm-opt__title">' + escapeHtml((view.labels || {}).ship || "Ship after the show") + "</div>" +
      (shipping.available
        ? "<div>Ships after " + escapeHtml(shipping.shipsAfterLabel) + (shipping.dispatchEstimate ? " · " + escapeHtml(shipping.dispatchEstimate) : "") + "</div>" +
          "<div>" + (shipping.included ? "Standard shipping to " + escapeHtml(shipping.regionLabel) + " included." : "Delivery to " + escapeHtml(shipping.regionLabel) + (shipping.feeCents ? " adds " + smMoney(shipping.feeCents) + "." : ".")) + "</div>"
        : "<div>Shipping isn’t available for this item yet.</div>") +
      "</div></div>";
    var summary = pickupOn && single
      ? '<div class="sm-summary"><span><b>' + escapeHtml((view.labels || {}).pickup || "Show pickup") + "</b> · " + escapeHtml(single.name) + " · " + escapeHtml(single.dateLabel) + (view.bonusBadge ? " · " + escapeHtml(view.bonusBadge) : "") + '</span><span class="change">Change</span></div>'
      : shipping.available
        ? '<div class="sm-summary"><span><b>' + escapeHtml((view.labels || {}).ship || "Ship after the show") + "</b> · after " + escapeHtml(shipping.shipsAfterLabel) + " · to " + escapeHtml(shipping.regionLabel) + '</span><span class="change">Change</span></div>'
        : "";
    return '<div class="subheading">Previews (what customers would see if this setup were live)</div>' +
      '<div class="sm-preview">' +
        (hasPlaceholder ? '<div class="sm-preview__banner">Contains labeled test text. Fine for a preview; publishing is blocked until it is replaced.</div>' : "") +
        '<div><h4>Storefront</h4><div class="sm-preview__tiles" style="margin-top:8px">' + (tiles || '<div class="sm-tile__note">No products attached yet.</div>') + "</div></div>" +
        '<div><h4>Bag — how do you want it?</h4><div class="sm-fulfill" style="margin-top:8px"><div class="sm-fulfill__sub">' +
          escapeHtml(view.samePrice ? "Same price with either option." : "Delivery adds " + smMoney(shipping.feeCents || 0) + ".") + "</div>" + pickupCard + shipCard + "</div></div>" +
        (summary ? '<div><h4>Checkout — compact summary</h4><div style="margin-top:8px">' + summary + "</div></div>" : "") +
        '<div class="sm-tile__note">The bag and checkout cards reflect the saved settings; product tiles reflect what is typed above.</div>' +
      "</div>";
  }

  function smReportHtml() {
    if (!smReport) return '<div class="subheading">Orders &amp; production</div><div class="muted">Loading…</div>';
    var r = smReport;
    var stats = [
      ["Pickup orders", r.totals.pickup.orders], ["Pickup items", r.totals.pickup.items], ["Pickup revenue", smMoney(r.totals.pickup.revenueCents)],
      ["Shipping orders", r.totals.ship.orders], ["Shipping items", r.totals.ship.items], ["Shipping revenue", smMoney(r.totals.ship.revenueCents)],
      ["Awaiting pickup", r.progress.awaitingPickup], ["Picked up", r.progress.pickedUp], ["Missed", r.progress.missed],
      ["Awaiting shipment", r.progress.awaitingShipment], ["Shipped", r.progress.shipped],
    ];
    var table = r.products.length
      ? '<table style="margin-top:10px"><thead><tr><th>Product</th><th>Size</th><th>Pickup</th><th>Ship</th><th>Total to produce</th></tr></thead><tbody>' +
        r.products.map(function (p) {
          return p.rows.map(function (row, i) {
            return "<tr>" + (i === 0 ? '<td rowspan="' + (p.rows.length + 1) + '">' + escapeHtml(p.title) + '<div class="id">' + escapeHtml(p.productId) + "</div></td>" : "") +
              "<td>" + escapeHtml(row.size) + "</td><td>" + row.pickup + "</td><td>" + row.ship + "</td><td><b>" + row.total + "</b></td></tr>";
          }).join("") + "<tr><td><b>All sizes</b></td><td>" + p.pickup + "</td><td>" + p.ship + "</td><td><b>" + p.total + "</b></td></tr>";
        }).join("") + "</tbody></table>"
      : '<div class="muted" style="margin-top:8px">No orders yet for this setup.</div>';
    return '<div class="subheading">Orders &amp; production</div>' +
      '<div class="sm-stats">' + stats.map(function (s) { return '<div class="sm-stat"><b>' + escapeHtml(String(s[1])) + "</b><span>" + escapeHtml(s[0]) + "</span></div>"; }).join("") + "</div>" +
      table +
      '<div class="btnline" style="margin-top:10px">' +
        '<button class="btn small" type="button" id="smExportProduction">Export production totals (CSV)</button>' +
        '<button class="btn small" type="button" id="smExportPickup">Export pickup list</button>' +
        '<button class="btn small" type="button" id="smExportShipping">Export shipping queue</button>' +
        '<a class="btn small" href="/admin/checkin' + (smDraft.showId ? "?showId=" + encodeURIComponent(smDraft.showId) : "") + '" target="_blank" rel="noopener">Open check-in</a>' +
      "</div>";
  }

  function renderSmEditor() {
    var body = document.getElementById("smEditorBody");
    if (!body || !smSetup) return;
    var checklist = smSetup.checklist || [];
    var required = checklist.filter(function (i) { return i.required; });
    var doneCount = required.filter(function (i) { return i.ok && !i.placeholder; }).length;
    var blockers = smSetup.blockers || [];
    var statusHtml = smPill(smSetup.status, smSetup.statusLabel) + " " + smPickupPill(smSetup.pickup) +
      (smSetup.published ? "" : ' <span class="muted">' + doneCount + "/" + required.length + " required complete</span>");
    body.innerHTML =
      '<div class="sm-editor-head">' +
        '<div style="flex:1;min-width:240px"><label for="sm-f-name">Setup name</label>' + smInput("sm-f-name", 'type="text" maxlength="80" data-smf="name"', smDraft.name) +
          '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + statusHtml + '<span class="sm-pill dirty" id="smDirtyPill" hidden>Unsaved changes</span></div></div>' +
        '<div class="btnline">' +
          (smSetup.published
            ? '<button class="btn" type="button" id="smPublish" data-published="0">Unpublish</button>'
            : '<button class="btn primary" type="button" id="smPublish" data-published="1"' + (blockers.length ? ' title="' + blockers.length + ' item(s) to fix first"' : "") + ">Publish (approve for launch)</button>") +
          '<button class="btn" type="button" id="smDuplicate">Duplicate as draft</button>' +
          '<button class="btn" type="button" id="smCloseBtn">Close</button>' +
        "</div>" +
      "</div>" +
      '<div class="card-surface stack">' +
        "<div>" +
          '<div class="subheading">Launch checklist</div>' +
          (smSetup.published
            ? '<div class="form-note" style="margin-bottom:8px">Published: the shop reads this setup. Changes save immediately once you click Save; a changed group asks for re-approval but does not unpublish.</div>'
            : '<div class="form-note" style="margin-bottom:8px">Publishing needs every required item done, no test text, and every group approved. Click an item to jump to its field.</div>') +
          (blockers.length ? '<div class="form-note" style="color:#e4c56b;margin-bottom:8px">Blocking publish: ' + blockers.length + " item" + (blockers.length === 1 ? "" : "s") + ".</div>" : "") +
          '<div class="row"><div><div class="form-note" style="margin-bottom:4px">Required</div>' + smChecklistHtml(checklist, function (i) { return i.required; }) + "</div>" +
          '<div><div class="form-note" style="margin-bottom:4px">Optional &amp; info</div>' + smChecklistHtml(checklist, function (i) { return !i.required; }) + "</div></div>" +
          '<div class="subheading" style="margin-top:14px">Approved for launch</div>' +
          '<div class="form-note" style="margin-bottom:8px">“Filled in” is not “approved”. Approve each group after checking it; any later change to those fields withdraws the approval until someone looks again.</div>' +
          smApprovalsHtml() +
        "</div>" +
        "<div>" + smShowSectionHtml() + "</div>" +
        "<div>" + smProductsSectionHtml() + "</div>" +
        "<div>" + smTermsSectionHtml() + "</div>" +
        "<div>" + smDropSectionHtml() + "</div>" +
        "<div>" + smPreviewHtml() + "</div>" +
        '<div id="smReportWrap">' + smReportHtml() + "</div>" +
        (smSetup.published ? "" : '<div><div class="btnline"><button class="btn danger" type="button" id="smDelete">Delete this draft</button></div></div>') +
      "</div>" +
      '<div class="sm-sticky-save">' +
        '<button class="btn primary" type="button" id="smSave" disabled>Save changes</button>' +
        '<button class="btn" type="button" id="smDiscard" disabled>Discard changes</button>' +
        '<span class="form-note" id="smStatusNote" role="status" aria-live="polite"></span>' +
      "</div>";
    smSetDirty(smDirty);
    smNote(smNoteText, smNoteError);
  }

  async function smLoadReport() {
    if (!smSetup) return;
    try {
      var data = await apiJson("/api/admin/show-merch/setups/" + encodeURIComponent(smSetup.id) + "/report");
      smReport = data.report;
      var wrap = document.getElementById("smReportWrap");
      if (wrap) wrap.innerHTML = smReportHtml();
    } catch (_err) {
      var w = document.getElementById("smReportWrap");
      if (w) w.innerHTML = '<div class="subheading">Orders &amp; production</div><div class="muted">Could not load the report.</div>';
    }
  }

  // ---- edits: inputs write into the drafts; structure changes re-render
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (!el || !el.getAttribute || !smDraft) return;
    var editor = document.getElementById("smEditor");
    if (!editor || !editor.contains(el)) return;
    var f = el.getAttribute("data-smf");
    if (f) {
      if (f === "shippingIncluded") { smDraft.shippingIncluded = el.checked; var fee = document.getElementById("sm-f-fee"); if (fee) fee.disabled = el.checked; }
      else if (f === "shippingFeeDollars") smDraft.shippingFeeCents = Math.max(0, Math.round(Number(el.value || 0) * 100));
      else if (f === "shippingCountries" || f === "excludedRegions") smDraft[f] = el.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      else if (f === "pickupWindowMonths") smDraft[f] = Number(el.value) || 2;
      else if (f === "showId") { /* handled on change */ }
      else smDraft[f] = el.value;
      smSetDirty(true);
      return;
    }
    var s = el.getAttribute("data-sms");
    if (s && smShowDraft) { smShowDraft[s] = el.value; smSetDirty(true); return; }
    var p = el.getAttribute("data-smp");
    if (p && smShowDraft) { smShowDraft.merchPickup[p] = p === "enabled" ? el.checked : el.value; smSetDirty(true); return; }
    var pr = el.getAttribute("data-smpr");
    if (pr && smProductDrafts[pr]) {
      var key = el.getAttribute("data-key");
      smProductDrafts[pr][key] = key === "enabled" ? el.checked : el.value;
      smSetDirty(true);
      return;
    }
    var cut = el.getAttribute("data-smcut");
    if (cut) {
      if (el.value) smDraft.productCutoffs[cut] = el.value; else delete smDraft.productCutoffs[cut];
      smSetDirty(true);
      return;
    }
    var img = el.getAttribute("data-smimg");
    if (img && smProductDrafts[img]) {
      var url = el.getAttribute("data-url");
      if (el.value.trim()) smProductDrafts[img].imageLabels[url] = el.value.trim(); else delete smProductDrafts[img].imageLabels[url];
      smSetDirty(true);
      return;
    }
    var sg = el.getAttribute("data-smsg");
    if (sg && smProductDrafts[sg]) {
      var row = smProductDrafts[sg].sizeGuideRows[Number(el.getAttribute("data-row"))];
      if (row) row[el.getAttribute("data-key")] = el.value;
      smSetDirty(true);
    }
  });

  document.addEventListener("change", function (e) {
    var el = e.target;
    if (!el || !el.getAttribute || !smDraft) return;
    var editor = document.getElementById("smEditor");
    if (!editor || !editor.contains(el)) return;
    if (el.getAttribute("data-smf") === "showId") {
      smDraft.showId = el.value;
      var show = smShows.find(function (s) { return s.id === el.value; });
      smShowDraft = show ? {
        title: show.title || "", date: show.date || "", city: show.city || "", venue: show.venue || "", status: show.status || "", timezone: show.timezone || "",
        merchPickup: Object.assign({ enabled: false, cutoff: "", hours: "", location: "", instructions: "" }, show.merchPickup || {}),
      } : null;
      smSetDirty(true);
      renderSmEditor();
      return;
    }
    // Checkboxes and selects don't always fire input.
    if (el.getAttribute("data-smf") === "shippingIncluded" || el.getAttribute("data-smp") === "enabled" || (el.getAttribute("data-smpr") && el.getAttribute("data-key") === "enabled") || el.tagName === "SELECT") {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    var toggle = el.getAttribute("data-smprod-toggle");
    if (toggle) {
      if (el.checked) {
        if (smDraft.productIds.indexOf(toggle) < 0) smDraft.productIds.push(toggle);
        if (!smProductDrafts[toggle]) {
          var product = smCatalog.find(function (p) { return p.id === toggle; });
          if (product) smProductDrafts[toggle] = smProductDraft(product);
        }
      } else {
        smDraft.productIds = smDraft.productIds.filter(function (id) { return id !== toggle; });
        delete smDraft.productCutoffs[toggle];
      }
      smSetDirty(true);
      renderSmEditor();
      return;
    }
    var file = el.getAttribute("data-smimg-file");
    if (file && el.files && el.files.length) {
      smUploadImages(file, el);
    }
  });

  async function smUploadImages(productId, input) {
    try {
      var fd = new FormData();
      for (var i = 0; i < input.files.length; i++) fd.append("files", input.files[i]);
      var res = await fetch("/api/admin/upload-images", { method: "POST", headers: { "x-admin-key": getKey() }, body: fd });
      var data = await res.json().catch(function () { return {}; });
      var urls = Array.isArray(data.urls) ? data.urls.filter(Boolean) : [];
      if (!res.ok || !urls.length) throw new Error(data.error || "Upload failed");
      var draft = smProductDrafts[productId];
      urls.forEach(function (url) { if (draft.images.indexOf(url) < 0) draft.images.push(url); });
      smSetDirty(true);
      renderSmEditor();
      smNote(urls.length + " image" + (urls.length === 1 ? "" : "s") + " uploaded. Label them, then Save.");
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      input.value = "";
    }
  }

  document.addEventListener("click", async function (e) {
    if (!e.target.closest) return;
    var goto = e.target.closest("[data-sm-goto]");
    if (goto) {
      e.preventDefault();
      var target = document.getElementById(goto.getAttribute("data-sm-goto"));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        var focusable = target.matches("input,select,textarea") ? target : target.querySelector("input,select,textarea");
        if (focusable) setTimeout(function () { focusable.focus(); }, 300);
      }
      return;
    }
    var open = e.target.closest("[data-sm-open]");
    if (open) { await smOpen(open.getAttribute("data-sm-open")); return; }
    var dup = e.target.closest("[data-sm-dup]");
    if (dup) {
      if (!confirm("Duplicate this setup as an unpublished draft? You will need to choose the show, re-enter dates and approve every group again.")) return;
      try {
        var copied = await apiJson("/api/admin/show-merch/setups/" + encodeURIComponent(dup.getAttribute("data-sm-dup")) + "/duplicate", { method: "POST" });
        await refreshShowMerch();
        await smOpen(copied.setup.id);
      } catch (err) { alert(err.message || String(err)); }
      return;
    }
    var del = e.target.closest("[data-sm-del]");
    if (del) {
      var delId = del.getAttribute("data-sm-del");
      if (!confirm("Delete this draft setup? Orders already placed are not affected.")) return;
      try {
        await apiJson("/api/admin/show-merch/setups/" + encodeURIComponent(delId), { method: "DELETE" });
        if (smSetup && smSetup.id === delId) { smSetup = null; smDraft = null; smSetDirty(false); document.getElementById("smEditor").hidden = true; }
        await refreshShowMerch();
      } catch (err) { alert(err.message || String(err)); }
      return;
    }
    if (!smSetup) return;
    var editor = document.getElementById("smEditor");
    if (!editor || !editor.contains(e.target)) return;

    if (e.target.closest("#smCloseBtn")) { smClose(); return; }
    if (e.target.closest("#smSave")) { await smSaveAll(); return; }
    if (e.target.closest("#smDiscard")) { if (confirm("Discard unsaved changes?")) await smOpen(smSetup.id, true); return; }
    if (e.target.closest("#smDelete")) {
      if (!confirm("Delete this draft setup?")) return;
      try { await apiJson("/api/admin/show-merch/setups/" + encodeURIComponent(smSetup.id), { method: "DELETE" }); smSetup = null; smDraft = null; smSetDirty(false); editor.hidden = true; await refreshShowMerch(); }
      catch (err) { alert(err.message || String(err)); }
      return;
    }
    if (e.target.closest("#smDuplicate")) {
      if (smDirty) { alert("Save or discard your changes first."); return; }
      if (!confirm("Duplicate this setup as an unpublished draft?")) return;
      try { var c2 = await apiJson("/api/admin/show-merch/setups/" + encodeURIComponent(smSetup.id) + "/duplicate", { method: "POST" }); await refreshShowMerch(); await smOpen(c2.setup.id); }
      catch (err) { alert(err.message || String(err)); }
      return;
    }
    var approve = e.target.closest("[data-sm-approve]");
    if (approve) {
      if (smDirty) { alert("Save your changes first, then approve what was saved."); return; }
      var approved = approve.getAttribute("data-sm-approved") === "1";
      if (approved && !confirm("Approve “" + smSetup.approvalLabels[approve.getAttribute("data-sm-approve")] + "” for launch as currently saved?")) return;
      try {
        var r = await apiJson("/api/admin/show-merch/setups/" + encodeURIComponent(smSetup.id) + "/approve", { method: "POST", body: { key: approve.getAttribute("data-sm-approve"), approved: approved } });
        smSetup = r.setup; renderSmEditor(); smNote(approved ? "Approved." : "Approval withdrawn.");
      } catch (err) { alert(err.message || String(err)); }
      return;
    }
    var publish = e.target.closest("#smPublish");
    if (publish) {
      if (smDirty) { alert("Save your changes first."); return; }
      var toPublish = publish.getAttribute("data-published") === "1";
      if (!confirm(toPublish ? "Publish this setup? The shop starts offering pickup / ship-after-the-show for its products as soon as a drop carries them." : "Unpublish? The products go back to the shop’s normal checkout. Paid orders keep what they were promised.")) return;
      try {
        var pr = await apiJson("/api/admin/show-merch/setups/" + encodeURIComponent(smSetup.id) + "/publish", { method: "POST", body: { published: toPublish } });
        smSetup = pr.setup; renderSmEditor(); smNote(toPublish ? "Published." : "Unpublished."); await refreshShowMerch();
      } catch (err) { alert(err.message || String(err)); await smOpen(smSetup.id, true); }
      return;
    }
    var remove = e.target.closest("[data-smprod-remove]");
    if (remove) {
      var rid = remove.getAttribute("data-smprod-remove");
      smDraft.productIds = smDraft.productIds.filter(function (id) { return id !== rid; });
      delete smDraft.productCutoffs[rid];
      smSetDirty(true); renderSmEditor(); return;
    }
    var up = e.target.closest("[data-smimg-up]");
    if (up) { var fileInput = editor.querySelector('[data-smimg-file="' + up.getAttribute("data-smimg-up").replace(/"/g, '&quot;') + '"]'); if (fileInput) fileInput.click(); return; }
    var mv = e.target.closest("[data-smimg-move]");
    if (mv) {
      var md = smProductDrafts[mv.getAttribute("data-smimg-move")];
      var from = Number(mv.getAttribute("data-index")); var to = from + Number(mv.getAttribute("data-dir"));
      if (md && to >= 0 && to < md.images.length) { var tmp = md.images[from]; md.images[from] = md.images[to]; md.images[to] = tmp; smSetDirty(true); renderSmEditor(); }
      return;
    }
    var idel = e.target.closest("[data-smimg-del]");
    if (idel) {
      var dd = smProductDrafts[idel.getAttribute("data-smimg-del")];
      if (dd) { var gone = dd.images.splice(Number(idel.getAttribute("data-index")), 1)[0]; delete dd.imageLabels[gone]; smSetDirty(true); renderSmEditor(); }
      return;
    }
    var sgAdd = e.target.closest("[data-smsg-add]");
    if (sgAdd) { var ad = smProductDrafts[sgAdd.getAttribute("data-smsg-add")]; if (ad) { ad.sizeGuideRows.push({ size: "", chest: "", length: "" }); smSetDirty(true); renderSmEditor(); } return; }
    var sgDel = e.target.closest("[data-smsg-del]");
    if (sgDel) { var dl = smProductDrafts[sgDel.getAttribute("data-smsg-del")]; if (dl) { dl.sizeGuideRows.splice(Number(sgDel.getAttribute("data-row")), 1); smSetDirty(true); renderSmEditor(); } return; }
    if (e.target.closest("#smDropSchedule") || e.target.closest("#smDropAdd")) {
      if (smDirty) { alert("Save your changes first."); return; }
      var qty = {};
      editor.querySelectorAll("[data-smdq]").forEach(function (inp) { qty[inp.getAttribute("data-smdq")] = Number(inp.value); });
      var add = Boolean(e.target.closest("#smDropAdd"));
      var startEl = document.getElementById("sm-drop-start");
      var minutesEl = document.getElementById("sm-drop-minutes");
      var body = { qty: qty, mode: add ? "add" : "schedule" };
      if (!add) {
        body.startsAt = startEl && startEl.value ? new Date(startEl.value).toISOString() : "now";
        body.durationMinutes = Number(minutesEl ? minutesEl.value : 10080) || 10080;
      }
      if (!confirm(add ? "Add the missing products to the live drop?" : "Schedule a drop with this setup’s products? Sales open at the start time.")) return;
      try {
        await apiJson("/api/admin/show-merch/setups/" + encodeURIComponent(smSetup.id) + "/drop", { method: "POST", body: body });
        smNote(add ? "Added to the live drop." : "Drop scheduled.");
        await refreshShowMerch(); await smOpen(smSetup.id, true); refreshDrops(); refreshState();
      } catch (err) { alert(err.message || String(err)); }
      return;
    }
    if (e.target.closest("#smExportProduction")) { try { await downloadAdminFile("/api/admin/show-merch/setups/" + encodeURIComponent(smSetup.id) + "/production.csv", "production.csv"); } catch (err) { alert(err.message || String(err)); } return; }
    if (e.target.closest("#smExportPickup")) { try { await downloadAdminFile("/api/admin/orders/export.csv?fulfillment=pickup" + (smDraft.showId ? "&showId=" + encodeURIComponent(smDraft.showId) : ""), "pickup-list.csv"); } catch (err) { alert(err.message || String(err)); } return; }
    if (e.target.closest("#smExportShipping")) { try { await downloadAdminFile("/api/admin/orders/export.csv?fulfillment=ship", "shipping-queue.csv"); } catch (err) { alert(err.message || String(err)); } return; }
  });

  // ---- save: setup, then the show, then each product; then reload
  async function smSaveAll() {
    if (!smSetup || smSaving) return;
    smSaving = true;
    smSetDirty(true);
    smNote("Saving…");
    try {
      var setupBody = {};
      SM_SETUP_FIELDS.forEach(function (key) { setupBody[key] = smDraft[key]; });
      await apiJson("/api/admin/show-merch/setups/" + encodeURIComponent(smSetup.id), { method: "PUT", body: setupBody });
      if (smDraft.showId && smShowDraft) {
        await apiJson("/api/admin/kyd/shows/" + encodeURIComponent(smDraft.showId), { method: "PATCH", body: smShowDraft });
      }
      var ids = Object.keys(smProductDrafts).filter(function (id) { return smDraft.productIds.indexOf(id) >= 0; });
      for (var i = 0; i < ids.length; i++) {
        var p = smProductDrafts[ids[i]];
        var price = Math.round(Number(p.priceDollars) * 100);
        await apiJson("/api/admin/products/" + encodeURIComponent(p.id), {
          method: "PATCH",
          body: {
            title: p.title.trim(),
            priceCents: Number.isFinite(price) ? price : 0,
            enabled: p.enabled,
            inventoryMode: p.inventoryMode,
            printPlacement: p.printPlacement,
            garment: p.garment,
            description: p.description,
            sizes: p.sizes,
            images: p.images,
            imageLabels: p.imageLabels,
            sizeGuide: { note: p.sizeGuideNote, rows: p.sizeGuideRows.filter(function (r) { return r.size.trim(); }) },
          },
        });
      }
      smSaving = false;
      var when = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      smDirty = false;
      smNote("Saved " + when + ".");
      await refreshShowMerch();
      await smOpen(smSetup.id, true);
      refreshProducts();
    } catch (err) {
      smSaving = false;
      smSetDirty(true);
      smNote(err.message || String(err), true);
    }
  }

  var smNewBtn = document.getElementById("smNew");
  if (smNewBtn) {
    smNewBtn.addEventListener("click", async function () {
      if (smDirty && !confirm("Discard unsaved changes?")) return;
      var name = prompt("Name this setup (for the admin only):", "Show merch setup");
      if (name === null) return;
      try {
        var created = await apiJson("/api/admin/show-merch/setups", { method: "POST", body: { name: name } });
        await refreshShowMerch();
        smDirty = false;
        await smOpen(created.setup.id);
      } catch (err) { alert(err.message || String(err)); }
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

  // ---------- Orders: all / pickup / shipping ----------
  var orderQueue = "all";
  var orderShowId = "";
  var orderSearch = "";
  var ordersMailerConfigured = false;

  var PICKUP_STATUS_OPTIONS = [["awaiting", "Awaiting pickup"], ["picked_up", "Picked up"], ["missed", "Missed"]];
  var SHIPPING_STATUS_OPTIONS = [["awaiting", "Awaiting shipment"], ["shipped", "Shipped"]];

  function statusSelect(attr, label, options, current) {
    return '<select ' + attr + ' aria-label="' + label + '">' + options.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === current ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("") + "</select>";
  }

  function lineMethod(item) {
    return item.fulfillment && item.fulfillment.method === "pickup" ? "pickup" : "ship";
  }

  function orderShips(order) {
    var items = Array.isArray(order.items) ? order.items : [];
    return items.some(function (item) { return lineMethod(item) === "ship"; }) || Boolean(order.status && order.status.missedPickupAddress);
  }

  function orderChips(order) {
    var chips = [];
    var items = Array.isArray(order.items) ? order.items : [];
    var status = order.status || {};
    var pickupLine = items.find(function (item) { return lineMethod(item) === "pickup"; });
    if (pickupLine) {
      var show = (pickupLine.fulfillment && pickupLine.fulfillment.show) || {};
      var pickupCls = status.pickupStatus === "picked_up" ? "done" : status.pickupStatus === "missed" ? "missed" : "pickup";
      var pickupText = status.pickupStatus === "picked_up" ? "Picked up" : status.pickupStatus === "missed" ? "Missed pickup" : "Pickup";
      chips.push('<span class="fulfill-chip ' + pickupCls + '">' + pickupText + (show.name ? " &middot; " + escapeHtml(show.name) : "") + "</span>");
    }
    if (orderShips(order)) {
      var showMerchShip = items.find(function (item) { return lineMethod(item) === "ship" && item.fulfillment && item.fulfillment.showMerch; });
      var shipText = status.shippingStatus === "shipped"
        ? "Shipped"
        : status.missedPickupAddress && !items.some(function (item) { return lineMethod(item) === "ship"; })
          ? "Ships (missed pickup)"
          : showMerchShip && showMerchShip.fulfillment.shipsAfter ? "Ships after " + escapeHtml(showMerchShip.fulfillment.shipsAfter) : "Ships";
      chips.push('<span class="fulfill-chip ' + (status.shippingStatus === "shipped" ? "done" : "ship") + '">' + shipText + "</span>");
    }
    return chips.join("");
  }

  function addressInputs(prefix, address) {
    var a = address || {};
    function inp(key, label, value, extra) {
      return '<div><label>' + label + '</label><input data-' + prefix + '="' + key + '" value="' + escapeHtml(value || "") + '" ' + (extra || "") + " /></div>";
    }
    return '<div class="order-fulfillment__addr">' +
      inp("line1", "Address line 1", a.line1) + inp("line2", "Line 2", a.line2) + inp("city", "City", a.city) +
      inp("state", "State", a.state, 'maxlength="20"') + inp("postalCode", "Postal code", a.postalCode) + inp("country", "Country", a.country || "US", 'maxlength="2"') +
    "</div>";
  }

  function fulfillmentControls(order) {
    var status = order.status || {};
    var items = Array.isArray(order.items) ? order.items : [];
    var rows = [];
    var pickupLine = items.find(function (item) { return lineMethod(item) === "pickup"; });
    var hasShipLines = items.some(function (item) { return lineMethod(item) === "ship"; });
    if (pickupLine) {
      var f = pickupLine.fulfillment || {};
      var show = f.show || {};
      rows.push('<div class="order-fulfillment__row">' +
        '<div><div class="order-label">Pick up at</div><div class="order-value">' +
          escapeHtml(show.name || "Show") + "<br/>" + escapeHtml([show.date, show.location].filter(Boolean).join(" · ")) +
          (f.pickupHours ? "<br/>" + escapeHtml(f.pickupHours) : "") +
          (f.bonus ? '<br/><span class="muted">+ ' + escapeHtml(f.bonus) + "</span>" : "") +
          (status.pickedUpAt ? '<br/><span class="muted">Checked in ' + escapeHtml(formatDateTime(status.pickedUpAt)) + "</span>" : "") +
        "</div></div>" +
        "<div><label>Pickup status</label>" + statusSelect("data-pickup-status", "Pickup status", PICKUP_STATUS_OPTIONS, status.pickupStatus) + "</div>" +
      "</div>");
      if (status.pickupStatus === "missed") {
        var addr = status.missedPickupAddress;
        rows.push('<div class="order-fulfillment__row" style="flex-direction:column;align-items:stretch">' +
          '<div class="order-label">Missed pickup &rarr; ship it instead (nothing is charged again)</div>' +
          (addr
            ? '<div class="order-value">Ships to: ' + formatOrderAddress(addr) + '<br/><span class="muted">Address from ' + (status.missedPickupAddressSource === "customer" ? "the customer’s link" : "staff") + (status.missedPickupAddressAt ? ", " + escapeHtml(formatDateTime(status.missedPickupAddressAt)) : "") + "</span></div>"
            : '<div class="muted">No address yet.' + (status.addressRequestSentAt ? " Address link emailed " + escapeHtml(formatDateTime(status.addressRequestSentAt)) + "." : "") + "</div>") +
          '<div class="btnline">' +
            '<button class="btn small" type="button" data-address-request' + (ordersMailerConfigured && order.customerEmail ? "" : ' title="No email transport configured: the link is shown to copy"') + ">" + (status.addressToken ? "New address link" : "Send address link to customer") + "</button>" +
            '<button class="btn small" type="button" data-address-toggle>' + (addr ? "Edit address" : "Enter address (from a call or reply)") + "</button>" +
            (hasShipLines && order.shippingAddress && !addr ? '<button class="btn small" type="button" data-address-copy>Use the order’s shipping address</button>' : "") +
          "</div>" +
          '<div data-address-form hidden>' + addressInputs("addr", addr) + '<div class="btnline" style="margin-top:8px"><button class="btn small primary" type="button" data-address-save>Save address</button></div></div>' +
          '<div class="form-note" data-address-link>' + (status.addressToken ? "Link exists; use “New address link” to issue and show a fresh one." : "") + "</div>" +
        "</div>");
      }
    }
    if (orderShips(order)) {
      var sent = status.shippingUpdateSentAt
        ? "Shipping update emailed " + escapeHtml(formatDateTime(status.shippingUpdateSentAt)) + (status.shippingUpdateCount > 1 ? " (" + status.shippingUpdateCount + " sends)" : "")
        : "No shipping update sent yet.";
      rows.push('<div class="order-fulfillment__row">' +
        "<div><label>Shipping status</label>" + statusSelect("data-ship-status", "Shipping status", SHIPPING_STATUS_OPTIONS, status.shippingStatus) + "</div>" +
        '<div><label>Carrier</label><input data-carrier value="' + escapeHtml(status.carrier || "") + '" placeholder="USPS / UPS / FedEx" /></div>' +
        '<div><label>Tracking number</label><input data-tracking value="' + escapeHtml(status.trackingNumber || "") + '" /></div>' +
        '<div><button class="btn small" type="button" data-save-shipping>Save shipping</button></div>' +
        '<div><button class="btn small primary" type="button" data-send-update' + (order.customerEmail ? "" : ' disabled title="No customer email"') + ">Send shipping update</button></div>" +
        '<div class="order-fulfillment__status" style="flex-basis:100%">' + sent + "</div>" +
      "</div>");
    }
    return '<div class="order-fulfillment" data-order-id="' + escapeHtml(order.orderId || "") + '">' + rows.join("") +
      '<div class="form-note" data-fulfillment-note></div></div>';
  }

  function syncQueueControls(data) {
    var counts = data.counts || {};
    ordersMailerConfigured = Boolean(data.mailer && data.mailer.configured);
    document.querySelectorAll("[data-queue]").forEach(function (btn) {
      var queue = btn.getAttribute("data-queue");
      btn.setAttribute("aria-pressed", queue === orderQueue ? "true" : "false");
      var base = queue === "all" ? "All" : queue === "pickup" ? "Pickup" : "Shipping";
      btn.textContent = base + (Number.isFinite(Number(counts[queue])) ? " (" + counts[queue] + ")" : "");
    });
    var select = document.getElementById("queueShow");
    if (select) {
      var shows = Array.isArray(data.pickupShows) ? data.pickupShows : [];
      select.innerHTML = '<option value="">All shows</option>' + shows.map(function (show) {
        return '<option value="' + escapeHtml(show.id) + '"' + (show.id === orderShowId ? " selected" : "") + ">" +
          escapeHtml(show.name + " (" + show.date + ")") + "</option>";
      }).join("");
      select.hidden = orderQueue !== "pickup";
    }
  }

  async function refreshSales() {
    try {
      const query = "?fulfillment=" + encodeURIComponent(orderQueue) +
        (orderShowId ? "&showId=" + encodeURIComponent(orderShowId) : "") +
        (orderSearch ? "&q=" + encodeURIComponent(orderSearch) : "");
      const data = await apiJson("/api/admin/orders" + query);
      const totals = data.totals || { count: 0, items: 0, grossCents: 0 };
      const orders = Array.isArray(data.orders) ? data.orders : [];
      syncQueueControls(data);

      if (!orders.length) {
        salesWrap.innerHTML = '<div class="muted">' + (orderSearch ? "No orders match “" + escapeHtml(orderSearch) + "”." : orderQueue === "pickup" ? "No pickup orders yet." : orderQueue === "ship" ? "No shipping orders yet." : "No sales yet.") + "</div>";
        return;
      }

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

        const itemRows = Array.isArray(order.items) ? order.items : [];
        const status = order.status || {};
        const shipTo = status.missedPickupAddress || order.shippingAddress;
        const addressHtml = shipTo
          ? formatOrderAddress(shipTo) + (status.missedPickupAddress ? '<br/><span class="muted">(missed pickup)</span>' : "")
          : orderShips(order) ? "—" : '<span class="muted">None needed (pickup)</span>';

        const headerMeta = [];
        const dateText = formatDateTime(order.ts);
        if (dateText) headerMeta.push('<div class="order-meta">' + escapeHtml(dateText) + "</div>");
        const itemsCount = Number.isFinite(Number(order.totalItems)) ? Number(order.totalItems) : 0;
        headerMeta.push('<div class="order-meta">Items: ' + escapeHtml(String(itemsCount)) + "</div>");
        headerMeta.push('<div class="order-meta">Payment: ' + escapeHtml(order.paymentRef || order.orderId || "") + "</div>");
        headerMeta.push("<div>" + orderChips(order) + "</div>");

        let itemsTable = '<div class="muted">No line items.</div>';
        if (itemRows.length) {
          const rowsHtml = itemRows
            .map((item) => {
              const title = item.productTitle || item.productId || "Item";
              const qtyText = Number.isFinite(Number(item.qty)) ? Number(item.qty) : 0;
              const each = formatMoney(item.priceCents);
              const subtotal = formatMoney(item.lineTotalCents ?? (Number(item.priceCents) || 0) * qtyText);
              const detail = [item.productId, item.productDetail].filter(Boolean).map(escapeHtml).join(" &middot; ");
              return (
                "<tr>" +
                "<td><div>" + escapeHtml(title) + "</div>" + (detail ? '<div class="order-item-id">' + detail + "</div>" : "") + "</td>" +
                '<td style="text-align:center;">' + escapeHtml(item.size || "—") + "</td>" +
                '<td style="text-align:center;">' + escapeHtml(String(qtyText)) + "</td>" +
                "<td>" + (lineMethod(item) === "pickup" ? "Pickup" : "Ship") + "</td>" +
                '<td style="text-align:right;">' + escapeHtml(each) + "</td>" +
                '<td style="text-align:right;">' + escapeHtml(subtotal) + "</td>" +
                "</tr>"
              );
            })
            .join("");
          itemsTable =
            '<div class="order-items"><table><thead><tr><th>Product</th><th>Size</th><th>Qty</th><th>How</th><th>Each</th><th>Subtotal</th></tr></thead><tbody>' +
            rowsHtml +
            "</tbody></table></div>";
        }

        html +=
          '<div class="order-card">' +
          '<div class="order-header">' +
          '<div><div class="order-id">Order <span class="order-number">' + escapeHtml(order.orderNumber || "") + "</span></div>" + headerMeta.join("") + "</div>" +
          '<div class="order-total">' + escapeHtml(formatMoney(order.totalCents)) + "</div>" +
          "</div>" +
          '<div class="order-grid">' +
          '<div><div class="order-label">Customer</div><div class="order-value">' + customerHtml + "</div></div>" +
          '<div><div class="order-label">Ship to</div><div class="order-value">' + addressHtml + "</div></div>" +
          "</div>" +
          itemsTable +
          fulfillmentControls(order) +
          "</div>";
      }
      html += "</div>";
      html +=
        '<div class="totals"><span>' +
        escapeHtml(String(orders.length)) +
        " orders shown</span><span>All sales: " +
        escapeHtml(String(totals.items ?? 0)) +
        " items / " +
        escapeHtml(formatMoney(totals.grossCents)) +
        "</span></div>";
      salesWrap.innerHTML = html;
    } catch (err) {
      salesWrap.innerHTML = '<div class="muted">' + escapeHtml(err.message || String(err)) + "</div>";
    }
  }

  async function saveOrderFulfillment(box, patch, control) {
    var orderId = box.getAttribute("data-order-id");
    var note = box.querySelector("[data-fulfillment-note]");
    if (control) control.disabled = true;
    if (note) { note.textContent = "Saving…"; note.style.color = ""; }
    try {
      await apiJson("/api/admin/orders/" + encodeURIComponent(orderId) + "/fulfillment", { method: "PATCH", body: patch });
      if (note) note.textContent = "Saved.";
      return true;
    } catch (err) {
      if (note) { note.textContent = err.message || String(err); note.style.color = "#e08585"; }
      return false;
    } finally {
      if (control) control.disabled = false;
    }
  }

  salesWrap.addEventListener("change", async function (e) {
    var el = e.target;
    if (!el || !el.hasAttribute || !el.hasAttribute("data-pickup-status")) return;
    var box = el.closest(".order-fulfillment");
    if (!box) return;
    var ok = await saveOrderFulfillment(box, { pickupStatus: el.value }, el);
    // "Missed" opens the ship-it-instead controls, so redraw the list.
    if (ok) void refreshSales();
  });

  salesWrap.addEventListener("click", async function (e) {
    if (!e.target || !e.target.closest) return;
    var box = e.target.closest(".order-fulfillment");
    if (!box) return;
    var orderId = box.getAttribute("data-order-id");
    var note = box.querySelector("[data-fulfillment-note]");

    var saveBtn = e.target.closest("[data-save-shipping]");
    if (saveBtn) {
      void saveOrderFulfillment(box, {
        shippingStatus: box.querySelector("[data-ship-status]").value,
        carrier: box.querySelector("[data-carrier]").value,
        trackingNumber: box.querySelector("[data-tracking]").value,
      }, saveBtn);
      return;
    }

    var sendBtn = e.target.closest("[data-send-update]");
    if (sendBtn) {
      var carrier = box.querySelector("[data-carrier]").value;
      var tracking = box.querySelector("[data-tracking]").value;
      if (!confirm("Email the customer that this order has shipped" + (tracking ? " with tracking " + tracking : " (no tracking number entered)") + "? This also marks it shipped.")) return;
      sendBtn.disabled = true;
      if (note) { note.textContent = "Sending…"; note.style.color = ""; }
      try {
        var body = { carrier: carrier, trackingNumber: tracking };
        var res = await fetch("/api/admin/orders/" + encodeURIComponent(orderId) + "/shipping-update", {
          method: "POST", headers: { "x-admin-key": getKey(), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body),
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.status === 409 && data.code === "ALREADY_SENT") {
          if (!confirm(data.error + " Send it again anyway?")) { if (note) note.textContent = "Not sent again."; sendBtn.disabled = false; return; }
          body.force = true;
          res = await fetch("/api/admin/orders/" + encodeURIComponent(orderId) + "/shipping-update", {
            method: "POST", headers: { "x-admin-key": getKey(), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body),
          });
          data = await res.json().catch(function () { return {}; });
        }
        if (!res.ok) throw new Error(data.error || res.statusText);
        if (note) note.textContent = "Shipping update sent.";
        void refreshSales();
      } catch (err) {
        if (note) { note.textContent = err.message || String(err); note.style.color = "#e08585"; }
        sendBtn.disabled = false;
      }
      return;
    }

    var reqBtn = e.target.closest("[data-address-request]");
    if (reqBtn) {
      if (!confirm("Issue a secure address link for this order" + (ordersMailerConfigured ? " and email it to the customer" : "") + "? The order is marked as a missed pickup. Nothing is charged.")) return;
      reqBtn.disabled = true;
      try {
        var r = await apiJson("/api/admin/orders/" + encodeURIComponent(orderId) + "/address-request", { method: "POST", body: { send: true } });
        var linkNote = box.querySelector("[data-address-link]");
        if (linkNote) {
          linkNote.innerHTML = (r.emailed ? "Emailed to the customer. " : "Not emailed (no mail transport or no email on the order). ") +
            'Link to share: <input readonly value="' + escapeHtml(r.link) + '" style="width:100%;margin-top:6px" onclick="this.select()" />';
        }
        if (note) note.textContent = r.emailed ? "Address link sent." : "Address link ready to copy.";
      } catch (err) {
        if (note) { note.textContent = err.message || String(err); note.style.color = "#e08585"; }
      } finally {
        reqBtn.disabled = false;
      }
      return;
    }

    var toggleBtn = e.target.closest("[data-address-toggle]");
    if (toggleBtn) {
      var form = box.querySelector("[data-address-form]");
      if (form) form.hidden = !form.hidden;
      return;
    }

    var copyBtn = e.target.closest("[data-address-copy]");
    if (copyBtn) {
      var card = box.closest(".order-card");
      // The address shown on the card is the order's own; copy it in as the shipping address for the missed pickup.
      var lines = card ? card.querySelector(".order-grid .order-value:last-child") : null;
      var form2 = box.querySelector("[data-address-form]");
      if (form2) form2.hidden = false;
      if (note) note.textContent = "Fill in the address below (copied text is on the card above) and save.";
      if (lines) lines.scrollIntoView({ block: "center" });
      return;
    }

    var addrSave = e.target.closest("[data-address-save]");
    if (addrSave) {
      var address = {};
      box.querySelectorAll("[data-addr]").forEach(function (inp) { address[inp.getAttribute("data-addr")] = inp.value; });
      var ok = await saveOrderFulfillment(box, { missedPickupAddress: address }, addrSave);
      if (ok) void refreshSales();
    }
  });

  document.querySelectorAll("[data-queue]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      orderQueue = btn.getAttribute("data-queue") || "all";
      if (orderQueue !== "pickup") orderShowId = "";
      void refreshSales();
    });
  });

  var queueShowSelect = document.getElementById("queueShow");
  if (queueShowSelect) {
    queueShowSelect.addEventListener("change", function () {
      orderShowId = queueShowSelect.value;
      void refreshSales();
    });
  }

  var orderSearchInput = document.getElementById("orderSearch");
  if (orderSearchInput) {
    var searchTimer = null;
    orderSearchInput.addEventListener("input", function () {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        orderSearch = orderSearchInput.value.trim();
        void refreshSales();
      }, 250);
    });
  }

  var exportPickupBtn = document.getElementById("btnExportPickup");
  if (exportPickupBtn) {
    exportPickupBtn.addEventListener("click", async function () {
      try {
        await downloadAdminFile(
          "/api/admin/orders/export.csv?fulfillment=pickup" + (orderShowId ? "&showId=" + encodeURIComponent(orderShowId) : ""),
          "pickup-list.csv",
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
  }

  var exportShippingBtn = document.getElementById("btnExportShipping");
  if (exportShippingBtn) {
    exportShippingBtn.addEventListener("click", async function () {
      try {
        await downloadAdminFile("/api/admin/orders/export.csv?fulfillment=ship", "shipping-queue.csv");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
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

  // ── Notifications ──────────────────────────────────────────────────────────
  // The store is only as good as the alerts: this says where they go and lets
  // you prove one lands before a real order depends on it.
  const notifState = document.getElementById("notif_state");
  const notifResult = document.getElementById("notif_result");

  async function loadNotifications() {
    if (!notifState) return;
    if (!getKey()) {
      notifState.textContent = "Enter admin key to load notification settings.";
      return;
    }
    try {
      const cfg = await apiJson("/api/admin/notifications");
      const parts = [];
      parts.push("Purchases -> " + (cfg.orderTo || "OFF"));
      parts.push("Carts -> " + (cfg.cartTo || "OFF") + " (batched every " + cfg.cartWindowMinutes + " min)");
      parts.push("From " + cfg.from + " via " + cfg.transport);
      if (cfg.transport === "none") {
        parts.push("WARNING: no mail transport configured — set RESEND_API_KEY or SMTP_HOST.");
      } else if (cfg.sandboxSender) {
        parts.push("WARNING: sandbox sender — Resend will only deliver to the API key owner until no-connection.com is verified and EMAIL_FROM is set.");
      }
      notifState.innerHTML = parts.map(function (line) {
        return "<div>" + line.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</div>";
      }).join("");
    } catch (err) {
      notifState.textContent = err.message || String(err);
    }
  }

  async function sendTestNotification(type) {
    if (!notifResult) return;
    const toField = document.getElementById("notif_to");
    const to = toField && toField.value.trim() ? toField.value.trim() : undefined;
    notifResult.textContent = "Sending…";
    try {
      const resp = await apiJson("/api/admin/test-email", { method: "POST", body: { type: type, to: to } });
      notifResult.textContent = resp.message || "Sent.";
    } catch (err) {
      notifResult.textContent = "Failed: " + (err.message || String(err));
    }
  }

  const notifPurchaseBtn = document.getElementById("notif_test_purchase");
  if (notifPurchaseBtn) notifPurchaseBtn.addEventListener("click", () => sendTestNotification("purchase"));
  const notifCartBtn = document.getElementById("notif_test_cart");
  if (notifCartBtn) notifCartBtn.addEventListener("click", () => sendTestNotification("cart"));
  const notifRefreshBtn = document.getElementById("notif_refresh");
  if (notifRefreshBtn) notifRefreshBtn.addEventListener("click", loadNotifications);

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
      loadNotifications();
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
  loadNotifications();
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


/**
 * Pickup check-in, built for a phone at the merch table: pick the show, search
 * by name / email / order number, tap to mark collected, undo a wrong tap.
 */
adminUiRouter.get("/checkin", requireAdminPage, (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>Pickup check-in — NC Admin</title>
<style>
  * { box-sizing:border-box; }
  html, body { margin:0; }
  body { background:#0b0b0b; color:#e8e8e8; font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; -webkit-font-smoothing:antialiased; padding-bottom:calc(80px + env(safe-area-inset-bottom)); }
  .top { position:sticky; top:0; z-index:2; background:#0b0b0b; border-bottom:1px solid #1f1f1f; padding:calc(12px + env(safe-area-inset-top)) 14px 12px; display:grid; gap:8px; }
  .top h1 { margin:0; font-size:16px; letter-spacing:-.01em; display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .top h1 a { color:#9a9a9a; font-size:12px; text-decoration:none; }
  .controls { display:grid; gap:8px; grid-template-columns:1fr; }
  @media (min-width:560px) { .controls { grid-template-columns:1fr 1fr; } }
  select, input { width:100%; background:#141414; color:#f2f2f2; border:1px solid #2a2a2a; border-radius:12px; padding:12px 14px; font-size:16px; font-family:inherit; }
  .counts { font-size:12px; color:#9a9a9a; display:flex; gap:14px; flex-wrap:wrap; }
  .counts b { color:#f2f2f2; }
  .list { padding:12px 14px; display:grid; gap:10px; }
  .order { background:#121212; border:1px solid #242424; border-radius:16px; padding:14px; display:grid; gap:8px; }
  .order.done { opacity:.55; }
  .order.missed { border-color:#5a1d1d; }
  .who { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
  .name { font-size:17px; font-weight:600; }
  .num { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:13px; color:#9ecbff; white-space:nowrap; }
  .email { font-size:12px; color:#8a8a8a; }
  .items { display:grid; gap:4px; font-size:14px; }
  .items span { color:#c8c8c8; }
  .bonus { font-size:12px; color:#e4c56b; }
  .note { font-size:12px; color:#8a8a8a; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:4px; }
  .btn { appearance:none; border:1px solid #2a2a2a; background:#1a1a1a; color:#fff; border-radius:12px; padding:12px 16px; font-size:14px; font-weight:600; cursor:pointer; min-height:44px; flex:1; }
  .btn.primary { background:#f5f5f5; color:#000; border-color:#f5f5f5; }
  .btn.quiet { flex:0 0 auto; background:transparent; color:#bcbcbc; font-weight:500; }
  .btn:disabled { opacity:.5; }
  .status { font-size:11px; letter-spacing:.08em; text-transform:uppercase; padding:3px 8px; border-radius:999px; background:#2b2b2b; color:#c8c8c8; }
  .status.done { background:#14351f; color:#7ee2a8; }
  .status.missed { background:#3a1111; color:#fecaca; }
  .empty { padding:40px 14px; text-align:center; color:#8a8a8a; font-size:14px; }
  .toast { position:fixed; left:14px; right:14px; bottom:calc(16px + env(safe-area-inset-bottom)); background:#f5f5f5; color:#050505; border-radius:14px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 18px 40px rgba(0,0,0,.4); font-size:14px; z-index:3; }
  .toast[hidden] { display:none; }
  .toast button { appearance:none; border:0; background:#050505; color:#fff; border-radius:999px; padding:10px 16px; font-weight:600; font-size:13px; cursor:pointer; }
</style>
</head>
<body>
  <div class="top">
    <h1>Pickup check-in <a href="/admin">Admin</a></h1>
    <div class="controls">
      <select id="show" aria-label="Show"><option value="">All shows</option></select>
      <input id="q" type="search" placeholder="Search name, email or order number" autocomplete="off" />
    </div>
    <div class="counts" id="counts"></div>
  </div>
  <div class="list" id="list"><div class="empty">Loading…</div></div>
  <div class="toast" id="toast" hidden><span id="toastText"></span><button type="button" id="toastUndo">Undo</button></div>
<script>
(() => {
  var showSelect = document.getElementById("show");
  var q = document.getElementById("q");
  var list = document.getElementById("list");
  var counts = document.getElementById("counts");
  var toast = document.getElementById("toast");
  var toastText = document.getElementById("toastText");
  var toastUndo = document.getElementById("toastUndo");
  var orders = [];
  var undoAction = null;
  var toastTimer = null;
  var params = new URLSearchParams(window.location.search);
  var showId = params.get("showId") || "";

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] || ch; });
  }

  async function api(path, init) {
    var res = await fetch(path, Object.assign({ headers: { Accept: "application/json", "Content-Type": "application/json" } }, init || {}));
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  function timeLabel(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function render() {
    counts.innerHTML = "<span><b>" + orders.length + "</b> orders</span><span><b>" + orders.filter(function (o) { return o.pickupStatus === "picked_up"; }).length + "</b> picked up</span><span><b>" + orders.filter(function (o) { return o.pickupStatus === "awaiting"; }).length + "</b> waiting</span>" + (orders.some(function (o) { return o.pickupStatus === "missed"; }) ? "<span><b>" + orders.filter(function (o) { return o.pickupStatus === "missed"; }).length + "</b> missed</span>" : "");
    if (!orders.length) {
      list.innerHTML = '<div class="empty">' + (q.value ? "No orders match." : "No pickup orders for this show yet.") + "</div>";
      return;
    }
    list.innerHTML = orders.map(function (o) {
      var done = o.pickupStatus === "picked_up";
      var missed = o.pickupStatus === "missed";
      return '<div class="order' + (done ? " done" : missed ? " missed" : "") + '" data-order="' + escapeHtml(o.orderId) + '">' +
        '<div class="who"><div><div class="name">' + escapeHtml(o.customerName || "No name") + '</div><div class="email">' + escapeHtml(o.customerEmail) + "</div></div>" +
          '<div style="text-align:right;display:grid;gap:6px;justify-items:end"><span class="num">' + escapeHtml(o.orderNumber) + "</span>" +
          '<span class="status' + (done ? " done" : missed ? " missed" : "") + '">' + (done ? "Picked up " + timeLabel(o.pickedUpAt) : missed ? "Missed" : "Waiting") + "</span></div></div>" +
        '<div class="items">' + o.items.map(function (i) { return "<div>" + escapeHtml(i.title) + (i.size ? " <span>· Size " + escapeHtml(i.size) + "</span>" : "") + " <span>× " + i.qty + "</span></div>"; }).join("") + "</div>" +
        (o.bonus ? '<div class="bonus">+ ' + escapeHtml(o.bonus) + "</div>" : "") +
        (o.otherItemsShip ? '<div class="note">Other items in this order ship separately.</div>' : "") +
        '<div class="actions">' +
          (done
            ? '<button class="btn" type="button" data-set="awaiting">Not collected after all</button>'
            : '<button class="btn primary" type="button" data-set="picked_up">Picked up</button>' +
              (missed ? '<button class="btn quiet" type="button" data-set="awaiting">Back to waiting</button>' : '<button class="btn quiet" type="button" data-set="missed">Missed</button>')) +
        "</div></div>";
    }).join("");
  }

  async function load() {
    try {
      var data = await api("/api/admin/checkin?showId=" + encodeURIComponent(showId) + "&q=" + encodeURIComponent(q.value.trim()));
      orders = data.orders || [];
      if (showSelect.options.length <= 1 && data.shows && data.shows.length) {
        showSelect.innerHTML = '<option value="">All shows</option>' + data.shows.map(function (s) { return '<option value="' + escapeHtml(s.id) + '"' + (s.id === showId ? " selected" : "") + ">" + escapeHtml(s.name + " · " + s.date) + "</option>"; }).join("");
      }
      render();
    } catch (err) {
      list.innerHTML = '<div class="empty">' + escapeHtml(err.message || String(err)) + "</div>";
    }
  }

  function showToast(text, undo) {
    toastText.textContent = text;
    undoAction = undo;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; undoAction = null; }, 8000);
  }

  async function setStatus(orderId, status, previous, silent) {
    var order = orders.find(function (o) { return o.orderId === orderId; });
    try {
      var data = await api("/api/admin/orders/" + encodeURIComponent(orderId) + "/fulfillment", { method: "PATCH", body: JSON.stringify({ pickupStatus: status }) });
      if (order) { order.pickupStatus = data.status.pickupStatus; order.pickedUpAt = data.status.pickedUpAt || null; }
      render();
      if (!silent) {
        var label = status === "picked_up" ? " marked picked up" : status === "missed" ? " marked missed" : " back to waiting";
        showToast((order ? order.customerName || order.orderNumber : "Order") + label + ".", function () { setStatus(orderId, previous, status, true); });
      }
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  list.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-set]") : null;
    if (!btn) return;
    var card = btn.closest("[data-order]");
    var orderId = card.getAttribute("data-order");
    var order = orders.find(function (o) { return o.orderId === orderId; });
    setStatus(orderId, btn.getAttribute("data-set"), order ? order.pickupStatus : "awaiting");
  });
  toastUndo.addEventListener("click", function () {
    toast.hidden = true;
    if (undoAction) undoAction();
    undoAction = null;
  });
  showSelect.addEventListener("change", function () { showId = showSelect.value; load(); });
  var qTimer = null;
  q.addEventListener("input", function () { if (qTimer) clearTimeout(qTimer); qTimer = setTimeout(load, 200); });
  load();
  setInterval(function () { if (!document.hidden) load(); }, 30000);
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
