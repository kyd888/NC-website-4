
(() => {
  const keyInput = document.getElementById("adminKey");
  const productList = document.getElementById("productList");
  const statePre = document.getElementById("out");
  const predPre = document.getElementById("pred");
  const salesWrap = document.getElementById("salesWrap");

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
    return str.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] || ch));
  }

  function buildQtyPayload() {
    const selected = {};
    let total = 0;
    for (const [id, qty] of Object.entries(dropQty)) {
      const value = Number.isFinite(qty) ? qty : 0;
      if (value > 0) {
        selected[id] = value;
        total += value;
      }
    }
    return { selected, total };
  }

  function syncInputs(targetValue) {
    qtyInputs.forEach((input, id) => {
      dropQty[id] = targetValue(id);
      input.value = String(dropQty[id]);
    });
  }

  async function refreshProducts() {
    try {
      const data = await apiJson("/api/admin/products");
      products = Array.isArray(data.products) ? data.products : [];
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

      const row = document.createElement("div");
      row.className = "rowItem";

      const info = document.createElement("div");
      info.className = "pi";
      const img = document.createElement("img");
      img.src = p.imageUrl || "/placeholder.png";
      img.alt = p.title;
      img.onerror = () => { img.src = "/placeholder.png"; };
      const meta = document.createElement("div");
      meta.innerHTML = '<div class="title">' + escapeHtml(p.title) + "</div><div class=\"id\">" + escapeHtml(p.id) + "</div>";
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
      actions.appendChild(btnEdit);
      actions.appendChild(btnDelete);
      row.appendChild(actions);

      productList.appendChild(row);
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
      await apiJson("/api/admin/products/" + encodeURIComponent(product.id), {
        method: "PATCH",
        body: { title: title.trim(), priceCents: price },
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

  async function refreshSales() {
    try {
      const data = await apiJson("/api/admin/sales?limit=200");
      const rows = Array.isArray(data.sales) ? data.sales : [];
      const totals = data.totals || { count: 0, items: 0, grossCents: 0 };
      if (!rows.length) {
        salesWrap.innerHTML = '<div class="muted">No sales yet.</div>';
        return;
      }
      let html = '<table><thead><tr><th>ID</th><th>Product</th><th>Qty</th><th>Price</th><th>When</th></tr></thead><tbody>';
      for (const row of rows) {
        html += "<tr><td>" + escapeHtml(row.id || "") + "</td><td>" + escapeHtml(row.productId || "") + "</td><td>" + row.qty + "</td><td>$" + (row.priceCents / 100).toFixed(2) + "</td><td>" + escapeHtml(row.ts || "") + "</td></tr>";
      }
      html += "</tbody></table>";
      html += '<div class="totals"><span>' + totals.count + ' orders / ' + totals.items + ' items</span><span>$' + (totals.grossCents / 100).toFixed(2) + '</span></div>';
      salesWrap.innerHTML = html;
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
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.getElementById("btnState").addEventListener("click", () => {
    refreshState();
    refreshProducts();
    refreshSales();
    loadAutoDrop();
  });

  document.getElementById("btnEnd").addEventListener("click", async () => {
    if (!confirm("End the current drop?")) return;
    try {
      const resp = await apiJson("/api/admin/drop/end", { method: "POST" });
      statePre.textContent = JSON.stringify(resp, null, 2);
      await refreshState();
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
        },
      });
      document.getElementById("np_id").value = "";
      document.getElementById("np_title").value = "";
      document.getElementById("np_price").value = "";
      document.getElementById("np_image").value = "";
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
      refreshState();
      refreshSales();
      loadAutoDrop();
    }
  });

  if (storedKey) {
    refreshProducts();
    refreshState();
    refreshSales();
    loadAutoDrop();
  }

  refreshPred();
  setInterval(refreshPred, 15000);
})();

