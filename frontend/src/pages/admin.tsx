// src/admin/AdminApp.tsx
import { useEffect, useState } from "react";
import { requireBackendUrl } from "../config";

type PredictItem = {
  id: string;
  title: string;
  remaining: number;
  velocity_per_hour_10m: number;
  velocity_per_hour_30m: number;
  projected_sellout_eta_10m: string | null;
  projected_sellout_eta_30m: string | null;
};

type PredictResponse = {
  generated_at: string;
  next_drop_projection?: { startsAt?: string; note?: string };
  products?: PredictItem[];
};

type Sale = {
  id: string;
  ts: string;
  productId: string;
  qty: number;
  priceCents: number;
  ref?: string;
  ua?: string;
};

const BACKEND_URL = requireBackendUrl();
const ADMIN_KEY = (import.meta as any).env?.VITE_ADMIN_KEY || "";

export default function AdminApp() {
  const [pred, setPred] = useState<PredictResponse | null>(null);
  const [predErr, setPredErr] = useState<string | null>(null);

  const [sales, setSales] = useState<Sale[] | null>(null);
  const [salesErr, setSalesErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${BACKEND_URL}/api/predict`, {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const j = (await r.json()) as PredictResponse;
        setPred(j);
        setPredErr(null);
      } catch (e: any) {
        setPred(null);
        setPredErr(String(e?.message || e));
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${BACKEND_URL}/api/admin/sales?limit=200`, {
          headers: { Accept: "application/json", "x-admin-key": ADMIN_KEY },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const j = await r.json();
        setSales(Array.isArray(j?.sales) ? j.sales : []);
        setSalesErr(null);
      } catch (e: any) {
        setSales(null);
        setSalesErr(String(e?.message || e));
      }
    })();
  }, []);

  const startsAtIso = pred?.next_drop_projection?.startsAt ?? null;
  const nextDropText = startsAtIso ? new Date(startsAtIso).toLocaleString() : "—";

  return (
    <main style={{ maxWidth: 980, margin: "32px auto", padding: "0 18px" }}>
      <h1>Admin — Trends & Sales</h1>

      {predErr && <p style={{ color: "#b91c1c" }}>{predErr}</p>}

      <section>
        <h2>Predictions</h2>
        {!pred && !predErr && <p>Loading…</p>}
        {pred && (
          <>
            <p>Next drop projection: {nextDropText}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {(pred.products ?? []).map((p) => {
                const eta10 = p.projected_sellout_eta_10m
                  ? new Date(p.projected_sellout_eta_10m).toLocaleTimeString()
                  : "—";
                const eta30 = p.projected_sellout_eta_30m
                  ? new Date(p.projected_sellout_eta_30m).toLocaleTimeString()
                  : "—";
                return (
                  <div key={p.id} style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12, background: "#fff" }}>
                    <h3 style={{ marginTop: 0 }}>{p.title}</h3>
                    <div>Remaining: <b>{p.remaining}</b></div>
                    <div>Velocity (10m): <b>{p.velocity_per_hour_10m.toFixed(1)}</b>/hr</div>
                    <div>Velocity (30m): <b>{p.velocity_per_hour_30m.toFixed(1)}</b>/hr</div>
                    <div>ETA (10m): <b>{eta10}</b></div>
                    <div>ETA (30m): <b>{eta30}</b></div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section style={{ marginTop: 30 }}>
        <h2>Sales (last 200)</h2>
        {salesErr && <p style={{ color: "#b91c1c" }}>{salesErr}</p>}
        {!sales && !salesErr && <p>Loading…</p>}
        {sales && (
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>Time</th>
                <th style={th}>Product</th>
                <th style={th}>Qty</th>
                <th style={th}>Price</th>
                <th style={th}>Ref</th>
                <th style={th}>User Agent</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td style={td}>{new Date(s.ts).toLocaleString()}</td>
                  <td style={td}>{s.productId}</td>
                  <td style={td}>{s.qty}</td>
                  <td style={td}>${(s.priceCents / 100).toFixed(2)}</td>
                  <td style={td}>{s.ref || "—"}</td>
                  <td style={td}><span title={s.ua}>{s.ua?.slice(0, 48) || "—"}…</span></td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td style={td} colSpan={6}>No sales yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee", fontWeight: 600, fontSize: 14 };
const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f3f3f3", fontSize: 14 };
