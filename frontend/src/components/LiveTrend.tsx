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
  next_drop_projection: { startsAt: string; note?: string; status?: string };
  products: PredictItem[];
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(+d) ? "—" : d.toLocaleTimeString();
}

export default function LiveTrend({
  baseUrl = requireBackendUrl(),
}: {
  baseUrl?: string;
}) {
  const [data, setData] = useState<PredictResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let t: any;
    let ac: AbortController;
    const load = async () => {
      try {
        ac = new AbortController();
        const r = await fetch(`${baseUrl}/api/predict`, { signal: ac.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        setData(json);
        setErr(null);
      } catch (e: any) {
        if (e.name !== "AbortError") setErr(e.message || "load error");
      } finally {
        t = setTimeout(load, 5000);
      }
    };
    load();
    return () => {
      ac?.abort();
      clearTimeout(t);
    };
  }, [baseUrl]);

  if (err)
    return <p style={{ color: "#b91c1c" }}>Trend error: {err}</p>;
  if (!data) return <p>Loading trend…</p>;

  const allSoldOut = data.products.every((p) => p.remaining <= 0);
  const isLive = !allSoldOut;

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0 }}>📈 Live Trend Forecast</h2>
        {isLive ? (
          <span className="live-badge">LIVE</span>
        ) : (
          <span style={{ color: "#999", fontWeight: 500 }}>Archived</span>
        )}
      </div>

      <p>
  Next drop projection:{" "}
  <b>{fmt(data.next_drop_projection?.startsAt ?? null)}</b>
</p>

{data.next_drop_projection.status === "archived" && (
  <p style={{ color: "#999" }}>Drop archived</p>
)}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {data.products.map((p) => (
          <div
            key={p.id}
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              padding: 12,
              background: "#fff",
            }}
          >
            <h3 style={{ marginTop: 0 }}>{p.title}</h3>
            <div>
              Remaining: <b>{p.remaining}</b>
            </div>
            <div>
              Velocity (10m): <b>{p.velocity_per_hour_10m.toFixed(1)}</b>/hr
            </div>
            <div>
              Velocity (30m): <b>{p.velocity_per_hour_30m.toFixed(1)}</b>/hr
            </div>
            <div>
              ETA (10m): <b>{fmt(p.projected_sellout_eta_10m)}</b>
            </div>
            <div>
              ETA (30m): <b>{fmt(p.projected_sellout_eta_30m)}</b>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
