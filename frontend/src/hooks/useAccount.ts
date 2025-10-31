import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSession } from "../lib/session";

export type ShippingAddress = {
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type AccountUser = {
  id: string;
  email: string;
  name?: string;
  defaultShipping?: ShippingAddress;
  createdAt: string;
  updatedAt: string;
};

export type OrderLineItem = {
  productId: string;
  productTitle?: string;
  qty: number;
  priceCents: number;
  lineTotalCents: number;
};

export type AccountOrder = {
  orderId: string;
  ts: string;
  totalCents: number;
  totalItems: number;
  paymentRef?: string;
  shippingAddress?: ShippingAddress;
  customerName?: string;
  customerEmail?: string;
  items: OrderLineItem[];
};

type ApiResponse<T> = { ok: true } & T;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithSession(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message =
      (typeof errorBody?.error === "string" && errorBody.error) ||
      res.statusText ||
      "Request failed";
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function useAccount(apiBase: string) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meEndpoint = `${apiBase}/api/account/me`;

  const loadUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<ApiResponse<{ user: AccountUser }>>(meEndpoint, {
        method: "GET",
      });
      setUser(data.user);
    } catch (err) {
      setUser(null);
      if (err instanceof Error && err.message !== "Unauthorized") {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [meEndpoint]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const data = await fetchJson<ApiResponse<{ user: AccountUser }>>(
        `${apiBase}/api/account/login`,
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );
      setUser(data.user);
      return data.user;
    },
    [apiBase],
  );

  const register = useCallback(
    async (params: { email: string; password: string; name?: string }) => {
      setError(null);
      const data = await fetchJson<ApiResponse<{ user: AccountUser }>>(
        `${apiBase}/api/account/register`,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );
      setUser(data.user);
      return data.user;
    },
    [apiBase],
  );

  const logout = useCallback(async () => {
    await fetchJson<ApiResponse<Record<string, never>>>(`${apiBase}/api/account/logout`, {
      method: "POST",
    });
    setUser(null);
    setOrders([]);
  }, [apiBase]);

  const saveShipping = useCallback(
    async (address: ShippingAddress) => {
      if (!user) return null;
      const data = await fetchJson<ApiResponse<{ user: AccountUser }>>(
        `${apiBase}/api/account/shipping`,
        {
          method: "POST",
          body: JSON.stringify(address),
        },
      );
      setUser(data.user);
      return data.user;
    },
    [apiBase, user],
  );

  const updateProfile = useCallback(
    async (input: { name?: string; defaultShipping?: ShippingAddress }) => {
      if (!user) return null;
      const data = await fetchJson<ApiResponse<{ user: AccountUser }>>(
        `${apiBase}/api/account/profile`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      );
      setUser(data.user);
      return data.user;
    },
    [apiBase, user],
  );

  const loadOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      return;
    }
    setOrdersLoading(true);
    try {
      const data = await fetchJson<ApiResponse<{ orders: AccountOrder[] }>>(
        `${apiBase}/api/account/orders`,
        {
          method: "GET",
        },
      );
      setOrders(data.orders);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setOrdersLoading(false);
    }
  }, [apiBase, user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      orders,
      ordersLoading,
      login,
      register,
      logout,
      refreshUser: loadUser,
      saveShipping,
      updateProfile,
      loadOrders,
      setOrders,
    }),
    [
      user,
      loading,
      error,
      orders,
      ordersLoading,
      login,
      register,
      logout,
      loadUser,
      saveShipping,
      updateProfile,
      loadOrders,
    ],
  );

  return value;
}

