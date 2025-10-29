import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { useDrop } from "./hooks/useDrop";
import {
  useAccount,
  type AccountUser,
  type AccountOrder,
  type ShippingAddress as AccountShippingAddress,
} from "./hooks/useAccount";

type BackendProduct = {
  � string;
  title: string;
  priceCents: number;
  imageUrl?: string;
  tags?: string[] | string;
  remaining?: number;
};

type ProductCard = {
  � string;
  title: string;
  priceCents: number;
  img: string;
  � string;
  tags: string[];
  order: number;
};

type PaymentIntentState = {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
};

type CheckoutCustomer = {
  name?: string;
  email?: string;
  address?: {
    line1: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
};

type OrderConfirmation = {
  orderId: string;
  totalCents: number;
  totalItems: number;
  customer: CheckoutCustomer;
  paymentRef?: string;
};

type SaveSheetState = {
  productId: string;
  email: string;
  status: "idle" | "saving" | "success" | "error";
  message?: string;
};
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8787";
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

const IMAGE_OVERRIDES: Record<string, { img?: string; bg?: string }> = {
  "tee-black": { img: "/tee-black.PNG", � "#f2f2ee" },
};

type BackendCartSnapshot = Record<
  string,
  number � qty?: number; holdMsRemaining?: number; holdSecondsRemaining?: number; holdUntil?: number }
>;

type CartItem = {
  � string;
  qty: number;
  holdExpiresAt: number | null;
};

const CART_HOLD_MS � * 60 * 1000;

const toCartList = (map?: BackendCartSnapshot | null): CartItem[] => {
  const entries = Object.entries(map ?? {});
  const � = Date.now();
  return entries
    .map(([id, value]) => {
 �  � qty = 0;
 �  � holdMs: number | null = null;
 �  if (typeof value � "number") {
 �    � = value;
 �  } else if (value && typeof value � "object") {
 �    � = Number.isFinite(value.qty) ? Number(value.qty) : qty;
 �   � (Number.isFinite(value.holdMsRemaining)) {
 �  � holdMs = Number(value.holdMsRemaining);
 �  � else if (Number.isFinite(value.holdSecondsRemaining)) {
 �  � holdMs = Number(value.holdSecondsRemaining) * 1000;
 �  � else if (Number.isFinite(value.holdUntil)) {
 �  � holdMs = Number(value.holdUntil) - now;
 �    }
 �  }
 �  � = Math.max(0, Math.floor(qty));
 �  if (!qty) return null;
 �  const holdExpiresAt =
 �    holdMs != null ? � + Math.max(0, holdMs) : � + CART_HOLD_MS;
 �  return { � qty, holdExpiresAt };
    })
    .filter((item): item is CartItem => item � null);
};

const formatCurrency = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % � === � 0 : 2,
  });

const formatHoldCountdown = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

const MULTIPLY = "\u00D7";

function App() {
  const {
    state: dropState,
    remainingById,
    vaultById,
    refresh: refreshDropState,
  � useDrop(BACKEND_URL);
  const account = useAccount(BACKEND_URL);

  const [catalog, setCatalog] = useState<ProductCard[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [saveSheet, setSaveSheet] = useState<SaveSheetState | null>(null);
  const [saveBusy, setSaveBusy] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentIntentState, setPaymentIntentState] = useState<PaymentIntentState | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
 � []);

  useEffect(() => {
    setCart((prev) => {
 �  const filtered = prev.filter(
 �    (item) => !item.holdExpiresAt || item.holdExpiresAt > nowTick,
 �  );
 �  return filtered.length � prev.length ? prev : filtered;
    });
 � [nowTick]);

  useEffect(() => {
    � cancelled = false;

    const normalizeImage = (url?: string) => {
 �  if (!url) return "";
 �  � src = url.trim();
 �  if (!src) return "";
 �  � = src.replace(/\\/g, "/");
 �  � = src.replace(/^\/?public\//i, "/");
 �  if (!/^https?:\/\//i.test(src) && !src.startsWith("/")) {
 �    � = � + src;
 �  }
 �  return src;
    };

    const fetchCatalog = async () => {
 �  setLoadingCatalog(true);
 �  � {
 �    const � = await fetch(`${BACKEND_URL}/api/products`, {
 �  � headers: { Accept: "application/json" },
 �  � credentials: "include",
 �    });
 �   � (!res.ok) throw � Error(`Request failed: ${res.status}`);
 �    const data = await res.json();
 �    const list: BackendProduct[] = Array.isArray(data?.products)
 �  � ? data.products
 �  � : Array.isArray(data)
 �  � ? data
 �  � : [];

 �    const cards: ProductCard[] = list.map((product, index) => {
 �  � const ov = IMAGE_OVERRIDES[product.id] ?? {};
 �  � const � = ov.img || normalizeImage(product.imageUrl) || "/placeholder.png";
 �  � return {
 �  �   � product.id,
 �  �   title: product.title,
 �  �   priceCents: product.priceCents,
 �  �   img,
 �  �   � ov.bg || "#f2f2ee",
 �  �   tags: Array.isArray(product.tags)
 �  �   � product.tags
 �  �   � typeof product.tags � "string"
 �  �   � product.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
 �  �   � [],
 �  �   order: index,
 �  � };
 �    });

 �   � (!cancelled) {
 �  � setCatalog(cards);
 �  � setLoadError(null);
 �    }
 �  } catch (err) {
 �   � (!cancelled) {
 �  � setCatalog([]);
 �  � setLoadError(err instanceof Error ? err.message : "Unable to load catalog");
 �    }
 �  } finally {
 �   � (!cancelled) setLoadingCatalog(false);
 �  }
    };

    fetchCatalog();

    return () => {
 �  cancelled = true;
    };
 � [dropState, refreshKey]);

  const visibleCatalog = useMemo(() => {
    const sorted = [...catalog].sort((a, b) => {
 �  const remainingA = remainingById[a.id] ?? 0;
 �  const remainingB = remainingById[b.id] ?? 0;
 �  const inStockA = remainingA � ? � 0;
 �  const inStockB = remainingB � ? � 0;
 �  if (inStockA � inStockB) {
 �    return inStockB - inStockA;
 �  }

 �  const tagA = a.tags[0]?.toLowerCase() ?? "";
 �  const tagB = b.tags[0]?.toLowerCase() ?? "";
 �  if (tagA && tagB) {
 �    const � = tagA.localeCompare(tagB);
 �   � (cmp � 0) return cmp;
 �  } else if (tagA && !tagB) {
 �    return -1;
 �  } else if (!tagA && tagB) {
 �    return 1;
 �  }
 �  return a.order - b.order;
    });

    return sorted;
 � [catalog, remainingById]);

  useEffect(() => {
    const visibility = � Map<string, number>();
    const observer = � IntersectionObserver(
 �  (entries) => {
 �    � (const entry of entries) {
 �  � const id = (entry.target as HTMLElement).dataset.pid;
 �  � if (!id) continue;
 �  � if (entry.isIntersecting) {
 �  �   visibility.set(id, entry.intersectionRatio);
 �  � } else {
 �  �   visibility.delete(id);
 �  � }
 �    }

 �    � bestId: string | null = null;
 �    � bestRatio = 0;
 �    visibility.forEach((ratio, � => {
 �  � if (ratio > bestRatio) {
 �  �   bestRatio = ratio;
 �  �   bestId = id;
 �  � }
 �    });

 �   � (!bestId && visibleCatalog.length) {
 �  � bestId = visibleCatalog[0].id;
 �    }

 �   � (bestId) {
 �  � setActiveId((prev) => (prev � bestId ? prev : bestId));
 �    }
 �  },
 �  { threshold: [0.25, 0.5, 0.75, 0.9] },
    );

    visibleCatalog.forEach((item) => {
 �  const node = sectionRefs.current[item.id];
 �  if (node) observer.observe(node);
    });

    return () => observer.disconnect();
 � [visibleCatalog]);

  useEffect(() => {
   � (!visibleCatalog.length) {
 �  setActiveId(null);
  � else {
 �  setActiveId((prev) => (prev ? prev : visibleCatalog[0].id));
    }
 � [visibleCatalog]);

  const active = useMemo(() => {
   � (!visibleCatalog.length) return null;
    const fallback = visibleCatalog[0];
   � (!activeId) return fallback;
    return visibleCatalog.find((item) => item.id � activeId) ?? fallback;
 � [visibleCatalog, activeId]);

  const totalRemaining = useMemo(
   � =>
 �  Object.entries(remainingById).reduce(
 �    (acc, [, qty]) => (Number.isFinite(qty) ? � + � : acc),
 �    0,
 �  ),
    [remainingById],
  );

  const activeRemaining = active ? remainingById[active.id] ?? � 0;
  const isLive = dropState � "live";
  const canAdd = Boolean(active && isLive && activeRemaining > 0);
  const showSave = Boolean(active && (!isLive || activeRemaining <= 0));
  const isSaved = active ? Boolean(savedIds[active.id]) : false;
  const primaryBusy = active ? saveBusy � active.id : false;
  const primaryDisabled = !active
  � true
  � canAdd
  � false
  � showSave
  � primaryBusy || isSaved
  � true;
  const primaryLabel = canAdd
  � "Add"
  � showSave
  � primaryBusy
 �  ? "Saving..."
 �  : isSaved
 �  ? "Saved"
 �  : "Save"
  � "Locked";
  const primaryTitle = canAdd
  � "Add to cart"
  � showSave
  � isSaved
 �  ? "Saved to your Vault list"
 �  : "Save this item to unlock � next Vault release"
  � !isLive
  � "Drop � live"
  � "Sold out";
  const cartDetails = useMemo(
   � =>
 �  cart.map((item) => {
 �    const product = catalog.find((p) => p.id � item.id);
 �    const priceCents = product?.priceCents ?? 0;
 �    const holdSecondsRemaining =
 �  � item.holdExpiresAt != null
 �  �   ? Math.max(0, Math.ceil((item.holdExpiresAt - nowTick) / 1000))
 �  �   : null;
 �    return {
 �  � ...item,
 �  � title: product?.title ?? item.id,
 �  � priceCents,
 �  � lineTotal: priceCents * item.qty,
 �  � available: remainingById[item.id] ?? 0,
 �  � holdSecondsRemaining,
 �    };
 �  }),
    [cart, catalog, remainingById, nowTick],
  );

  const itemsTotal = cartDetails.reduce((acc, item) => � + item.qty, 0);
  const priceTotalCents = cartDetails.reduce((acc, item) => � + item.lineTotal, 0);

  const showToast = (message: string, duration = 1200) => {
    setToast(message);
    window.setTimeout(() => setToast(""), duration);
  };

  async function addToCart(productId: string) {
    � {
 �  const � = await fetch(`${BACKEND_URL}/api/cart/add`, {
 �    method: "POST",
 �    headers: { "Content-Type": "application/json" },
 �    body: JSON.stringify({ productId, qty: 1 }),
 �    credentials: "include",
 �  });
 �  const json = await res.json().catch(() => ({}));
 �  if (!res.ok || !json.ok) {
 �    showToast(json.error ?? res.statusText ?? "Unable to add", 1600);
 �    return;
 �  }
 �  if (json.cart) {
 �    setCart(toCartList(json.cart));
 �  } else {
 �    setCart((prev) => {
 �  � const � = Date.now();
 �  � const existing = prev.find((item) => item.id � productId);
 �  � if (existing) {
 �  �   return prev.map((item) =>
 �  �     item.id � productId
 �  �  �  � ...item, qty: item.qty + 1, holdExpiresAt: � + CART_HOLD_MS }
 �  �  �  : item,
 �  �   );
 �  � }
 �  � return [...prev, { � productId, qty: 1, holdExpiresAt: � + CART_HOLD_MS }];
 �    });
 �  }
 �  showToast("Added to cart");
  � catch {
 �  showToast("Network error", 1600);
    }
  }

  async function saveProduct(
    productId: string,
    params?: { email?: string; name?: string; silent?: boolean },
  ) {
    � {
 �  setSaveBusy(productId);
 �  const payload: Record<string, unknown> � productId };
 �  const email = params?.email?.trim();
 �  const name = params?.name?.trim();

 �  if (account.user) {
 �   � (!account.user.email && email) payload.email = email;
 �   � (!account.user.name && name) payload.name = name;
 �  } else {
 �   � (email) payload.email = email;
 �   � (name) payload.name = name;
 �  }

 �  const � = await fetch(`${BACKEND_URL}/api/save`, {
 �    method: "POST",
 �    headers: { "Content-Type": "application/json" },
 �    body: JSON.stringify(payload),
 �    credentials: "include",
 �  });
 �  const json = await res.json().catch(() => ({}));
 �  if (!res.ok || !json?.ok) {
 �    throw � Error(json?.error ?? res.statusText ?? "Unable to save item");
 �  }
 �  setSavedIds((prev) => ({ ...prev, [productId]: true }));
 �  if (!params?.silent) {
 �    showToast(json.releaseTriggered ? "Vault release triggered!" : "Saved", 2000);
 �  }
 �  await refreshDropState();
 �  return json;
  � catch (error) {
 �  const message =
 �    error instanceof Error ? error.message : "Unable to save this item";
 �  if (!params?.silent) {
 �    showToast(message, 2200);
 �  }
 �  throw error;
  � finally {
 �  setSaveBusy(null);
    }
  }

  const handleSaveSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
   � (!saveSheet) return;
    const email = saveSheet.email.trim();
   � (!email || !email.includes("@")) {
 �  setSaveSheet((prev) =>
 �    prev
 �  � ? {
 �  �     ...prev,
 �  �     status: "error",
 �  �     message: "Enter a valid email to � notified.",
 �  �   }
 �  � : prev,
 �  );
 �  return;
    }
    � {
 �  setSaveSheet((prev) =>
 �    prev
 �  � ? {
 �  �     ...prev,
 �  �     status: "saving",
 �  �     message: undefined,
 �  �   }
 �  � : prev,
 �  );
 �  const response = await saveProduct(saveSheet.productId, {
 �    email,
 �    silent: true,
 �  });
 �  setSaveSheet((prev) =>
 �    prev && prev.productId � saveSheet.productId
 �  � ? {
 �  �     ...prev,
 �  �     status: "success",
 �  �     message: response?.releaseTriggered
 �  �  �  ? "Threshold hit! Watch your inbox � the Vault window."
 �  �  �  : "Saved. We'll email � for � next Vault release.",
 �  �   }
 �  � : prev,
 �  );
 �  window.setTimeout(() => setSaveSheet(null), 1600);
  � catch (error) {
 �  const message =
 �    error instanceof Error ? error.message : "Unable to save this item";
 �  setSaveSheet((prev) =>
 �    prev && prev.productId � saveSheet.productId
 �  � ? { ...prev, status: "error", message }
 �  � : prev,
 �  );
    }
  };

  async function removeFromCart(productId: string, � = 1, message?: string) {
    � {
 �  const � = await fetch(`${BACKEND_URL}/api/cart/remove`, {
 �    method: "POST",
 �    headers: { "Content-Type": "application/json" },
 �    body: JSON.stringify({ productId, � }),
 �    credentials: "include",
 �  });
 �  const json = await res.json().catch(() => ({}));
 �  if (!res.ok || !json.ok) {
 �    showToast(json.error ?? res.statusText ?? "Unable to update cart", 1600);
 �    return;
 �  }
 �  if (json.cart) {
 �    setCart(toCartList(json.cart));
 �  }
 �  if (message) showToast(message, 1500);
  � catch {
 �  showToast("Network error", 1600);
    }
  }

  async function beginCheckout() {
   � (!itemsTotal) {
 �  showToast("Cart is empty", 1600);
 �  return;
    }
   � (!stripePromise) {
 �  showToast("Checkout unavailable", 2000);
 �  return;
    }
    setCheckoutLoading(true);
    setPaymentError(null);
    � {
 �  const � = await fetch(`${BACKEND_URL}/api/checkout/create-intent`, {
 �    method: "POST",
 �    credentials: "include",
 �  });
 �  const json = await res.json().catch(() => ({}));
 �  if (!res.ok || !json.clientSecret) {
 �    showToast(json.error ?? "Unable to start checkout", 2000);
 �    return;
 �  }
 �  setPaymentIntentState({
 �    clientSecret: json.clientSecret,
 �    paymentIntentId: json.paymentIntentId,
 �    amount: Number(json.amount) || priceTotalCents,
 �  });
 �  setCartOpen(false);
 �  setPaymentModalOpen(true);
  � catch {
 �  showToast("Checkout error", 2000);
  � finally {
 �  setCheckoutLoading(false);
    }
  }

  async function finalizeCheckout(paymentIntentId: string, customer: CheckoutCustomer): Promise<boolean> {
    � {
 �  const � = await fetch(`${BACKEND_URL}/api/checkout/confirm`, {
 �    method: "POST",
 �    credentials: "include",
 �    headers: { "Content-Type": "application/json" },
 �    body: JSON.stringify({ paymentIntentId, customer }),
 �  });
 �  const json = await res.json().catch(() => ({}));
 �  if (!res.ok || !json.ok) {
 �    setPaymentError(json.error ?? "Checkout failed");
 �    return false;
 �  }
 �  setCart([]);
 �  setPaymentIntentState(null);
 �  setPaymentModalOpen(false);
 �  const confirmed: OrderConfirmation = {
 �    orderId: String(json.orderId ?? paymentIntentId ?? ""),
 �    totalCents: Number(json?.totals?.grossCents ?? paymentIntentState?.amount ?? 0),
 �    totalItems: Number(json?.totals?.items ?? itemsTotal ?? 0),
 �    customer,
 �    paymentRef: paymentIntentId ?? undefined,
 �  };
 �  setOrderConfirmation(confirmed);
 �  showToast("Order confirmed", 2000);
 �  if (account.user) {
 �    void account.loadOrders();
 �    void account.refreshUser();
 �  }
 �  return true;
  � catch {
 �  setPaymentError("Checkout confirmation failed");
 �  return false;
    }
  }

  const handlePaymentClose = () => {
   � (paymentProcessing) return;
    setPaymentModalOpen(false);
    setPaymentIntentState(null);
    setPaymentError(null);
  };

  const handlePaymentComplete = async (paymentIntentId: string, customer: CheckoutCustomer) => {
    setPaymentProcessing(true);
    setPaymentError(null);
    const ok = await finalizeCheckout(paymentIntentId, customer);
    setPaymentProcessing(false);
    return ok;
  };

  const handleConfirmationClose = () => {
    setOrderConfirmation(null);
  };

  const refetchCatalog = () => setRefreshKey((key) => � + 1);

  return (
    <div className="grain" style={{ background: "#f2f2ee" }}>
 �  <header className="header">
 �    <div className="container header-row">
 �  � <div className="brand">
 �  �   <img className="brand-mark" src="/logo.png" alt="NC" />
 �  �   <div className="collection">PRE-SEASON 001</div>
 �  � </div>
 �  � <div className="header-right">
 �  �   <div className="status">
 �  �     <span className={`dot ${isLive && totalRemaining � ? "dot-live" : "dot-idle"}`} />
 �  �     <span className="state">{isLive ? "LIVE" : dropState � "scheduled" ? "scheduled" : "idle"}</span>
 �  �     {totalRemaining � && (
 �  �  �  <>
 �  �  �    <span className="sep" />
 �  �  �    <span className="pill">Remaining: {Math.max(0, activeRemaining)}</span>
 �  �  �  </>
 �  �     )}
 �  �   </div>
 �  �   <button
 �  �     type="button"
 �  �     className={`account-button ${account.user ? "is-auth" : "is-guest"}`}
 �  �     onClick={() => setAccountOpen(true)}
 �  �     aria-label={account.user ? "View account" : "Sign in"}
 �  �   >
 �  �     <span className="account-avatar" aria-hidden="true">
 �  �  �  <span className="dot-stack">
 �  �  �    <span />
 �  �  �    <span />
 �  �  �    <span />
 �  �  �  </span>
 �  �     </span>
 �  �   </button>
 �  � </div>
 �    </div>
 �  </header>

 �  {loadingCatalog && <div style={{ padding: 24 }}>Loading catalog...</div>}
 �  {!loadingCatalog && loadError && <div style={{ padding: 24 }}>{loadError}</div>}
 �  {!loadingCatalog && !loadError && visibleCatalog.length � 0 && (
 �    <div className="empty-state">
 �  � <div className="empty-card">
 �  �   <div className="empty-glow" />
 �  �   <div className="empty-badge">DROP PAUSED</div>
 �  �   <h2>Curating � next release</h2>
 �  �   <p>
 �  �     � next capsule is being finished in � studio. Keep this window open � we'll
 �  �     light it up � moment inventory lands.
 �  �   </p>
 �  �   <button type="button" className="empty-refresh" onClick={refetchCatalog}>
 �  �     Refresh catalog
 �  �   </button>
 �  � </div>
 �    </div>
 �  )}

 �  {visibleCatalog.map((product) => (
 �    <section
 �  � key={product.id}
 �  � className="section"
 �  � style={{ background: product.bg }}
 �  � data-tag={product.tags[0] ?? ""}
 �    >
 �  � <div
 �  �   ref={(el) => {
 �  �     sectionRefs.current[product.id] = el;
 �  �   }}
 �  �   data-pid={product.id}
 �  �   className="media"
 �  � >
 �  �   <img src={product.img} alt={product.title} loading="lazy" />
 �  � </div>
 �    </section>
 �  ))}

 �  {active && (
 �    <div className="meta">
 �  � <div style={{ display: "grid", gap: 6 }}>
 �  �   <div className="title-wrap">
 �  �     <AnimatePresence mode="wait" initial={false}>
 �  �  �  <motion.span
 �  �  �    key={active.id}
 �  �  �    className="title"
 �  �  �    initial={{ opacity: 0, y: 6 }}
 �  �  �    animate={{ opacity: 1, y: 0 }}
 �  �  �    exit={{ opacity: 0, y: -6 }}
 �  �  �    transition={{ duration: 0.22, ease: "easeOut" }}
 �  �  �  >
 �  �  �    {active.title}
 �  �  �  </motion.span>
 �  �     </AnimatePresence>
 �  �   </div>
 �  �   <div className="price">{formatCurrency(active.priceCents)}</div>
 �  �   {active.tags.length � && (
 �  �     <div className="tagline">{active.tags.join(" � ")}</div>
 �  �   )}
 �  � </div>

 �  � <div className={`meta-actions${itemsTotal � ? " has-bag" : ""}`}>
 �  �   <div className="meta-primary">
 �  �     <button
 �  �  �  className={`cta ${canAdd ? "live" : showSave ? "save" : ""}`}
 �  �  �  onClick={() => {
 �  �  �   � (!active || primaryDisabled) return;
 �  �  �   � (canAdd) {
 �  �  �  � void addToCart(active.id);
 �  �  �  � return;
 �  �  �    }
 �  �  �   � (showSave) {
 �  �  �  � if (account.user?.email) {
 �  �  �  �   void saveProduct(active.id, { silent: false });
 �  �  �  � } else {
 �  �  �  �   setSaveSheet((prev) => ({
 �  �  �  �     productId: active.id,
 �  �  �  �     email: prev?.productId � active.id ? prev.email : "",
 �  �  �  �     status: "idle",
 �  �  �  �   }));
 �  �  �  � }
 �  �  �    }
 �  �  �  }}
 �  �  �  disabled={primaryDisabled}
 �  �  �  title={primaryTitle}
 �  �     >
 �  �  �  {primaryLabel}
 �  �     </button>
 �  �   </div>
 �  �   {itemsTotal � && (
 �  �     <div className="meta-secondary">
 �  �  �  <button
 �  �  �    type="button"
 �  �  �    className="bag-cta"
 �  �  �    onClick={() => setCartOpen(true)}
 �  �  �    title="Review cart"
 �  �  �  >
 �  �  �    <span className="bag-cta__count">{itemsTotal}</span>
 �  �  �    <span className="bag-cta__label">Bag</span>
 �  �  �    <span className="bag-cta__total">{formatCurrency(priceTotalCents)}</span>
 �  �  �  </button>
 �  �     </div>
 �  �   )}
 �  � </div>
 �    </div>
 �  )}

 �  <AnimatePresence>
 �    {toast && (
 �  � <motion.div
 �  �   className="toast"
 �  �   initial={{ opacity: 0, y: 10 }}
 �  �   animate={{ opacity: 1, y: 0 }}
 �  �   exit={{ opacity: 0, y: 10 }}
 �  � >
 �  �   {toast}
 �  � </motion.div>
 �    )}
 �  </AnimatePresence>

 �  <AnimatePresence>
 �    {saveSheet && (
 �  � <>
 �  �   <motion.div
 �  �     key="save-backdrop"
 �  �     className="save-backdrop"
 �  �     initial={{ opacity: 0 }}
 �  �     animate={{ opacity: � }}
 �  �     exit={{ opacity: 0 }}
 �  �     onClick={() => (saveSheet.status � "saving" ? null : setSaveSheet(null))}
 �  �   />
 �  �   <motion.div
 �  �     key="save-sheet"
 �  �     className="save-sheet"
 �  �     initial={{ y: "100%" }}
 �  �     animate={{ y: 0 }}
 �  �     exit={{ y: "100%" }}
 �  �     transition={{ type: "spring", stiffness: 260, damping: 28 }}
 �  �   >
 �  �     <div className="save-sheet__header">
 �  �  �  <div>
 �  �  �    <div className="save-sheet__badge">Vault save</div>
 �  �  �    <h3>Get notified when it unlocks</h3>
 �  �  �  </div>
 �  �  �  <button
 �  �  �    type="button"
 �  �  �    className="save-sheet__close"
 �  �  �    onClick={() => setSaveSheet(null)}
 �  �  �    disabled={saveSheet.status � "saving"}
 �  �  �  >
 �  �  �    Close
 �  �  �  </button>
 �  �     </div>
 �  �     <form className="save-sheet__form" onSubmit={handleSaveSubmit}>
 �  �  �  <label htmlFor="save-email">Email</label>
 �  �  �  <input
 �  �  �    id="save-email"
 �  �  �    type="email"
 �  �  �    inputMode="email"
 �  �  �    autoComplete="email"
 �  �  �    placeholder="you@example.com"
 �  �  �    value={saveSheet.email}
 �  �  �    onChange={(event) =>
 �  �  �  � setSaveSheet((prev) =>
 �  �  �  �   prev && prev.productId � saveSheet.productId
 �  �  �  �   � {
 �  �  �  �  �    ...prev,
 �  �  �  �  �    email: event.target.value,
 �  �  �  �  �    status: prev.status � "error" || prev.status � "success" ? "idle" : prev.status,
 �  �  �  �  �    message: prev.status � "error" ? undefined : prev.message,
 �  �  �  �  �  }
 �  �  �  �   � prev,
 �  �  �  � )
 �  �  �    }
 �  �  �    disabled={saveSheet.status � "saving"}
 �  �  �    required
 �  �  �  />
 �  �  �  <p className="save-sheet__note">
 �  �  �    Save it once. We'll email � when � Vault restocks this product.
 �  �  �  </p>
 �  �  �  {saveSheet.message && (
 �  �  �    <div className={`save-sheet__message save-sheet__message--${saveSheet.status}`}>
 �  �  �  � {saveSheet.message}
 �  �  �    </div>
 �  �  �  )}
 �  �  �  <div className="save-sheet__actions">
 �  �  �    <button
 �  �  �  � type="button"
 �  �  �  � className="save-sheet__cancel"
 �  �  �  � onClick={() => setSaveSheet(null)}
 �  �  �  � disabled={saveSheet.status � "saving"}
 �  �  �    >
 �  �  �  � Cancel
 �  �  �    </button>
 �  �  �    <button
 �  �  �  � type="submit"
 �  �  �  � className="save-sheet__submit"
 �  �  �  � disabled={
 �  �  �  �   saveSheet.status � "saving" ||
 �  �  �  �   saveSheet.status � "success" ||
 �  �  �  �   !saveSheet.email.trim()
 �  �  �  � }
 �  �  �    >
 �  �  �  � {saveSheet.status � "saving"
 �  �  �  �   ? "Saving..."
 �  �  �  �   : saveSheet.status � "success"
 �  �  �  �   ? "Saved!"
 �  �  �  �   : "Save"}
 �  �  �    </button>
 �  �  �  </div>
 �  �     </form>
 �  �   </motion.div>
 �  � </>
 �    )}
 �  </AnimatePresence>

 �  <AnimatePresence>
 �    {cartOpen && itemsTotal � && (
 �  � <>
 �  �   <motion.div
 �  �     key="cart-backdrop"
 �  �     className="cart-backdrop"
 �  �     initial={{ opacity: 0 }}
 �  �     animate={{ opacity: 1 }}
 �  �     exit={{ opacity: 0 }}
 �  �     onClick={() => setCartOpen(false)}
 �  �   />
 �  �   <motion.div
 �  �     key="cart-sheet"
 �  �     className="cart-sheet"
 �  �     initial={{ y: "100%" }}
 �  �     animate={{ y: 0 }}
 �  �     exit={{ y: "100%" }}
 �  �     transition={{ type: "spring", stiffness: 260, damping: 26 }}
 �  �   >
 �  �     <div className="cart-sheet__header">
 �  �  �  <span>Bag</span>
 �  �  �  <button
 �  �  �    type="button"
 �  �  �    className="cart-sheet__close"
 �  �  �    onClick={() => setCartOpen(false)}
 �  �  �  >
 �  �  �    Close
 �  �  �  </button>
 �  �     </div>
 �  �     <div className="cart-sheet__body">
 �  �  �  {cartDetails.map((item) => (
 �  �  �    <div className="cart-line" key={item.id}>
 �  �  �  � <div className="cart-line__info">
 �  �  �  �   <div className="cart-line__title">{item.title}</div>
 �  �  �  �   <div className="cart-line__meta">
 �  �  �  �     {item.qty} {MULTIPLY} {formatCurrency(item.priceCents)}
 �  �  �  �   </div>
 �  �  �  �   {item.holdSecondsRemaining != null && item.holdSecondsRemaining � && (
 �  �  �  �     <div className="cart-line__hold">
 �  �  �  �  �  Hold {formatHoldCountdown(item.holdSecondsRemaining)}
 �  �  �  �     </div>
 �  �  �  �   )}
 �  �  �  �   <div className="cart-line__controls">
 �  �  �  �     <button
 �  �  �  �  �  type="button"
 �  �  �  �  �  onClick={() => removeFromCart(item.id, 1)}
 �  �  �  �  �  aria-label={`Remove � ${item.title}`}
 �  �  �  �     >
 �  �  �  �  �  -
 �  �  �  �     </button>
 �  �  �  �     <span className="cart-line__qty">{item.qty}</span>
 �  �  �  �     <button
 �  �  �  �  �  type="button"
 �  �  �  �  �  onClick={() => addToCart(item.id)}
 �  �  �  �  �  aria-label={`Add � ${item.title}`}
 �  �  �  �     >
 �  �  �  �  �  +
 �  �  �  �     </button>
 �  �  �  �   </div>
 �  �  �  �   <button
 �  �  �  �     type="button"
 �  �  �  �     className="cart-line__remove"
 �  �  �  �     onClick={() => removeFromCart(item.id, item.qty, "Removed from cart")}
 �  �  �  �   >
 �  �  �  �     Remove
 �  �  �  �   </button>
 �  �  �  � </div>
 �  �  �  � <div className="cart-line__total">{formatCurrency(item.lineTotal)}</div>
 �  �  �    </div>
 �  �  �  ))}
 �  �     </div>
 �  �     <div className="cart-sheet__footer">
 �  �  �  <div className="cart-sheet__summary">
 �  �  �    <span>Total</span>
 �  �  �    <strong>{formatCurrency(priceTotalCents)}</strong>
 �  �  �  </div>
 �  �  �  <button
 �  �  �    type="button"
 �  �  �    className="cart-sheet__checkout"
 �  �  �    onClick={beginCheckout}
 �  �  �    disabled={checkoutLoading}
 �  �  �  >
 �  �  �    {checkoutLoading ? "Preparing..." : "Checkout"}
 �  �  �  </button>
 �  �     </div>
 �  �   </motion.div>
 �  � </>
 �    )}
 �  </AnimatePresence>

 �  <PaymentModal
 �    open={paymentModalOpen}
 �    intent={paymentIntentState}
 �    onRequestClose={handlePaymentClose}
 �    onPaymentComplete={handlePaymentComplete}
 �    processing={paymentProcessing}
 �    error={paymentError}
 �    accountUser={account.user}
 �  />
 �  <OrderConfirmationSheet
 �    open={!!orderConfirmation}
 �    confirmation={orderConfirmation}
 �    onRequestClose={handleConfirmationClose}
 �  />
 �  <AccountSheet
 �    open={accountOpen}
 �    onRequestClose={() => setAccountOpen(false)}
 �    user={account.user}
 �    loading={account.loading}
 �    error={account.error}
 �    orders={account.orders}
 �    ordersLoading={account.ordersLoading}
 �    onLogin={account.login}
 �    onRegister={account.register}
 �    onLogout={async () => {
 �  � await account.logout();
 �  � setAccountOpen(false);
 �    }}
 �    onSaveShipping={account.saveShipping}
 �    onRefreshOrders={account.loadOrders}
 �    formatCurrency={formatCurrency}
 �  />
    </div>
  );
}

type OrderConfirmationProps = {
  open: boolean;
  confirmation: OrderConfirmation | null;
  onRequestClose: () => void;
};

function OrderConfirmationSheet({ open, confirmation, onRequestClose }: OrderConfirmationProps) {
  return (
    <AnimatePresence>
 �  {open && confirmation ? (
 �    <>
 �  � <motion.div
 �  �   key="confirm-backdrop"
 �  �   className="order-confirm-backdrop"
 �  �   initial={{ opacity: 0 }}
 �  �   animate={{ opacity: 1 }}
 �  �   exit={{ opacity: 0 }}
 �  �   onClick={onRequestClose}
 �  � />
 �  � <motion.div
 �  �   key="confirm-sheet"
 �  �   className="order-confirm-sheet"
 �  �   initial={{ y: "100%" }}
 �  �   animate={{ y: 0 }}
 �  �   exit={{ y: "100%" }}
 �  �   transition={{ type: "spring", stiffness: 260, damping: 26 }}
 �  � >
 �  �   <div className="order-confirm-header">
 �  �     <div>
 �  �  �  <h3>Order confirmed</h3>
 �  �  �  <p>We just sent a receipt to {confirmation.customer.email ?? "your inbox"}.</p>
 �  �     </div>
 �  �     <button type="button" className="order-confirm-close" onClick={onRequestClose}>
 �  �  �  Close
 �  �     </button>
 �  �   </div>
 �  �   <div className="order-confirm-body">
 �  �     <div className="order-confirm-row">
 �  �  �  <span className="order-confirm-label">Order ID</span>
 �  �  �  <span className="order-confirm-value">{confirmation.orderId}</span>
 �  �     </div>
 �  �     {confirmation.paymentRef ? (
 �  �  �  <div className="order-confirm-row">
 �  �  �    <span className="order-confirm-label">Payment Ref</span>
 �  �  �    <span className="order-confirm-value">{confirmation.paymentRef}</span>
 �  �  �  </div>
 �  �   � : null}
 �  �     <div className="order-confirm-row order-confirm-total">
 �  �  �  <span className="order-confirm-label">Total</span>
 �  �  �  <span className="order-confirm-value">{formatCurrency(confirmation.totalCents)}</span>
 �  �     </div>
 �  �     <div className="order-confirm-row">
 �  �  �  <span className="order-confirm-label">Items</span>
 �  �  �  <span className="order-confirm-value">{confirmation.totalItems}</span>
 �  �     </div>
 �  �     <div className="order-confirm-row">
 �  �  �  <span className="order-confirm-label">Ship to</span>
 �  �  �  <span
 �  �  �    className="order-confirm-value"
 �  �  �    dangerouslySetInnerHTML={{ __html: formatAddress(confirmation.customer.address) }}
 �  �  �  />
 �  �     </div>
 �  �   </div>
 �  � </motion.div>
 �    </>
 �  � null}
    </AnimatePresence>
  );
}

type AccountSheetProps = {
  open: boolean;
  onRequestClose: () => void;
  user: AccountUser | null;
  loading: boolean;
  error?: string | null;
  orders: AccountOrder[];
  ordersLoading: boolean;
  onLogin: (email: string, password: string) => Promise<AccountUser>;
  onRegister: (params: { email: string; password: string; name?: string }) => Promise<AccountUser>;
  onLogout: () => Promise<void>;
  onSaveShipping: (address: AccountShippingAddress) => Promise<AccountUser | null>;
  onRefreshOrders: () => Promise<void>;
  formatCurrency: (cents: number) => string;
};

function AccountSheet({
  open,
  onRequestClose,
  user,
  loading,
  error,
  orders,
  ordersLoading,
  onLogin,
  onRegister,
  onLogout,
  onSaveShipping,
  onRefreshOrders,
  formatCurrency,
}: AccountSheetProps) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [shipLine1, setShipLine1] = useState("");
  const [shipLine2, setShipLine2] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipState, setShipState] = useState("");
  const [shipPostal, setShipPostal] = useState("");
  const [shipCountry, setShipCountry] = useState("US");
  const [shippingStatus, setShippingStatus] = useState<string | null>(null);

  useEffect(() => {
   � (!open) return;
    setFormError(null);
    setShippingStatus(null);
    setFormLoading(false);
   � (!user) {
 �  setAuthMode("login");
    }
 � [open, user]);

  useEffect(() => {
   � (!open) return;
   � (user?.defaultShipping) {
 �  setShipLine1(user.defaultShipping.line1 ?? "");
 �  setShipLine2(user.defaultShipping.line2 ?? "");
 �  setShipCity(user.defaultShipping.city ?? "");
 �  setShipState(user.defaultShipping.state ?? "");
 �  setShipPostal(user.defaultShipping.postalCode ?? "");
 �  setShipCountry((user.defaultShipping.country ?? "US").toUpperCase());
  � else if (!user) {
 �  setShipLine1("");
 �  setShipLine2("");
 �  setShipCity("");
 �  setShipState("");
 �  setShipPostal("");
 �  setShipCountry("US");
    }
 � [open, user]);

  useEffect(() => {
   � (open && user && !ordersLoading && orders.length � 0) {
 �  void onRefreshOrders();
    }
 � [open, user, orders.length, ordersLoading, onRefreshOrders]);

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFormLoading(true);
    � {
 �  await onLogin(loginEmail.trim(), loginPassword);
 �  setLoginEmail("");
 �  setLoginPassword("");
 �  setAuthMode("login");
 �  setShippingStatus(null);
 �  void onRefreshOrders();
  � catch (err) {
 �  setFormError(err instanceof Error ? err.message : "Unable to sign in");
  � finally {
 �  setFormLoading(false);
    }
  };

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFormLoading(true);
    � {
 �  await onRegister({
 �    name: registerName.trim() || undefined,
 �    email: registerEmail.trim(),
 �    password: registerPassword,
 �  });
 �  setRegisterName("");
 �  setRegisterEmail("");
 �  setRegisterPassword("");
 �  setAuthMode("login");
 �  setShippingStatus(null);
 �  void onRefreshOrders();
  � catch (err) {
 �  setFormError(err instanceof Error ? err.message : "Unable to create account");
  � finally {
 �  setFormLoading(false);
    }
  };

  const handleSaveShipping = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShippingStatus(null);
    setFormError(null);
   � (!user) {
 �  setFormError("Sign in to save shipping details");
 �  return;
    }
   � (!shipLine1 || !shipCity || !shipState || !shipPostal) {
 �  setFormError("Complete � required shipping fields");
 �  return;
    }
    setFormLoading(true);
    � {
 �  await onSaveShipping({
 �    line1: shipLine1.trim(),
 �    line2: shipLine2.trim() || undefined,
 �    city: shipCity.trim(),
 �    state: shipState.trim(),
 �    postalCode: shipPostal.trim(),
 �    country: shipCountry.trim().toUpperCase(),
 �  });
 �  setShippingStatus("Saved");
  � catch (err) {
 �  setFormError(err instanceof Error ? err.message : "Unable to save shipping");
  � finally {
 �  setFormLoading(false);
    }
  };

  const handleLogout = async () => {
    setFormError(null);
    setShippingStatus(null);
    await onLogout();
  };

  const renderOrders = () => {
   � (!user) return null;
   � (ordersLoading) {
 �  return <div className="account-orders-empty">Loading orders...</div>;
    }
   � (!orders.length) {
 �  return <div className="account-orders-empty">No purchases yet.</div>;
    }
    return (
 �  <div className="account-orders-list">
 �    {orders.map((order) => (
 �  � <div className="account-order" key={order.orderId}>
 �  �   <div className="account-order-header">
 �  �     <div>
 �  �  �  <div className="account-order-id">Order {order.orderId}</div>
 �  �  �  <div className="account-order-ts">{new Date(order.ts).toLocaleString()}</div>
 �  �     </div>
 �  �     <div className="account-order-total">{formatCurrency(order.totalCents)}</div>
 �  �   </div>
 �  �   <div className="account-order-items">
 �  �     {order.items.map((item) => (
 �  �  �  <div className="account-order-item" key={`${order.orderId}-${item.productId}`}>
 �  �  �    <div className="account-order-item-title">
 �  �  �  � {item.productTitle || item.productId}
 �  �  �  � <span className="account-order-item-id">{item.productId}</span>
 �  �  �    </div>
 �  �  �    <div className="account-order-item-meta">
 �  �  �  � <span>{item.qty} � {formatCurrency(item.priceCents)}</span>
 �  �  �  � <strong>{formatCurrency(item.lineTotalCents)}</strong>
 �  �  �    </div>
 �  �  �  </div>
 �  �     ))}
 �  �   </div>
 �  �   {order.shippingAddress ? (
 �  �     <div className="account-order-shipping">
 �  �  �  <div className="account-section-title">Shipped to</div>
 �  �  �  <div className="account-order-address">{formatAccountAddress(order.shippingAddress)}</div>
 �  �     </div>
 �  �   � null}
 �  � </div>
 �    ))}
 �  </div>
    );
  };

  return (
    <AnimatePresence>
 �  {open ? (
 �    <>
 �  � <motion.div
 �  �   key="account-backdrop"
 �  �   className="account-backdrop"
 �  �   initial={{ opacity: 0 }}
 �  �   animate={{ opacity: 1 }}
 �  �   exit={{ opacity: 0 }}
 �  �   onClick={onRequestClose}
 �  � />
 �  � <motion.div
 �  �   key="account-sheet"
 �  �   className="account-sheet"
 �  �   initial={{ y: "100%" }}
 �  �   animate={{ y: 0 }}
 �  �   exit={{ y: "100%" }}
 �  �   transition={{ type: "spring", stiffness: 260, damping: 26 }}
 �  � >
 �  �   <div className="account-header">
 �  �     <div>
 �  �  �  <h3>{user ? "Your account" : authMode � "login" ? "Sign � : "Create account"}</h3>
 �  �  �  {user ? <p className="account-subtitle">{user.email}</p> : null}
 �  �     </div>
 �  �     <button type="button" className="account-close" onClick={onRequestClose}>
 �  �  �  Close
 �  �     </button>
 �  �   </div>

 �  �   {loading ? (
 �  �     <div className="account-loading">Loading...</div>
 �  �   � !user ? (
 �  �     <div className="account-auth">
 �  �  �  <div className="account-auth-tabs">
 �  �  �    <button
 �  �  �  � type="button"
 �  �  �  � className={authMode � "login" ? "active" : ""}
 �  �  �  � onClick={() => setAuthMode("login")}
 �  �  �    >
 �  �  �  � Sign in
 �  �  �    </button>
 �  �  �    <button
 �  �  �  � type="button"
 �  �  �  � className={authMode � "register" ? "active" : ""}
 �  �  �  � onClick={() => setAuthMode("register")}
 �  �  �    >
 �  �  �  � Create account
 �  �  �    </button>
 �  �  �  </div>
 �  �  �  {formError ? <div className="account-error">{formError}</div> : null}
 �  �  �  {error ? <div className="account-error">{error}</div> : null}
 �  �  �  {authMode � "login" ? (
 �  �  �    <form className="account-form" onSubmit={handleLoginSubmit}>
 �  �  �  � <label>
 �  �  �  �   Email
 �  �  �  �   <input
 �  �  �  �     type="email"
 �  �  �  �     value={loginEmail}
 �  �  �  �     onChange={(event) => setLoginEmail(event.target.value)}
 �  �  �  �     autoComplete="email"
 �  �  �  �     required
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <label>
 �  �  �  �   Password
 �  �  �  �   <input
 �  �  �  �     type="password"
 �  �  �  �     value={loginPassword}
 �  �  �  �     onChange={(event) => setLoginPassword(event.target.value)}
 �  �  �  �     autoComplete="current-password"
 �  �  �  �     required
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <button type="submit" className="account-primary" disabled={formLoading}>
 �  �  �  �   {formLoading ? "Signing in..." : "Sign in"}
 �  �  �  � </button>
 �  �  �    </form>
 �  �  �  � (
 �  �  �    <form className="account-form" onSubmit={handleRegisterSubmit}>
 �  �  �  � <label>
 �  �  �  �   Name
 �  �  �  �   <input
 �  �  �  �     value={registerName}
 �  �  �  �     onChange={(event) => setRegisterName(event.target.value)}
 �  �  �  �     autoComplete="name"
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <label>
 �  �  �  �   Email
 �  �  �  �   <input
 �  �  �  �     type="email"
 �  �  �  �     value={registerEmail}
 �  �  �  �     onChange={(event) => setRegisterEmail(event.target.value)}
 �  �  �  �     autoComplete="email"
 �  �  �  �     required
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <label>
 �  �  �  �   Password (min 8 characters)
 �  �  �  �   <input
 �  �  �  �     type="password"
 �  �  �  �     value={registerPassword}
 �  �  �  �     onChange={(event) => setRegisterPassword(event.target.value)}
 �  �  �  �     autoComplete="new-password"
 �  �  �  �     minLength={8}
 �  �  �  �     required
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <button type="submit" className="account-primary" disabled={formLoading}>
 �  �  �  �   {formLoading ? "Creating..." : "Create account"}
 �  �  �  � </button>
 �  �  �    </form>
 �  �  �  )}
 �  �     </div>
 �  �   � (
 �  �     <div className="account-profile">
 �  �  �  {formError ? <div className="account-error">{formError}</div> : null}
 �  �  �  {error ? <div className="account-error">{error}</div> : null}

 �  �  �  <section className="account-section">
 �  �  �    <div className="account-section-title">Saved shipping</div>
 �  �  �    <form className="account-form" onSubmit={handleSaveShipping}>
 �  �  �  � <label>
 �  �  �  �   Address line 1
 �  �  �  �   <input
 �  �  �  �     value={shipLine1}
 �  �  �  �     onChange={(event) => setShipLine1(event.target.value)}
 �  �  �  �     required
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <label>
 �  �  �  �   Address line 2
 �  �  �  �   <input
 �  �  �  �     value={shipLine2}
 �  �  �  �     onChange={(event) => setShipLine2(event.target.value)}
 �  �  �  �     placeholder="Apt, suite, etc."
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <label>
 �  �  �  �   City
 �  �  �  �   <input
 �  �  �  �     value={shipCity}
 �  �  �  �     onChange={(event) => setShipCity(event.target.value)}
 �  �  �  �     required
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <label>
 �  �  �  �   State / Province
 �  �  �  �   <input
 �  �  �  �     value={shipState}
 �  �  �  �     onChange={(event) => setShipState(event.target.value)}
 �  �  �  �     required
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <label>
 �  �  �  �   Postal code
 �  �  �  �   <input
 �  �  �  �     value={shipPostal}
 �  �  �  �     onChange={(event) => setShipPostal(event.target.value)}
 �  �  �  �     required
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <label>
 �  �  �  �   Country
 �  �  �  �   <input
 �  �  �  �     value={shipCountry}
 �  �  �  �     onChange={(event) => setShipCountry(event.target.value.toUpperCase())}
 �  �  �  �     maxLength={2}
 �  �  �  �     required
 �  �  �  �   />
 �  �  �  � </label>
 �  �  �  � <button type="submit" className="account-primary" disabled={formLoading}>
 �  �  �  �   {formLoading ? "Saving..." : "Save shipping"}
 �  �  �  � </button>
 �  �  �  � {shippingStatus ? <div className="account-success">{shippingStatus}</div> : null}
 �  �  �    </form>
 �  �  �  </section>

 �  �  �  <section className="account-section">
 �  �  �    <div className="account-section-title">
 �  �  �  � Purchase history
 �  �  �  � <button
 �  �  �  �   type="button"
 �  �  �  �   className="account-refresh"
 �  �  �  �   onClick={() => {
 �  �  �  �     setShippingStatus(null);
 �  �  �  �     void onRefreshOrders();
 �  �  �  �   }}
 �  �  �  �   disabled={ordersLoading}
 �  �  �  � >
 �  �  �  �   Refresh
 �  �  �  � </button>
 �  �  �    </div>
 �  �  �    {renderOrders()}
 �  �  �  </section>

 �  �  �  <button type="button" className="account-secondary" onClick={handleLogout}>
 �  �  �    Sign out
 �  �  �  </button>
 �  �     </div>
 �  �   )}
 �  � </motion.div>
 �    </>
 �  � null}
    </AnimatePresence>
  );
}

function formatAccountAddress(address: AccountShippingAddress) {
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", ").trim(),
    address.country,
  ]
    .map((part) => (typeof part � "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);
 � (!parts.length) return "-";
  return parts.join("\n");
}

function formatAddress(address?: CheckoutCustomer["address"]) {
 � (!address) return "-";
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", ").trim(),
    address.country,
  ]
    .map((part) => (typeof part � "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);
 � (!parts.length) return "...";
  return parts
    .map((part) =>
 �  part.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] || ch)),
    )
    .join("<br/>");
}
export default App;

type PaymentModalProps = {
  open: boolean;
  intent: PaymentIntentState | null;
  onRequestClose: () => void;
  onPaymentComplete: (paymentIntentId: string, customer: CheckoutCustomer) => Promise<boolean>;
  processing: boolean;
  error?: string | null;
  accountUser?: AccountUser | null;
};

function PaymentModal({
  open,
  intent,
  onRequestClose,
  onPaymentComplete,
  processing,
  error,
  accountUser,
}: PaymentModalProps) {
  return (
    <AnimatePresence>
 �  {open && intent ? (
 �    <>
 �  � <motion.div
 �  �   key="payment-backdrop"
 �  �   className="payment-backdrop"
 �  �   initial={{ opacity: 0 }}
 �  �   animate={{ opacity: 1 }}
 �  �   exit={{ opacity: 0 }}
 �  �   onClick={() => (!processing ? onRequestClose() : null)}
 �  � />
 �  � <motion.div
 �  �   key="payment-sheet"
 �  �   className="payment-sheet"
 �  �   initial={{ y: "100%" }}
 �  �   animate={{ y: 0 }}
 �  �   exit={{ y: "100%" }}
 �  �   transition={{ type: "spring", stiffness: 260, damping: 26 }}
 �  � >
 �  �   <div className="payment-header">
 �  �     <h3>Checkout</h3>
 �  �     <button
 �  �  �  type="button"
 �  �  �  className="payment-close"
 �  �  �  onClick={onRequestClose}
 �  �  �  disabled={processing}
 �  �     >
 �  �  �  Close
 �  �     </button>
 �  �   </div>
 �  �   {stripePromise ? (
 �  �     <Elements key={intent.clientSecret} stripe={stripePromise} options={{ clientSecret: intent.clientSecret }}>
 �  �  �  <StripePaymentForm
 �  �  �    amount={intent.amount}
 �  �  �    clientSecret={intent.clientSecret}
 �  �  �    paymentIntentId={intent.paymentIntentId}
 �  �  �    onCancel={onRequestClose}
 �  �  �    onComplete={onPaymentComplete}
 �  �  �    processing={processing}
 �  �  �    errorMessage={error}
 �  �  �    accountUser={accountUser}
 �  �  �  />
 �  �     </Elements>
 �  �   � (
 �  �     <div className="payment-form">
 �  �  �  <p>Payment processing is currently unavailable.</p>
 �  �  �  <button className="payment-submit" type="button" onClick={onRequestClose}>
 �  �  �    Close
 �  �  �  </button>
 �  �     </div>
 �  �   )}
 �  � </motion.div>
 �    </>
 �  � null}
    </AnimatePresence>
  );
}

type StripePaymentFormProps = {
  amount: number;
  clientSecret: string;
  paymentIntentId: string;
  onCancel: () => void;
  onComplete: (paymentIntentId: string, customer: CheckoutCustomer) => Promise<boolean>;
  processing: boolean;
  errorMessage?: string | null;
  accountUser?: AccountUser | null;
};

function StripePaymentForm({
  amount,
  clientSecret,
  paymentIntentId,
  onCancel,
  onComplete,
  processing,
  errorMessage,
  accountUser,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateProvince, setStateProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
   � (!accountUser) return;
    setName((prev) => (prev ? prev : accountUser.name ?? ""));
    setEmail((prev) => (prev ? prev : accountUser.email ?? ""));
    const shipping = accountUser.defaultShipping;
   � (shipping) {
 �  setAddressLine1((prev) => (prev ? prev : shipping.line1 ?? ""));
 �  setAddressLine2((prev) => (prev ? prev : shipping.line2 ?? ""));
 �  setCity((prev) => (prev ? prev : shipping.city ?? ""));
 �  setStateProvince((prev) => (prev ? prev : shipping.state ?? ""));
 �  setPostalCode((prev) => (prev ? prev : shipping.postalCode ?? ""));
 �  const normalizedCountry = (shipping.country ?? "US")?.toUpperCase?.() ?? "US";
 �  setCountry((prev) => (prev ? prev : normalizedCountry));
    }
 � [accountUser, paymentIntentId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
   � (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
   � (!card) {
 �  setLocalError("Card details � required");
 �  return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedLine1 = addressLine1.trim();
    const trimmedLine2 = addressLine2.trim();
    const trimmedCity = city.trim();
    const trimmedState = stateProvince.trim();
    const trimmedPostal = postalCode.trim();
    const trimmedCountry = (country || "US").trim().toUpperCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

   � (!trimmedName) {
 �  setLocalError("Name is required");
 �  return;
    }
   � (!trimmedEmail || !emailPattern.test(trimmedEmail)) {
 �  setLocalError("Enter a valid email address");
 �  return;
    }
   � (!trimmedLine1 || !trimmedCity || !trimmedState || !trimmedPostal) {
 �  setLocalError("Complete � shipping address");
 �  return;
    }
   � (trimmedCountry.length � 2) {
 �  setLocalError("Use � 2-letter country code (e.g. US)");
 �  return;
    }

    setSubmitting(true);
    setLocalError(null);

    const shippingAddress = {
 �  line1: trimmedLine1,
 �  line2: trimmedLine2 || undefined,
 �  city: trimmedCity,
 �  state: trimmedState,
 �  postal_code: trimmedPostal,
 �  country: trimmedCountry,
    };

    const result = await stripe.confirmCardPayment(clientSecret, {
 �  receipt_email: trimmedEmail,
 �  payment_method: {
 �    card,
 �    billing_details: {
 �  � name: trimmedName,
 �  � email: trimmedEmail,
 �  � address: shippingAddress,
 �    },
 �  },
 �  shipping: {
 �    name: trimmedName,
 �    address: shippingAddress,
 �  },
    });

   � (result.error) {
 �  setLocalError(result.error.message ?? "Payment failed");
 �  setSubmitting(false);
 �  return;
    }

    const intent = result.paymentIntent;
   � (!intent || intent.status � "succeeded") {
 �  setLocalError("Payment � not completed");
 �  setSubmitting(false);
 �  return;
    }

    const customer: CheckoutCustomer = {
 �  name: trimmedName,
 �  email: trimmedEmail,
 �  address: {
 �    line1: shippingAddress.line1,
 �    line2: shippingAddress.line2,
 �    city: shippingAddress.city,
 �    state: shippingAddress.state,
 �    postalCode: shippingAddress.postal_code,
 �    country: shippingAddress.country,
 �  },
    };

    const ok = await onComplete(intent.id, customer);
   � (!ok) {
 �  setLocalError("Unable to finalize order. Please � again.");
 �  setSubmitting(false);
    }
  };

  const disabled = submitting || processing || !stripe || !elements;
  const payLabel = disabled ? "Processing..." : `Pay ${formatCurrency(amount)}`;

  return (
    <form className="payment-form" onSubmit={handleSubmit}>
 �  {(localError || errorMessage) && (
 �    <div className="payment-error">{localError || errorMessage}</div>
 �  )}
 �  <div className="payment-row">
 �    <label htmlFor="checkout-name">Full name</label>
 �    <input
 �  � id="checkout-name"
 �  � placeholder="Alex Shopper"
 �  � value={name}
 �  � onChange={(event) => setName(event.target.value)}
 �  � autoComplete="name"
 �    />
 �  </div>
 �  <div className="payment-row">
 �    <label htmlFor="checkout-email">Email</label>
 �    <input
 �  � id="checkout-email"
 �  � placeholder="you@example.com"
 �  � value={email}
 �  � onChange={(event) => setEmail(event.target.value)}
 �  � autoComplete="email"
 �    />
 �  </div>
 �  <div className="payment-row">
 �    <label htmlFor="checkout-address1">Address line 1</label>
 �    <input
 �  � id="checkout-address1"
 �  � placeholder="123 Market St"
 �  � value={addressLine1}
 �  � onChange={(event) => setAddressLine1(event.target.value)}
 �  � autoComplete="address-line1"
 �    />
 �  </div>
 �  <div className="payment-row">
 �    <label htmlFor="checkout-address2">Address line 2 (optional)</label>
 �    <input
 �  � id="checkout-address2"
 �  � placeholder="Apt, suite, etc."
 �  � value={addressLine2}
 �  � onChange={(event) => setAddressLine2(event.target.value)}
 �  � autoComplete="address-line2"
 �    />
 �  </div>
 �  <div className="payment-row">
 �    <label htmlFor="checkout-city">City</label>
 �    <input
 �  � id="checkout-city"
 �  � placeholder="City"
 �  � value={city}
 �  � onChange={(event) => setCity(event.target.value)}
 �  � autoComplete="address-level2"
 �    />
 �  </div>
 �  <div className="payment-row">
 �    <label htmlFor="checkout-state">State / Province</label>
 �    <input
 �  � id="checkout-state"
 �  � placeholder="State"
 �  � value={stateProvince}
 �  � onChange={(event) => setStateProvince(event.target.value.toUpperCase())}
 �  � autoComplete="address-level1"
 �    />
 �  </div>
 �  <div className="payment-row">
 �    <label htmlFor="checkout-postal">Postal code</label>
 �    <input
 �  � id="checkout-postal"
 �  � placeholder="Postal code"
 �  � value={postalCode}
 �  � onChange={(event) => setPostalCode(event.target.value)}
 �  � autoComplete="postal-code"
 �  � inputMode="text"
 �    />
 �  </div>
 �  <div className="payment-row">
 �    <label htmlFor="checkout-country">Country</label>
 �    <input
 �  � id="checkout-country"
 �  � placeholder="US"
 �  � value={country}
 �  � onChange={(event) => setCountry(event.target.value.toUpperCase())}
 �  � autoComplete="country"
 �    />
 �  </div>
 �  <div className="payment-row">
 �    <label>Card details</label>
 �    <div className="stripe-card">
 �  � <CardElement
 �  �   options={{
 �  �     style: {
 �  �  �  base: {
 �  �  �    fontSize: "16px",
 �  �  �    color: "#111",
 �  �  �    fontFamily: "inherit",
 �  �  �    "::placeholder": { color: "#9ca3af" },
 �  �  �  },
 �  �  �  invalid: { color: "#ef4444" },
 �  �     },
 �  �   }}
 �  � />
 �    </div>
 �  </div>
 �  <div className="payment-actions">
 �    <button
 �  � type="button"
 �  � className="payment-cancel"
 �  � onClick={onCancel}
 �  � disabled={submitting || processing}
 �    >
 �  � Cancel
 �    </button>
 �    <button
 �  � type="submit"
 �  � className="payment-submit"
 �  � disabled={disabled}
 �    >
 �  � {payLabel}
 �    </button>
 �  </div>
    </form>
  );
}







