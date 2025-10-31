import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithSession } from "../lib/session";

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

export function useDrop(baseUrl: string) {
  const [state, setState] = useState<DropState>("idle");
  const [drop, setDrop] = useState<DropInfo | null>(null);
  const [products, setProducts] = useState<DropProduct[]>([]);
  const [remainingById, setRemainingById] = useState<Record<string, number>>({});
  const [vaultById, setVaultById] = useState<Record<string, VaultInfo>>({});
  const cancelledRef = useRef(false);

  const loadState = useCallback(async () => {
    try {
      const res = await fetchWithSession(`${baseUrl}/api/drop/state`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Drop state ${res.status}`);
      const data: DropResponse = await res.json();
      if (cancelledRef.current) return;

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
      if (!cancelledRef.current) {
        setState("idle");
        setDrop(null);
        setProducts([]);
        setRemainingById({});
        setVaultById({});
      }
    }
  }, [baseUrl]);

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
      refresh: loadState,
    }),
    [state, drop, products, remainingById, vaultById, loadState],
  );
}

