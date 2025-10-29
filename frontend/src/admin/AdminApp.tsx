
import { useEffect, useMemo, useState } from "react";
import { requireBackendUrl } from "../config";

const BASE = requireBackendUrl();
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || "";
type Predict = { next_drop_projection:{startsAt:string}; products:{ id:string; title:string; remaining:number; velocity_per_hour_10m:number; velocity_per_hour_30m:number; projected_sellout_eta_10m:string|null; projected_sellout_eta_30m:string|null; }[] };
type SalesResp = { sales:{ id:string; t:number; productId:string; qty:number; priceCents?:number; ref?:string; ua?:string }[]; totals: Record<string,{units:number;revenue:number}> };
export default function AdminApp(){
  const [pred,setPred]=useState<Predict|null>(null); const [sales,setSales]=useState<SalesResp|null>(null); const [err,setErr]=useState<string|null>(null);
  useEffect(()=>{ let t:any; const load=async()=>{ try{ const [p,s]=await Promise.all([ fetch(`${BASE}/api/predict`,{headers:{"x-admin-key":ADMIN_KEY}}).then(r=>r.json()), fetch(`${BASE}/api/admin/sales?limit=200`,{headers:{"x-admin-key":ADMIN_KEY}}).then(r=>r.json()) ]); setPred(p); setSales(s); setErr(null);}catch(e:any){ setErr(e.message||"Failed to load admin data"); } finally{ t=setTimeout(load,5000);} }; load(); return ()=>clearTimeout(t); },[]);
  const totalRevenue = useMemo(()=> sales ? Object.values(sales.totals).reduce((n,x)=>n+x.revenue,0) : 0, [sales]);
  return <div style={{fontFamily:"Inter, system-ui, sans-serif", padding:24, maxWidth:1100, margin:"0 auto"}}>
    <h1>Admin — Trends & Sales</h1>{err && <div style={{color:"#b91c1c"}}>{err}</div>}
    <section style={{marginTop:12}}><h2>Predictions</h2>{!pred ? <p>Loading…</p> : <>
      <p>Next drop projection: <b>{new Date(pred.next_drop_projection.startsAt).toLocaleString()}</b></p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px,1fr))",gap:12}}>{pred.products.map(p=>(
        <div key={p.id} style={{border:"1px solid #e5e5e5",borderRadius:12,padding:12,background:"#fff"}}>
          <h3 style={{marginTop:0}}>{p.title}</h3>
          <div>Remaining: <b>{p.remaining}</b></div>
          <div>Velocity (10m): <b>{p.velocity_per_hour_10m.toFixed(1)}</b>/hr</div>
          <div>Velocity (30m): <b>{p.velocity_per_hour_30m.toFixed(1)}</b>/hr</div>
          <div>ETA (10m): <b>{p.projected_sellout_eta_10m ? new Date(p.projected_sellout_eta_10m).toLocaleTimeString() : "—"}</b></div>
          <div>ETA (30m): <b>{p.projected_sellout_eta_30m ? new Date(p.projected_sellout_eta_30m).toLocaleTimeString() : "—"}</b></div>
        </div>))}
      </div></>}
    </section>
    <section style={{marginTop:24}}><h2>Sales (last 200)</h2>{!sales ? <p>Loading…</p> : <>
      <p>Total revenue: <b>${(totalRevenue/100).toFixed(2)}</b></p>
      <div style={{overflowX:"auto",border:"1px solid #eee",borderRadius:10}}>
        <table style={{borderCollapse:"collapse",width:"100%"}}><thead><tr style={{background:"#fafafa"}}>
          <th style={th}>Time</th><th style={th}>Product</th><th style={th}>Qty</th><th style={th}>Price</th><th style={th}>Ref</th><th style={th}>User Agent</th>
        </tr></thead><tbody>{sales.sales.map(s=>(<tr key={s.id}><td style={td}>{new Date(s.t).toLocaleString()}</td><td style={td}>{s.productId}</td><td style={td}>{s.qty}</td><td style={td}>{s.priceCents?`$${(s.priceCents/100).toFixed(2)}`:"—"}</td><td style={td}>{s.ref||"—"}</td><td style={{...td,maxWidth:320,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.ua||"—"}</td></tr>))}</tbody></table>
      </div></>}
    </section>
  </div>;
}
const th: React.CSSProperties = { textAlign:"left", padding:"8px 10px", fontSize:13, borderBottom:"1px solid #eee" };
const td: React.CSSProperties = { padding:"8px 10px", fontSize:13, borderBottom:"1px solid #f2f2f2" };
