import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBackendJson, readCache, writeCache } from "../lib/backend";

type DropState = "idle" | "scheduled" | "live";
type DropInfo = {
  id: string;
  code?: string;
  startsAt: string;
  endsAt: string;
  status?: DropState | "ended";
};

type DropProduct = {
  id: string;
  title: string;
  priceCents?: number;
  imageUrl?: string;
  remaining: number;
  tags?: string[] | string;
};

type VaultPendingRelease = {
  releaseId: string;
  restockQty: number;
  durationMinutes: number;
  triggeredAt: string;
};

type VaultRelease = {
  id: string;
  productId: string;
  restockQty: number;
  durationMinutes: number;
  triggeredAt: string;
  dropId?: string;
  startsAt?: string;
  endsAt?: string;
  notifiedEmails?: string[];
  status: "pending" | "live" | "completed";
};

export type VaultInfo = {
  saves: number;
  threshold: number;
  pendingRelease?: VaultPendingRelease | null;
  activeRelease?: VaultRelease | null;
  lastRelease?: VaultRelease | null;
};

type DropResponse = {
  state?: DropState;
  drop?: DropInfo | null;
  products?: DropProduct[];
  remaining?: Record<string, number>;
  vault?: Record<string, VaultInfo>;
};

const DROP_CACHE_KEY = "drop_state";

export function useDrop(baseUrl: string) {
  // Seeded from the last visit so a waking backend shows the shop it had,
  // not an empty one. The live fetch overwrites it moments later.
  const cached = readCache<DropResponse>(DROP_CACHE_KEY);
  const [state, setState] = useState<DropState>(cached?.state ?? "idle");
  const [drop, setDrop] = useState<DropInfo | null>(cached?.drop ?? null);
  const [products, setProducts] = useState<DropProduct[]>(cached?.products ?? []);
  const [remainingById, setRemainingById] = useState<Record<string, number>>(cached?.remaining ?? {});
  const [vaultById, setVaultById] = useState<Record<string, VaultInfo>>(cached?.vault ?? {});
  const [waking, setWaking] = useState(false);
  const cancelledRef = useRef(false);

  const loadState = useCallback(async () => {
    try {
      const data = await fetchBackendJson<DropResponse>(`${baseUrl}/api/drop/state`, {
        onRetry: () => {
          if (!cancelledRef.current) setWaking(true);
        },
      });
      if (cancelledRef.current) return;
      setWaking(false);
      writeCache(DROP_CACHE_KEY, data);

      const nextState: DropState = data.state ?? "idle";
      setState(nextState);
      setDrop(data.drop ?? null);

      const rem = data.remaining ?? {};
      setRemainingById(rem);
      setVaultById(data.vault ?? {});

      if (Array.isArray(data.products)) {
        setProducts(
          data.products.map((p) => ({
            id: p.id,
            title: p.title,
            priceCents: p.priceCents,
            imageUrl: p.imageUrl,
            remaining: rem[p.id] ?? p.remaining ?? 0,
            tags: Array.isArray(p.tags)
              ? p.tags
              : typeof p.tags === "string"
              ? p.tags
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              : undefined,
          })),
        );
      } else {
        setProducts([]);
      }
    } catch {
      // Every retry is spent, so the service is down rather than dozing.
      // Whatever is already on screen beats wiping the shop blank.
      if (!cancelledRef.current) setWaking(false);
    }
  }, [baseUrl]);

  // Re-poll every 15s during live drops so phantom inventory decay updates in real-time
  useEffect(() => {
    if (state !== "live") return;
    const interval = setInterval(() => void loadState(), 15_000);
    return () => clearInterval(interval);
  }, [state, loadState]);

  useEffect(() => {
    cancelledRef.current = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;

    const connectStream = () => {
      es = new EventSource(`${baseUrl}/api/inventory/stream`);
      es.addEventListener("inv", (evt) => {
        if (cancelledRef.current) return;
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as {
            productId: string;
            remaining: number;
          };
          setRemainingById((prev) => ({
            ...prev,
            [payload.productId]: payload.remaining,
          }));
          setProducts((prev) =>
            prev.map((item) =>
              item.id === payload.productId
                ? { ...item, remaining: payload.remaining }
                : item,
            ),
          );
        } catch {
          // ignore malformed SSE payload
        }
      });
      es.onerror = () => {
        es?.close();
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(connectStream, 1500);
      };
    };

    void loadState();
    connectStream();

    return () => {
      cancelledRef.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [baseUrl, loadState]);

  return useMemo(
    () => ({
      state,
      drop,
      products,
      remainingById,
      vaultById,
      waking,
      refresh: loadState,
    }),
    [state, drop, products, remainingById, vaultById, waking, loadState],
  );
}

export default useDrop;
