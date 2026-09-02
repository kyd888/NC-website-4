import { useEffect, useState } from "react";
import { backendUrl } from "../config";
import { fetchWithSession } from "../lib/session";

/**
 * Lightweight cart count for pages outside the shop (KYD, events, gateway).
 * Reads the same session-backed cart the shop uses, so the header count stays
 * consistent when moving between sections. Fails silently — a missing backend
 * just shows CART (0).
 */
export function useCartCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!backendUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithSession(`${backendUrl}/api/cart/state`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled || !data?.cart || typeof data.cart !== "object") return;
        let total = 0;
        for (const value of Object.values(data.cart as Record<string, unknown>)) {
          if (typeof value === "number") total += value;
          else if (value && typeof value === "object" && "qty" in value) {
            const qty = Number((value as { qty?: number }).qty);
            if (Number.isFinite(qty)) total += qty;
          }
        }
        setCount(Math.max(0, Math.floor(total)));
      } catch {
        // ignore — header just shows 0
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
