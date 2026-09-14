import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { loadStripe } from "@stripe/stripe-js";
import SiteHeader from "./components/SiteHeader";
import PickupOption from "./components/PickupOption";
import { emails as siteEmails } from "./data/site";
import {
  SHIP_BY_DEFAULT,
  chosenShow,
  fetchPickup,
  pickupProblem,
  type ConfirmedFulfillment,
  type DeliveryChoice,
  type PickupOffer,
} from "./lib/pickup";
import { Elements, useStripe, useElements, CardElement, PaymentRequestButtonElement } from "@stripe/react-stripe-js";
import { useDrop } from "./hooks/useDrop";
import {
  useAccount,
  type AccountUser,
  type AccountOrder,
  type ShippingAddress as AccountShippingAddress,
} from "./hooks/useAccount";
import { requireBackendUrl, stripePublishableKey } from "./config";
import { fetchWithSession } from "./lib/session";
import { fetchBackendJson, readCache, writeCache } from "./lib/backend";
import {
  trackAddToCart,
  trackInitiateCheckout,
  trackPurchase,
  trackViewContent,
  type PixelLine,
} from "./lib/metaPixel";
import {
  describeLeftOut,
  hasCheckoutLink,
  readCheckoutLinkParams,
  resolveCheckoutLink,
} from "./lib/checkoutLink";

// The shop the visitor last saw, replayed while the API wakes up.
const CATALOG_CACHE_KEY = "catalog";

type SizeGuide = { note?: string; rows: Array<{ size: string; chest: string; length: string }> };
type PrintPlacement = "front" | "front_back" | "";

type BackendProduct = {
  id: string;
  title: string;
  priceCents: number;
  imageUrl?: string;
  /** Primary first — front, back, detail. Falls back to imageUrl alone. */
  images?: string[];
  /** Label per image URL: "Front", "Back (blank)", "Artwork close-up". */
  imageLabels?: Record<string, string>;
  tags?: string[] | string;
  /** Sizes this product needs picking from. Empty means no size at all. */
  sizes?: string[];
  remaining?: number;
  description?: string;
  printPlacement?: PrintPlacement;
  garment?: string;
  sizeGuide?: SizeGuide | null;
  inventoryMode?: "stocked" | "made_to_order";
  /** Part of the live drop right now (the only thing that matters for made-to-order stock). */
  inDrop?: boolean;
};

type ProductCard = {
  id: string;
  title: string;
  priceCents: number;
  /** Primary shot; always images[0]. */
  img: string;
  /** Every shot for this product, primary first. Never empty. */
  images: string[];
  imageLabels: Record<string, string>;
  bg: string;
  tags: string[];
  /** Empty for anything that doesn't need a size. */
  sizes: string[];
  description: string;
  printPlacement: PrintPlacement;
  garment: string;
  sizeGuide: SizeGuide | null;
  madeToOrder: boolean;
  inDrop: boolean;
  order: number;
};

/** "Front print · blank back · Standard black tee" — what makes one shirt different from the other. */
function productDescriptor(p: Pick<ProductCard, "printPlacement" | "garment">): string {
  return [
    p.printPlacement === "front_back" ? "Front + back print" : p.printPlacement === "front" ? "Front print · blank back" : "",
    p.garment,
  ]
    .filter(Boolean)
    .join(" · ");
}

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

type ConfirmedItem = {
  productId: string;
  title: string;
  size: string | null;
  qty: number;
  imageUrl: string | null;
  detail: string | null;
  lineTotalCents: number;
};

type OrderConfirmation = {
  orderId: string;
  /** The short number the customer quotes: "NC-A1B2C3". */
  orderNumber: string;
  totalCents: number;
  totalItems: number;
  items: ConfirmedItem[];
  customer: CheckoutCustomer;
  /** Show merch pickup or shipping, as recorded on the paid order. */
  fulfillment?: ConfirmedFulfillment;
};

/** The server's answer when it re-checks checkout right before payment. */
type PrepareResult = { ok: boolean; error?: string; code?: string };

// Server codes that mean the pickup choice needs the customer's attention.
const FULFILLMENT_CODES = new Set(["PICKUP_UNAVAILABLE", "SHOW_REQUIRED"]);

// Wallet sheets need a shipping option; shipping adds nothing to the total.
const STANDARD_SHIPPING = { id: "standard", label: "Standard shipping", detail: "No extra charge", amount: 0 };
/** Where "Questions?" goes on the confirmation. */
const supportEmail = siteEmails.orders;
/** Sizes picked in the bag survive a reload of the tab. */
const SIZE_STORAGE_KEY = "nc_sizes";

type SaveSheetState = {
  productId: string;
  email: string;
  status: "idle" | "saving" | "success" | "error";
  message?: string;
};
const BACKEND_URL = requireBackendUrl();
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

// The page ground is a CSS variable (white inside Instagram's in-app browser,
// off-white elsewhere), so backgrounds that just mean "the page" must reference
// it rather than pin a hex value.
const PAGE_BG = "var(--page-bg)";

// A product only overrides the page colour if it sets something else. The old
// off-white hex is treated as "no override" so catalogs cached in localStorage
// before the variable existed don't paint off-white sections inside Instagram
// (the cache renders on first paint, before the fresh fetch replaces it).
const sectionBackground = (bg?: string) =>
  !bg || bg.trim().toLowerCase() === "#f2f2ee" ? PAGE_BG : bg;

const IMAGE_OVERRIDES: Record<string, { img?: string; bg?: string }> = {
  "tee-black": { img: "/tee-black.PNG", bg: PAGE_BG },
};

type BackendCartSnapshot = Record<
  string,
  number | { qty?: number; holdMsRemaining?: number; holdSecondsRemaining?: number; holdUntil?: number }
>;

type CartItem = {
  id: string;
  qty: number;
  holdExpiresAt: number | null;
};

const CART_HOLD_MS = 5 * 60 * 1000;

const toCartList = (map?: BackendCartSnapshot | null): CartItem[] => {
  const entries = Object.entries(map ?? {});
  const now = Date.now();
  return entries
    .map(([id, value]) => {
      let qty = 0;
      let holdMs: number | null = null;
      // The server sends null for a made-to-order line: nothing is held, so nothing expires.
      let noHold = false;
      if (typeof value === "number") {
        qty = value;
      } else if (value && typeof value === "object") {
        qty = Number.isFinite(value.qty) ? Number(value.qty) : qty;
        if (value.holdMsRemaining === null) {
          noHold = true;
        } else if (Number.isFinite(value.holdMsRemaining)) {
          holdMs = Number(value.holdMsRemaining);
        } else if (Number.isFinite(value.holdSecondsRemaining)) {
          holdMs = Number(value.holdSecondsRemaining) * 1000;
        } else if (Number.isFinite(value.holdUntil)) {
          holdMs = Number(value.holdUntil) - now;
        }
      }
      qty = Math.max(0, Math.floor(qty));
      if (!qty) return null;
      const holdExpiresAt = noHold ? null : holdMs != null ? now + Math.max(0, holdMs) : now + CART_HOLD_MS;
      return { id, qty, holdExpiresAt };
    })
    .filter((item): item is CartItem => item !== null);
};

const formatCurrency = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

const formatHoldCountdown = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

type CountdownPart = {
  label: string;
  value: string;
};

const EMPTY_COUNTDOWN: CountdownPart[] = [
  { label: "Days", value: "--" },
  { label: "Hours", value: "--" },
  { label: "Minutes", value: "--" },
  { label: "Seconds", value: "--" },
];

function buildCountdownParts(targetMs: number | null, nowMs: number): CountdownPart[] {
  if (targetMs == null || !Number.isFinite(targetMs)) {
    return EMPTY_COUNTDOWN;
  }

  const totalSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    { label: "Days", value: String(days).padStart(2, "0") },
    { label: "Hours", value: String(hours).padStart(2, "0") },
    { label: "Minutes", value: String(minutes).padStart(2, "0") },
    { label: "Seconds", value: String(seconds).padStart(2, "0") },
  ];
}

function formatSetStart(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

const MULTIPLY = "\u00D7";

function App() {
  const headerRef = useRef<HTMLElement | null>(null);
  const metaRef = useRef<HTMLDivElement | null>(null);
  const {
    state: dropState,
    drop,
    remainingById,
    vaultById,
    waking: dropWaking,
    refresh: refreshDropState,
  } = useDrop(BACKEND_URL);
  const account = useAccount(BACKEND_URL);

  const [catalog, setCatalog] = useState<ProductCard[]>(
    () => readCache<ProductCard[]>(CATALOG_CACHE_KEY) ?? [],
  );
  // Only a first-ever visitor waits on an empty screen; everyone else reads
  // the cached shop while the fetch runs.
  const [loadingCatalog, setLoadingCatalog] = useState(
    () => (readCache<ProductCard[]>(CATALOG_CACHE_KEY) ?? []).length === 0,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalogWaking, setCatalogWaking] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  // The code from a checkout link, if the visitor arrived through one. It is
  // recorded on the payment so an order can be traced back to the post or
  // flyer that sent it; it changes no price.
  const [linkCoupon, setLinkCoupon] = useState<string | null>(null);
  // Both read during the first render, before any response can land or the
  // address bar is tidied: the loaders above need to know a link is about to
  // fill the bag, and the link itself has to survive being taken out of the
  // URL — under StrictMode the effect below mounts, unmounts and mounts again,
  // and the second pass would otherwise find an address bar it had already
  // cleaned and conclude the link was empty.
  const linkFillRef = useRef<"idle" | "running" | "done">(
    typeof window !== "undefined" && hasCheckoutLink(window.location.search) ? "running" : "idle",
  );
  const linkParamsRef = useRef(
    typeof window !== "undefined" ? readCheckoutLinkParams(window.location.search) : { products: "", coupon: "" },
  );
  /**
   * Products a checkout link named that /api/products doesn't return. Between
   * drops the catalog is filtered down to what was recently live, and for a
   * scheduled drop it is empty, so a bag filled from a link would otherwise
   * render its lines as bare ids at $0. Kept apart from `catalog` rather than
   * merged into it because the catalog fetch replaces that wholesale.
   */
  const [linkProducts, setLinkProducts] = useState<Record<string, ProductCard>>({});
  // Sizes are picked in the bag, one per unit: { "tee-black": ["M", "L"] }.
  const [sizeChoices, setSizeChoices] = useState<Record<string, string[]>>(() => {
    try {
      const raw = window.sessionStorage.getItem(SIZE_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      window.sessionStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(sizeChoices));
    } catch {
      /* storage blocked: the choice still lives in memory */
    }
  }, [sizeChoices]);
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
  // Show pickup: what checkout can offer, the customer's delivery choice (ship
  // unless they pick up), and anything the server said about that choice.
  const [pickupOffer, setPickupOffer] = useState<PickupOffer | null>(null);
  const [delivery, setDelivery] = useState<DeliveryChoice>(SHIP_BY_DEFAULT);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useLayoutEffect(() => {
    const root = document.documentElement;

    const updateOffsets = () => {
      const header = headerRef.current;
      const headerStyles = header ? getComputedStyle(header) : null;
      const position = headerStyles?.position ?? "";
      if (header && (position === "fixed" || position === "sticky")) {
        const height = header.getBoundingClientRect().height;
        const safeTopValue = getComputedStyle(root).getPropertyValue("--safe-area-top") || "0";
        const safeTop = Number.parseFloat(safeTopValue) || 0;
        const offset = Math.max(0, Math.ceil(height - safeTop));
        root.style.setProperty("--header-offset", `${offset}px`);
      } else {
        root.style.setProperty("--header-offset", "0px");
      }

      const meta = metaRef.current;
      if (meta) {
        const metaHeight = Math.ceil(meta.getBoundingClientRect().height);
        root.style.setProperty("--meta-offset", `${metaHeight}px`);
      } else {
        root.style.setProperty("--meta-offset", "0px");
      }
    };

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateOffsets);
    };

    let observers: ResizeObserver[] = [];
    const setupObservers = () => {
      observers.forEach((observer) => observer.disconnect());
      observers = [];
      if (typeof ResizeObserver === "undefined") return;
      const header = headerRef.current;
      if (header) {
        const observer = new ResizeObserver(schedule);
        observer.observe(header);
        observers.push(observer);
      }
      const meta = metaRef.current;
      if (meta) {
        const observer = new ResizeObserver(schedule);
        observer.observe(meta);
        observers.push(observer);
      }
    };

    updateOffsets();
    setupObservers();

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    return () => {
      observers.forEach((observer) => observer.disconnect());
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCart = async () => {
      try {
        const res = await fetchWithSession(`${BACKEND_URL}/api/cart/state`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled || !data) return;
        // A checkout link fills the bag itself. This request was already in
        // flight when it started, so its answer is stale by the time it lands.
        if (data.cart && linkFillRef.current === "idle") {
          setCart(toCartList(data.cart));
        }
      } catch {
        // ignore
      }
    };
    loadCart();
    return () => {
      cancelled = true;
    };
  }, []);

  // Arriving from another section via CART (n) / Account → open that sheet immediately.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const params = url.searchParams;
    if (params.get("cart") === "open") setCartOpen(true);
    if (params.get("account") === "open") setAccountOpen(true);
    if (params.has("cart") || params.has("account")) {
      // Drop only what this effect consumed. Clearing the whole query string
      // here would eat a checkout link arriving on the same URL, before the
      // effect below ever gets to read it.
      params.delete("cart");
      params.delete("account");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  /**
   * Arriving on a checkout link: /shop?products=tee-black:2,socks&coupon=SHOW-2026
   *
   * The link is a request, not a reservation — the server resolves it against
   * the live catalog first, and only what is genuinely for sale goes in the
   * bag, through the same /cart/add every other add uses. The bag opens so the
   * visitor sees exactly what they got, and anything left behind is named
   * rather than silently dropped.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (linkFillRef.current !== "running") return;

    const params = linkParamsRef.current;
    const controller = new AbortController();
    let cancelled = false;

    // Taken out of the address bar right away: a reload should not re-add
    // everything, and the URL the visitor can copy should be the plain shop.
    const url = new URL(window.location.href);
    url.searchParams.delete("products");
    url.searchParams.delete("coupon");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);

    // The bag this visitor already had. The loader above dropped its answer to
    // stay out of the way of the fill, so if the fill adds nothing — a dead
    // link, a closed drop — that bag has to be put back rather than read as
    // empty.
    const restoreExistingCart = async () => {
      try {
        const res = await fetchWithSession(`${BACKEND_URL}/api/cart/state`, { headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.cart) setCart(toCartList(data.cart));
      } catch {
        // Nothing to restore: the bag stays as it is.
      }
    };

    (async () => {
      try {
        const resolved = await resolveCheckoutLink(params, controller.signal);
        if (cancelled) return;
        if (!resolved) {
          await restoreExistingCart();
          if (cancelled) return;
          showToast("That link didn't work", 2200);
          return;
        }
        if (resolved.coupon) setLinkCoupon(resolved.coupon);

        // The catalog may not carry these — between drops it is filtered, and
        // for a scheduled drop it is empty — so keep what the server said about
        // them or the bag shows bare ids at $0.
        const named: Record<string, ProductCard> = {};
        for (const item of resolved.items) {
          if (!item.canBag || !item.title) continue;
          const img = item.imageUrl || "/placeholder.png";
          named[item.productId] = {
            id: item.productId,
            title: item.title,
            priceCents: item.priceCents ?? 0,
            img,
            images: [img],
            imageLabels: {},
            bg: PAGE_BG,
            tags: [],
            sizes: Array.isArray(item.sizes) ? item.sizes : [],
            description: "",
            printPlacement: "",
            garment: "",
            sizeGuide: null,
            madeToOrder: false,
            inDrop: item.status === "ok",
            order: 0,
          };
        }
        if (Object.keys(named).length) setLinkProducts((prev) => ({ ...prev, ...named }));

        let snapshot: BackendCartSnapshot | null = null;
        let added = 0;
        let refused = "";

        for (const item of resolved.items) {
          if (!item.canBag) continue;
          try {
            const res = await fetchWithSession(`${BACKEND_URL}/api/cart/add`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productId: item.productId, qty: item.qty }),
            });
            const json = await res.json().catch(() => ({}));
            if (cancelled) return;
            if (res.ok && json.ok) {
              added += 1;
              if (json.cart) snapshot = json.cart as BackendCartSnapshot;
              trackAddToCart({ id: item.productId, title: item.title ?? item.productId, priceCents: item.priceCents ?? 0 }, item.qty);
            } else if (!refused) {
              refused = typeof json.error === "string" ? json.error : "";
            }
          } catch {
            if (cancelled) return;
            if (!refused) refused = "Network error";
          }
        }

        if (cancelled) return;
        if (snapshot) setCart(toCartList(snapshot));
        else await restoreExistingCart();
        if (cancelled) return;

        const leftOut = describeLeftOut(resolved.items) || refused;
        if (added) {
          setCartOpen(true);
          const note = leftOut
            ? `Bag filled — ${leftOut}`
            : resolved.live
            ? "Bag filled from your link"
            : "Bag filled — checkout opens with the drop";
          showToast(note, leftOut || !resolved.live ? 3000 : 1800);
        } else {
          showToast(leftOut || "Nothing from that link is available", 3000);
        }
      } finally {
        if (!cancelled) linkFillRef.current = "done";
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    setCart((prev) => {
      const filtered = prev.filter(
        (item) => !item.holdExpiresAt || item.holdExpiresAt > nowTick,
      );
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [nowTick]);

  useEffect(() => {
    let cancelled = false;

    const normalizeImage = (url?: string) => {
      if (!url) return "";
      let src = url.trim();
      if (!src) return "";
      src = src.replace(/\\/g, "/");
      src = src.replace(/^\/?public\//i, "/");
      if (/^data:/i.test(src)) return src;
      if (/^https?:\/\//i.test(src)) return src;
      if (src.startsWith("//")) {
        return window.location?.protocol ? `${window.location.protocol}${src}` : `https:${src}`;
      }
      if (!src.startsWith("/")) {
        src = "/" + src;
      }
      return `${BACKEND_URL}${src}`;
    };

    const fetchCatalog = async () => {
      setLoadingCatalog(true);
      try {
        const data = await fetchBackendJson<{ products?: BackendProduct[] } | BackendProduct[]>(
          `${BACKEND_URL}/api/products`,
          {
            onRetry: () => {
              if (!cancelled) setCatalogWaking(true);
            },
          },
        );
        const list: BackendProduct[] = Array.isArray((data as { products?: BackendProduct[] })?.products)
          ? (data as { products: BackendProduct[] }).products
          : Array.isArray(data)
          ? (data as BackendProduct[])
          : [];

        const cards: ProductCard[] = list.map((product, index) => {
          const ov = IMAGE_OVERRIDES[product.id] ?? {};
          const gallery = (Array.isArray(product.images) ? product.images : [])
            .map((url) => normalizeImage(url))
            .filter((url): url is string => Boolean(url));
          const img = ov.img || gallery[0] || normalizeImage(product.imageUrl) || "/placeholder.png";
          // An override replaces the primary shot but keeps the rest of the gallery.
          const images = [img, ...gallery.filter((url) => url !== img)];
          // Labels are keyed by the URL as the server sent it; look them up by the normalized one too.
          const imageLabels: Record<string, string> = {};
          for (const [url, label] of Object.entries(product.imageLabels ?? {})) {
            const key = normalizeImage(url);
            if (key && label) imageLabels[key] = label;
          }
          return {
            id: product.id,
            title: product.title,
            priceCents: product.priceCents,
            img,
            images,
            imageLabels,
            bg: ov.bg || PAGE_BG,
            sizes: Array.isArray(product.sizes) ? product.sizes : [],
            tags: Array.isArray(product.tags)
              ? product.tags
              : typeof product.tags === "string"
              ? product.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
              : [],
            description: product.description ?? "",
            printPlacement: product.printPlacement ?? "",
            garment: product.garment ?? "",
            sizeGuide: product.sizeGuide && Array.isArray(product.sizeGuide.rows) && product.sizeGuide.rows.length ? product.sizeGuide : null,
            madeToOrder: product.inventoryMode === "made_to_order",
            inDrop: product.inDrop === true,
            order: index,
          };
        });

        if (!cancelled) {
          setCatalog(cards);
          setLoadError(null);
          setCatalogWaking(false);
          writeCache(CATALOG_CACHE_KEY, cards);
        }
      } catch (err) {
        if (!cancelled) {
          setCatalogWaking(false);
          // Keep the cached shop up rather than blanking it — stale prices for
          // a moment beat an empty store during a drop.
          const fallback = readCache<ProductCard[]>(CATALOG_CACHE_KEY) ?? [];
          setCatalog(fallback);
          setLoadError(
            fallback.length > 0
              ? null
              : err instanceof Error
              ? err.message
              : "Unable to load catalog",
          );
        }
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    };

    fetchCatalog();

    return () => {
      cancelled = true;
    };
  }, [dropState, refreshKey]);

  const visibleCatalog = useMemo(() => {
    const sorted = [...catalog].sort((a, b) => {
      const inStockA = a.madeToOrder ? (a.inDrop ? 1 : 0) : (remainingById[a.id] ?? 0) > 0 ? 1 : 0;
      const inStockB = b.madeToOrder ? (b.inDrop ? 1 : 0) : (remainingById[b.id] ?? 0) > 0 ? 1 : 0;
      if (inStockA !== inStockB) {
        return inStockB - inStockA;
      }

      const tagA = a.tags[0]?.toLowerCase() ?? "";
      const tagB = b.tags[0]?.toLowerCase() ?? "";
      if (tagA && tagB) {
        const cmp = tagA.localeCompare(tagB);
        if (cmp !== 0) return cmp;
      } else if (tagA && !tagB) {
        return -1;
      } else if (!tagA && tagB) {
        return 1;
      }
      return a.order - b.order;
    });

    return sorted;
  }, [catalog, remainingById]);

  useEffect(() => {
    const visibility = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.pid;
          if (!id) continue;
          if (entry.isIntersecting) {
            visibility.set(id, entry.intersectionRatio);
          } else {
            visibility.delete(id);
          }
        }

        let bestId: string | null = null;
        let bestRatio = 0;
        visibility.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        });

        if (!bestId && visibleCatalog.length) {
          bestId = visibleCatalog[0].id;
        }

        if (bestId) {
          setActiveId((prev) => (prev === bestId ? prev : bestId));
        }
      },
      { threshold: [0.25, 0.5, 0.75, 0.9] },
    );

    visibleCatalog.forEach((item) => {
      const node = sectionRefs.current[item.id];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [visibleCatalog]);

  useEffect(() => {
    if (!visibleCatalog.length) {
      setActiveId(null);
    } else {
      setActiveId((prev) => (prev ? prev : visibleCatalog[0].id));
    }
  }, [visibleCatalog]);

  // Arriving from a shared link (/shop?p=<id>) → land on that product rather
  // than the top of the shop. Runs once the catalog has rendered its sections.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !visibleCatalog.length) return;
    const wanted = new URLSearchParams(window.location.search).get("p");
    if (!wanted) {
      deepLinked.current = true;
      return;
    }
    if (!visibleCatalog.some((item) => item.id === wanted)) return;
    const node = sectionRefs.current[wanted];
    if (!node) return;
    deepLinked.current = true;
    setActiveId(wanted);
    // Jump rather than smooth-scroll: the target is where the page should have
    // opened, so animating there from the top just looks like a glitch.
    node.scrollIntoView({ block: "start" });
    const url = new URL(window.location.href);
    url.searchParams.delete("p");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [visibleCatalog]);

  const active = useMemo(() => {
    if (!visibleCatalog.length) return null;
    const fallback = visibleCatalog[0];
    if (!activeId) return fallback;
    return visibleCatalog.find((item) => item.id === activeId) ?? fallback;
  }, [visibleCatalog, activeId]);

  // A made-to-order product never runs out; it's on sale whenever it's in the live drop.
  const purchasable = useCallback(
    (product: ProductCard) => (product.madeToOrder ? product.inDrop : (remainingById[product.id] ?? 0) > 0),
    [remainingById],
  );

  const totalRemaining = useMemo(() => {
    const entries = Object.entries(remainingById) as Array<[string, number]>;
    const units = entries.reduce((acc, [, qty]) => acc + qty, 0);
    const madeToOrder = catalog.filter((p) => p.madeToOrder && p.inDrop).length;
    return units + madeToOrder;
  }, [remainingById, catalog]);

  const scheduledStartMs = useMemo(() => {
    if (!drop?.startsAt) return null;
    const next = new Date(drop.startsAt).getTime();
    return Number.isFinite(next) ? next : null;
  }, [drop?.startsAt]);
  const countdownParts = useMemo(
    () => buildCountdownParts(scheduledStartMs, nowTick),
    [scheduledStartMs, nowTick],
  );
  const formattedSetStart = formatSetStart(drop?.startsAt);
  const activeRemaining = active ? remainingById[active.id] ?? 0 : 0;
  const singleItemMode = visibleCatalog.length === 1;
  const isLive = dropState === "live";
  const showLandingScreen = !isLive;
  const countdownComplete = scheduledStartMs != null && scheduledStartMs <= nowTick;
  const canAdd = Boolean(active && isLive && purchasable(active));
  const showSave = Boolean(active && (!isLive || !purchasable(active)));
  const isSaved = active ? Boolean(savedIds[active.id]) : false;
  const primaryBusy = active ? saveBusy === active.id : false;
  const primaryDisabled = !active
    ? true
    : canAdd
    ? false
    : showSave
    ? primaryBusy || isSaved
    : true;
  const primaryLabel = canAdd
    ? "Add"
    : showSave
    ? primaryBusy
      ? "Saving..."
      : isSaved
      ? "Saved"
      : "Save"
    : "Locked";
  const primaryTitle = canAdd
    ? "Add to cart"
    : showSave
    ? isSaved
      ? "Saved to your Vault list"
      : "Save this item to unlock the next Vault release"
    : !isLive
    ? "Drop not live"
    : "Sold out";
  const cartDetails = useMemo(
    () =>
      cart.map((item) => {
        const product = catalog.find((p) => p.id === item.id) ?? linkProducts[item.id];
        const priceCents = product?.priceCents ?? 0;
        const holdSecondsRemaining =
          item.holdExpiresAt != null
            ? Math.max(0, Math.ceil((item.holdExpiresAt - nowTick) / 1000))
            : null;
        const sizes = product?.sizes ?? [];
        // One slot per unit, so two of the same shirt can be M and L.
        const picked = (sizeChoices[item.id] ?? []).slice(0, item.qty);
        while (sizes.length && picked.length < item.qty) picked.push("");
        return {
          ...item,
          title: product?.title ?? item.id,
          img: product?.img ?? "",
          descriptor: product ? productDescriptor(product) : "",
          sizeGuide: product?.sizeGuide ?? null,
          madeToOrder: product?.madeToOrder ?? false,
          priceCents,
          lineTotal: priceCents * item.qty,
          available: remainingById[item.id] ?? 0,
          holdSecondsRemaining,
          sizes,
          picked,
        };
      }),
    [cart, catalog, linkProducts, remainingById, nowTick, sizeChoices],
  );

  // Every sized unit needs a size before payment can be taken.
  const missingSizeFor = cartDetails.find(
    (item) => item.sizes.length > 0 && item.picked.some((size) => !size),
  );
  const sizesPayload = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const item of cartDetails) {
      if (item.sizes.length) out[item.id] = item.picked;
    }
    return out;
  }, [cartDetails]);

  // Confirm runs inside async payment callbacks, so read sizes from a ref
  // rather than a closure captured when the handler was created.
  const sizesPayloadRef = useRef<Record<string, string[]>>({});
  useEffect(() => {
    sizesPayloadRef.current = sizesPayload;
  }, [sizesPayload]);

  const chooseSize = (productId: string, unit: number, size: string) => {
    setSizeChoices((prev) => {
      const next = (prev[productId] ?? []).slice();
      while (next.length <= unit) next.push("");
      next[unit] = size;
      return { ...prev, [productId]: next };
    });
  };

  const itemsTotal = cartDetails.reduce((acc, item) => acc + item.qty, 0);
  const priceTotalCents = cartDetails.reduce((acc, item) => acc + item.lineTotal, 0);

  // ---- Show pickup: an extra delivery option at checkout ----
  // Refreshed when checkout opens, so a cutoff that passed while someone was
  // browsing is already reflected there.
  const refreshPickup = useCallback(async () => {
    const offer = await fetchPickup(BACKEND_URL);
    if (offer) setPickupOffer(offer);
    return offer;
  }, []);
  useEffect(() => {
    void refreshPickup();
  }, [refreshPickup]);
  useEffect(() => {
    if (paymentModalOpen) void refreshPickup();
  }, [paymentModalOpen, refreshPickup]);

  const deliveryProblem = pickupProblem(pickupOffer, delivery);
  // Pickup covers the whole order, so no address is needed for it.
  const needsAddress = delivery.method !== "pickup";
  const pickedShow = chosenShow(pickupOffer, delivery);

  // Sent with prepare. Read through a ref inside async payment callbacks.
  const deliveryPayload = { method: delivery.method, showId: delivery.method === "pickup" ? pickedShow?.id ?? delivery.showId : null };
  const deliveryPayloadRef = useRef(deliveryPayload);
  useEffect(() => {
    deliveryPayloadRef.current = deliveryPayload;
  });

  const changeDelivery = (next: DeliveryChoice) => {
    setDelivery(next);
    setDeliveryNotice(null);
  };

  // Meta Commerce: the cart as Pixel lines. Read BEFORE the cart is cleared on
  // a confirmed order, or Purchase would go out with no products. It runs inside
  // checkout's own try blocks, so it must never throw — a tracking hiccup there
  // would read as a failed checkout after the card was already charged.
  const pixelLines = (): PixelLine[] => {
    try {
      return cartDetails.map((item) => ({ id: item.id, quantity: item.qty, priceCents: item.priceCents }));
    } catch {
      return [];
    }
  };

  // Meta Commerce: a product counts as viewed once it's the one on screen.
  // Not while the "no drop active" screen is up — no products are shown then.
  useEffect(() => {
    if (showLandingScreen || !active) return;
    trackViewContent(active);
  }, [active, showLandingScreen]);

  const showToast = (message: string, duration = 1200) => {
    setToast(message);
    window.setTimeout(() => setToast(""), duration);
  };

  async function addToCart(productId: string) {
    try {
      const res = await fetchWithSession(`${BACKEND_URL}/api/cart/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, qty: 1 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        showToast(json.error ?? res.statusText ?? "Unable to add", 1600);
        return;
      }
      if (json.cart) {
        setCart(toCartList(json.cart));
      } else {
        setCart((prev) => {
          const now = Date.now();
          const existing = prev.find((item) => item.id === productId);
          if (existing) {
            return prev.map((item) =>
              item.id === productId
                ? { ...item, qty: item.qty + 1, holdExpiresAt: now + CART_HOLD_MS }
                : item,
            );
          }
          return [...prev, { id: productId, qty: 1, holdExpiresAt: now + CART_HOLD_MS }];
        });
      }
      const added = catalog.find((p) => p.id === productId);
      if (added) trackAddToCart(added, 1);
      showToast("Added to cart");
    } catch {
      showToast("Network error", 1600);
    }
  }

  async function saveProduct(
    productId: string,
    params?: { email?: string; name?: string; silent?: boolean },
  ) {
    try {
      setSaveBusy(productId);
      const payload: Record<string, unknown> = { productId };
      const email = params?.email?.trim();
      const name = params?.name?.trim();

      if (account.user) {
        if (!account.user.email && email) payload.email = email;
        if (!account.user.name && name) payload.name = name;
      } else {
        if (email) payload.email = email;
        if (name) payload.name = name;
      }

      const res = await fetchWithSession(`${BACKEND_URL}/api/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? res.statusText ?? "Unable to save item");
      }
      setSavedIds((prev) => ({ ...prev, [productId]: true }));
      if (!params?.silent) {
        showToast(json.releaseTriggered ? "Vault release triggered!" : "Saved", 2000);
      }
      await refreshDropState();
      return json;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save this item";
      if (!params?.silent) {
        showToast(message, 2200);
      }
      throw error;
    } finally {
      setSaveBusy(null);
    }
  }

  const handleSaveSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!saveSheet) return;
    const email = saveSheet.email.trim();
    if (!email || !email.includes("@")) {
      setSaveSheet((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              message: "Enter a valid email to get notified.",
            }
          : prev,
      );
      return;
    }
    try {
      setSaveSheet((prev) =>
        prev
          ? {
              ...prev,
              status: "saving",
              message: undefined,
            }
          : prev,
      );
      const response = await saveProduct(saveSheet.productId, {
        email,
        silent: true,
      });
      setSaveSheet((prev) =>
        prev && prev.productId === saveSheet.productId
          ? {
              ...prev,
              status: "success",
              message: response?.releaseTriggered
                ? "Threshold hit! Watch your inbox for the Vault window."
                : "Saved. We'll email you for the next Vault release.",
            }
          : prev,
      );
      window.setTimeout(() => setSaveSheet(null), 1600);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save this item";
      setSaveSheet((prev) =>
        prev && prev.productId === saveSheet.productId
          ? { ...prev, status: "error", message }
          : prev,
      );
    }
  };

  async function removeFromCart(productId: string, qty = 1, message?: string) {
    try {
      const res = await fetchWithSession(`${BACKEND_URL}/api/cart/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, qty }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        showToast(json.error ?? res.statusText ?? "Unable to update cart", 1600);
        return;
      }
      if (json.cart) {
        setCart(toCartList(json.cart));
      }
      if (message) showToast(message, 1500);
    } catch {
      showToast("Network error", 1600);
    }
  }

  async function beginCheckout() {
    if (!itemsTotal) {
      showToast("Cart is empty", 1600);
      return;
    }
    if (!stripePromise) {
      showToast("Checkout unavailable", 2000);
      return;
    }
    setCheckoutLoading(true);
    setPaymentError(null);
    try {
      const res = await fetchWithSession(`${BACKEND_URL}/api/checkout/create-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Recorded on the payment when the bag came from a checkout link. The
        // charge is the bag's own total either way — see the server.
        body: JSON.stringify(linkCoupon ? { coupon: linkCoupon } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.clientSecret) {
        showToast(json.error ?? "Unable to start checkout", 2600);
        return;
      }
      setPaymentIntentState({
        clientSecret: json.clientSecret,
        paymentIntentId: json.paymentIntentId,
        amount: Number(json.amount) || priceTotalCents,
      });
      trackInitiateCheckout(pixelLines(), Number(json.amount) || priceTotalCents);
      setCartOpen(false);
      setPaymentModalOpen(true);
    } catch {
      showToast("Checkout error", 2000);
    } finally {
      setCheckoutLoading(false);
    }
  }

  // Right before the card is charged, the server re-checks the pickup/shipping
  // choice, pickup eligibility, contact details, address and sizes. Nothing is
  // charged unless it agrees. If pickup closed meanwhile, the customer is told
  // and chooses shipping themselves.
  async function prepareCheckout(paymentIntentId: string, customer: CheckoutCustomer, choice?: DeliveryChoice): Promise<PrepareResult> {
    try {
      const res = await fetchWithSession(`${BACKEND_URL}/api/checkout/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIntentId,
          fulfillment: choice ?? deliveryPayloadRef.current,
          customer,
          sizes: sizesPayloadRef.current,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) return { ok: true };
      const error = json.error ?? "Unable to prepare payment. Nothing was charged.";
      if (FULFILLMENT_CODES.has(json.code) && !choice) {
        setDeliveryNotice(error);
        void refreshPickup();
      }
      return { ok: false, error, code: json.code };
    } catch {
      return { ok: false, error: "Network error. Nothing was charged; try again." };
    }
  }

  async function finalizeCheckout(paymentIntentId: string, customer: CheckoutCustomer): Promise<boolean> {
    try {
      const res = await fetchWithSession(`${BACKEND_URL}/api/checkout/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId, customer, sizes: sizesPayloadRef.current }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setPaymentError(json.error ?? "Checkout failed");
        return false;
      }
      const purchasedLines = pixelLines();
      setCart([]);
      // The code belonged to that order. A bag built afterwards is a new one.
      setLinkCoupon(null);
      setPaymentIntentState(null);
      setPaymentModalOpen(false);
      const confirmed: OrderConfirmation = confirmationFromResponse(json, paymentIntentId, customer, paymentIntentState?.amount ?? 0, itemsTotal);
      setDelivery(SHIP_BY_DEFAULT);
      setDeliveryNotice(null);
      setOrderConfirmation(confirmed);
      trackPurchase(confirmed.orderId, purchasedLines, confirmed.totalCents);
      showToast("Order confirmed", 2000);
      if (account.user) {
        void account.loadOrders();
        void account.refreshUser();
      }
      return true;
    } catch {
      setPaymentError("Checkout confirmation failed");
      return false;
    }
  }

  const handlePaymentClose = () => {
    if (paymentProcessing) return;
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

  const refetchCatalog = () => setRefreshKey((key) => key + 1);
  const refreshExperience = () => {
    void refreshDropState();
    refetchCatalog();
  };

  useEffect(() => {
    if (dropState !== "scheduled") return;
    const interval = window.setInterval(() => {
      void refreshDropState();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [dropState, refreshDropState]);

  useEffect(() => {
    if (dropState !== "scheduled" || scheduledStartMs == null) return;
    const delay = Math.max(0, scheduledStartMs - Date.now()) + 1000;
    const timer = window.setTimeout(() => {
      void refreshDropState();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [dropState, scheduledStartMs, refreshDropState]);

  useEffect(() => {
    if (dropState !== "scheduled" || !countdownComplete) return;
    const interval = window.setInterval(() => {
      void refreshDropState();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [dropState, countdownComplete, refreshDropState]);

  useEffect(() => {
    const body = document.body;
    if (showLandingScreen) {
      body.classList.remove("single-item-mode");
      body.classList.remove("multi-item-mode");
      return () => {
        body.classList.remove("single-item-mode");
        body.classList.remove("multi-item-mode");
      };
    }
    if (singleItemMode) {
      body.classList.add("single-item-mode");
      body.classList.remove("multi-item-mode");
    } else {
      body.classList.remove("single-item-mode");
      body.classList.add("multi-item-mode");
    }
    return () => {
      body.classList.remove("single-item-mode");
      body.classList.remove("multi-item-mode");
    };
  }, [showLandingScreen, singleItemMode]);

  const pageContentClass = showLandingScreen
    ? "page-content page-content--landing"
    : singleItemMode
    ? "page-content page-content--single"
    : "page-content page-content--multi";

  return (
    <Elements stripe={stripePromise}>
    <div className="grain" style={{ background: PAGE_BG }}>
      <SiteHeader
        ref={headerRef}
        subtitle="Pre-Season 001"
        cartCount={itemsTotal}
        onCartClick={() => setCartOpen(true)}
        account={{ label: account.user ? "Account" : "Sign in", onSelect: () => setAccountOpen(true) }}
        extra={
          <>
            <div className="status">
              <span className={`dot ${isLive && totalRemaining > 0 ? "dot-live" : "dot-idle"}`} />
              <span className="state">{isLive ? "LIVE" : dropState === "scheduled" ? "SET SOON" : "OFFLINE"}</span>
              {isLive && totalRemaining > 0 && (
                <>
                  <span className="sep" />
                  <span className="pill">{active?.madeToOrder ? "Made to order" : `Remaining: ${Math.max(0, activeRemaining)}`}</span>
                </>
              )}
            </div>
          </>
        }
      />

      <main className={pageContentClass} role="main">
        {showLandingScreen ? (
          <LandingScreen
            status={dropState}
            countdown={countdownParts}
            startsAtLabel={formattedSetStart}
            countdownComplete={countdownComplete}
            waking={dropWaking}
            onRefresh={refreshExperience}
          />
        ) : (
          <>
      {loadingCatalog && visibleCatalog.length === 0 && (
        <div style={{ padding: 24 }}>
          {catalogWaking ? "Waking the shop up, one moment..." : "Loading catalog..."}
        </div>
      )}
      {!loadingCatalog && loadError && <div style={{ padding: 24 }}>{loadError}</div>}
      {!loadingCatalog && !loadError && visibleCatalog.length === 0 && (
        <div className="empty-state">
          <div className="empty-card">
            <div className="empty-glow" />
            <div className="empty-badge">DROP PAUSED</div>
            <h2>Curating the next release</h2>
            <p>
              The next capsule is being finished in the studio. Keep this window open and we'll
              light it up the moment inventory lands.
            </p>
            <button type="button" className="empty-refresh" onClick={refetchCatalog}>
              Refresh catalog
            </button>
          </div>
        </div>
      )}

      {visibleCatalog.map((product) => {
        const pCanAdd = Boolean(isLive && purchasable(product));
        const pShowSave = Boolean(!isLive || !purchasable(product));
        const pIsSaved = Boolean(savedIds[product.id]);
        const pBusy = saveBusy === product.id;
        const pDisabled = pCanAdd ? false : pShowSave ? (pBusy || pIsSaved) : true;
        const pLabel = pCanAdd ? "Add" : pShowSave ? (pBusy ? "Saving..." : pIsSaved ? "Saved" : "Save") : "Locked";
        const pClass = pCanAdd ? "live" : pShowSave ? "save" : "";
        const descriptor = productDescriptor(product);

        return (
          <section
            key={product.id}
            className="section"
            style={{ background: sectionBackground(product.bg) }}
            data-tag={product.tags[0] ?? ""}
          >
            <div
              ref={(el) => {
                sectionRefs.current[product.id] = el;
              }}
              data-pid={product.id}
              className="media"
            >
              <ProductGallery images={product.images} labels={product.imageLabels} title={product.title} />
            </div>
            <div className="section-info">
              <div className="section-info__text">
                <div className="title">{product.title}</div>
                <div className="price">{formatCurrency(product.priceCents)}</div>
                {descriptor ? (
                  <div className="tagline tagline--print">{descriptor}</div>
                ) : product.tags.length > 0 ? (
                  <div className="tagline">{product.tags.join(" · ")}</div>
                ) : null}
                {product.madeToOrder ? <div className="tagline tagline--mto">Made to order</div> : null}
              </div>
              <div className={`meta-actions${itemsTotal > 0 ? " has-bag" : ""}`}>
                <div className="meta-primary">
                  <button
                    className={`cta ${pClass}`}
                    onClick={() => {
                      if (pDisabled) return;
                      if (pCanAdd) { void addToCart(product.id); return; }
                      if (pShowSave) {
                        if (account.user?.email) {
                          void saveProduct(product.id, { silent: false });
                        } else {
                          setSaveSheet({ productId: product.id, email: "", status: "idle" });
                        }
                      }
                    }}
                    disabled={pDisabled}
                  >
                    {pLabel}
                  </button>
                </div>
                {itemsTotal > 0 && (
                  <div className="meta-secondary">
                    <button type="button" className="bag-cta" onClick={() => setCartOpen(true)}>
                      <span className="bag-cta__count">{itemsTotal}</span>
                      <span className="bag-cta__label">Bag</span>
                      <span className="bag-cta__total">{formatCurrency(priceTotalCents)}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {active && (
        <div ref={metaRef} className="meta">
          <div style={{ display: "grid", gap: 6 }}>
            <div className="title-wrap">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={active.id}
                  className="title"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  {active.title}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="price">{formatCurrency(active.priceCents)}</div>
            {productDescriptor(active) ? (
              <div className="tagline tagline--print">{productDescriptor(active)}</div>
            ) : active.tags.length > 0 ? (
              <div className="tagline">{active.tags.join(" · ")}</div>
            ) : null}
            {active.madeToOrder ? <div className="tagline tagline--mto">Made to order</div> : null}
          </div>

          <div className={`meta-actions${itemsTotal > 0 ? " has-bag" : ""}`}>
            <div className="meta-primary">
              <button
                className={`cta ${canAdd ? "live" : showSave ? "save" : ""}`}
                onClick={() => {
                  if (!active || primaryDisabled) return;
                  if (canAdd) {
                    void addToCart(active.id);
                    return;
                  }
                  if (showSave) {
                    if (account.user?.email) {
                      void saveProduct(active.id, { silent: false });
                    } else {
                      setSaveSheet((prev) => ({
                        productId: active.id,
                        email: prev?.productId === active.id ? prev.email : "",
                        status: "idle",
                      }));
                    }
                  }
                }}
                disabled={primaryDisabled}
                title={primaryTitle}
              >
                {primaryLabel}
              </button>
              <ShareButton productId={active.id} title={active.title} />
            </div>
            {itemsTotal > 0 && (
              <div className="meta-secondary">
                <button
                  type="button"
                  className="bag-cta"
                  onClick={() => setCartOpen(true)}
                  title="Review cart"
                >
                  <span className="bag-cta__count">{itemsTotal}</span>
                  <span className="bag-cta__label">Bag</span>
                  <span className="bag-cta__total">{formatCurrency(priceTotalCents)}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      <AnimatePresence>
        {saveSheet && (
          <>
            <motion.div
              key="save-backdrop"
              className="save-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              exit={{ opacity: 0 }}
              onClick={() => (saveSheet.status === "saving" ? null : setSaveSheet(null))}
            />
            <motion.div
              key="save-sheet"
              className="save-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
            >
              <div className="save-sheet__header">
                <div>
                  <div className="save-sheet__badge">Vault save</div>
                  <h3>Get notified when it unlocks</h3>
                </div>
              </div>
              <form className="save-sheet__form" onSubmit={handleSaveSubmit}>
                <label htmlFor="save-email">Email</label>
                <input
                  id="save-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={saveSheet.email}
                  onChange={(event) =>
                    setSaveSheet((prev) =>
                      prev && prev.productId === saveSheet.productId
                        ? {
                            ...prev,
                            email: event.target.value,
                            status: prev.status === "error" || prev.status === "success" ? "idle" : prev.status,
                            message: prev.status === "error" ? undefined : prev.message,
                          }
                        : prev,
                    )
                  }
                  disabled={saveSheet.status === "saving"}
                  required
                />
                <p className="save-sheet__note">
                  Save it once. We'll email you when the Vault restocks this product.
                </p>
                {saveSheet.message && (
                  <div className={`save-sheet__message save-sheet__message--${saveSheet.status}`}>
                    {saveSheet.message}
                  </div>
                )}
                <div className="save-sheet__actions">
                  <button
                    type="button"
                    className="save-sheet__cancel"
                    onClick={() => setSaveSheet(null)}
                    disabled={saveSheet.status === "saving"}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="save-sheet__submit"
                    disabled={
                      saveSheet.status === "saving" ||
                      saveSheet.status === "success" ||
                      !saveSheet.email.trim()
                    }
                  >
                    {saveSheet.status === "saving"
                      ? "Saving..."
                      : saveSheet.status === "success"
                      ? "Saved!"
                      : "Save"}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

          </>
        )}

      {/* The bag and the toast sit outside the landing/shop split on
          purpose. A checkout link fills the bag whether or not a drop is
          live, so between drops the shop still has to be able to show it —
          inside that branch they simply would not exist on the page. */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cartOpen && itemsTotal > 0 && (
          <>
            <motion.div
              key="cart-backdrop"
              className="cart-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCartOpen(false)}
            />
            <motion.div
              key="cart-sheet"
              className="cart-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              role="dialog"
              aria-label="Bag"
            >
              <div className="cart-sheet__header">
                <span>Bag</span>
                <button
                  type="button"
                  className="cart-sheet__close"
                  onClick={() => setCartOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="cart-sheet__body">
                {cartDetails.map((item) => (
                  <div className="cart-line" key={item.id}>
                    <div className="cart-line__thumb" aria-hidden="true">
                      {item.img ? <img src={item.img} alt="" loading="lazy" /> : null}
                    </div>
                    <div className="cart-line__info">
                      <div className="cart-line__top">
                        <div>
                          <div className="cart-line__title">{item.title}</div>
                          {item.descriptor ? <div className="cart-line__desc">{item.descriptor}</div> : null}
                        </div>
                        <div className="cart-line__price">
                          {formatCurrency(item.priceCents)}
                          {item.qty > 1 ? <span> each</span> : null}
                        </div>
                      </div>
                      {item.sizes.length > 0 &&
                        item.picked.map((chosenSize, unit) => (
                          <div className="size-pick" key={`${item.id}-${unit}`}>
                            <span className="size-pick__label">
                              {item.qty > 1 ? `Size — item ${unit + 1}` : "Size"}
                              {chosenSize ? <strong> {chosenSize}</strong> : null}
                            </span>
                            <div
                              className="size-pick__options"
                              role="radiogroup"
                              aria-label={`Size for ${item.title}${item.qty > 1 ? `, item ${unit + 1}` : ""}`}
                            >
                              {item.sizes.map((size) => (
                                <button
                                  key={size}
                                  type="button"
                                  role="radio"
                                  aria-checked={chosenSize === size}
                                  className={`size-pick__option${chosenSize === size ? " is-on" : ""}`}
                                  onClick={() => chooseSize(item.id, unit, size)}
                                >
                                  {size}
                                </button>
                              ))}
                              {unit === 0 && item.sizeGuide ? <SizeGuideToggle guide={item.sizeGuide} title={item.title} /> : null}
                            </div>
                          </div>
                        ))}
                      <div className="cart-line__row">
                        <div className="cart-line__controls">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id, 1)}
                            aria-label={`Remove one ${item.title}`}
                          >
                            -
                          </button>
                          <span className="cart-line__qty">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => addToCart(item.id)}
                            aria-label={`Add one ${item.title}`}
                          >
                            +
                          </button>
                        </div>
                        {item.madeToOrder ? (
                          <span className="cart-line__hold">Made to order</span>
                        ) : item.holdSecondsRemaining != null && item.holdSecondsRemaining > 0 ? (
                          <span className="cart-line__hold">Hold {formatHoldCountdown(item.holdSecondsRemaining)}</span>
                        ) : null}
                        <button
                          type="button"
                          className="cart-line__remove"
                          onClick={() => removeFromCart(item.id, item.qty, "Removed from bag")}
                          aria-label={`Remove ${item.title} from bag`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cart-sheet__footer">
                <div className="cart-sheet__summary">
                  <span>Total</span>
                  <strong>{formatCurrency(priceTotalCents)}</strong>
                </div>
                {/* The wallet sheet charges straight from the bag and always ships;
                    pickup is chosen in Checkout. It waits for sizes like Checkout does. */}
                {isLive && !missingSizeFor ? (
                  <CartPaymentRequestButton
                    amountCents={priceTotalCents}
                    sizes={sizesPayload}
                    coupon={linkCoupon}
                    onPrepare={(paymentIntentId, customer) => prepareCheckout(paymentIntentId, customer, SHIP_BY_DEFAULT)}
                    onCheckoutStart={() => trackInitiateCheckout(pixelLines(), priceTotalCents)}
                    onOrderComplete={(confirmation) => {
                      const purchasedLines = pixelLines();
                      setCart([]);
                      setLinkCoupon(null);
                      setCartOpen(false);
                      setOrderConfirmation(confirmation);
                      trackPurchase(confirmation.orderId, purchasedLines, confirmation.totalCents);
                      showToast("Order confirmed", 2000);
                    }}
                    onError={(msg) => showToast(msg, 3000)}
                  />
                ) : null}
                {/* Between drops a link still fills the bag, so the bag is the
                    place that explains why it can't be paid for yet. The drop
                    is the outer blocker: sizes don't matter until it opens. */}
                {!isLive ? (
                  <div className="cart-sheet__note" aria-live="polite">
                    Checkout opens when the next drop goes live. Your bag is saved until then.
                  </div>
                ) : missingSizeFor ? (
                  <div className="cart-sheet__note" aria-live="polite">
                    Choose a size for {missingSizeFor.title} to check out.
                  </div>
                ) : null}
                <button
                  type="button"
                  className="cart-sheet__checkout"
                  onClick={beginCheckout}
                  disabled={checkoutLoading || !isLive || Boolean(missingSizeFor)}
                >
                  {checkoutLoading ? "Preparing..." : `Checkout · ${formatCurrency(priceTotalCents)}`}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </main>
      <PaymentModal
        open={paymentModalOpen}
        intent={paymentIntentState}
        onRequestClose={handlePaymentClose}
        onPaymentComplete={handlePaymentComplete}
        processing={paymentProcessing}
        error={paymentError}
        accountUser={account.user}
        checkout={{
          pickup: pickupOffer,
          delivery,
          onDeliveryChange: changeDelivery,
          notice: deliveryNotice,
          problem: deliveryProblem,
          needsAddress,
          onPrepare: (paymentIntentId, customer) => prepareCheckout(paymentIntentId, customer),
        }}
      />
      <OrderConfirmationSheet
        open={!!orderConfirmation}
        confirmation={orderConfirmation}
        onRequestClose={handleConfirmationClose}
      />
      <AccountSheet
        open={accountOpen}
        onRequestClose={() => setAccountOpen(false)}
        user={account.user}
        loading={account.loading}
        error={account.error}
        orders={account.orders}
        ordersLoading={account.ordersLoading}
        onLogin={account.login}
        onRegister={account.register}
        onLogout={async () => {
          await account.logout();
          setAccountOpen(false);
        }}
        onSaveShipping={account.saveShipping}
        onRefreshOrders={account.loadOrders}
        formatCurrency={formatCurrency}
      />
    </div>
    </Elements>
  );
}

type LandingScreenProps = {
  status: "idle" | "scheduled" | "live";
  countdown: CountdownPart[];
  startsAtLabel: string | null;
  countdownComplete: boolean;
  /** The API is still waking; "no drop" would be a guess, not a fact. */
  waking?: boolean;
  onRefresh: () => void;
};

function LandingScreen({
  status,
  countdown,
  startsAtLabel,
  countdownComplete,
  waking = false,
  onRefresh,
}: LandingScreenProps) {
  const isScheduled = status === "scheduled";
  const eyebrow = waking ? "Connecting" : isScheduled ? "Drop incoming" : "No drop active";
  const title = waking
    ? "One moment."
    : isScheduled
    ? countdownComplete
      ? "Going live now"
      : "The room opens soon"
    : "Something's in the works.";
  const copy = waking
    ? "Reaching the studio — this page fills in by itself the moment it answers."
    : isScheduled
    ? countdownComplete
      ? "Hold tight — the drop is loading."
      : "Countdown locked to the scheduled drop time. The storefront opens automatically when we go live."
    : "The next release is being put together. This page turns into a live countdown the moment we schedule a drop.";

  return (
    <section className="landing-screen">
      <div className="landing-screen__orb landing-screen__orb--left" aria-hidden="true" />
      <div className="landing-screen__orb landing-screen__orb--right" aria-hidden="true" />
      <motion.div
        className="landing-screen__panel"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="landing-screen__eyebrow">{eyebrow}</div>
        <h1 className="landing-screen__title">{title}</h1>
        <p className="landing-screen__copy">{copy}</p>

        {/* No drop data yet while connecting, so empty tiles would be noise. */}
        {!waking && (
        <div className="landing-screen__countdown" aria-label="Countdown to live set">
          {countdown.map((part) => (
            <div key={part.label} className="landing-screen__tile">
              <strong>{part.value}</strong>
              <span>{part.label}</span>
            </div>
          ))}
        </div>
        )}

        <div className="landing-screen__footer">
          <div className="landing-screen__schedule">
            {waking
              ? "Checking the schedule"
              : startsAtLabel
              ? `Starts ${startsAtLabel}`
              : "Release window TBA"}
          </div>
          <button type="button" className="landing-screen__refresh" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </motion.div>
    </section>
  );
}

type OrderConfirmationProps = {
  open: boolean;
  confirmation: OrderConfirmation | null;
  onRequestClose: () => void;
};

/** Pickup or shipping details for a paid order, straight from what the server recorded. */
function ConfirmationFulfillment({ confirmation }: { confirmation: OrderConfirmation }) {
  const f = confirmation.fulfillment;
  const address = confirmation.customer.address;
  const addressLines = address
    ? [address.line1, address.line2, [address.city, address.state, address.postalCode].filter(Boolean).join(", "), address.country]
        .map((part) => (part ?? "").trim())
        .filter(Boolean)
    : [];

  if (f?.method === "pickup") {
    return (
      <div className="order-confirm-card order-confirm-card--pickup">
        <div className="order-confirm-card__label">Pick up at the show</div>
        <div className="order-confirm-card__body">
          {f.show ? (
            <>
              <strong>{f.show.name}</strong>
              <div>{f.show.dateLabel}</div>
              <div>{f.show.location}</div>
            </>
          ) : (
            <strong>At the show</strong>
          )}
          {f.pickupHours ? <div>Pickup: {f.pickupHours}</div> : null}
          <div>Bring this confirmation or your receipt email, and your order number {confirmation.orderNumber}.</div>
          {f.bonus ? <div className="order-confirm-card__bonus">{f.bonus} included</div> : null}
          {f.pickupInstructions || f.missedPickupPolicy ? (
            <details className="order-confirm-more">
              <summary>More about pickup</summary>
              {f.pickupInstructions ? <p>{f.pickupInstructions}</p> : null}
              {f.missedPickupPolicy ? (
                <p>
                  <strong>If you can’t make it:</strong> {f.missedPickupPolicy}
                </p>
              ) : null}
            </details>
          ) : null}
        </div>
      </div>
    );
  }

  return addressLines.length ? (
    <div className="order-confirm-card">
      <div className="order-confirm-card__label">Ship to</div>
      <div className="order-confirm-card__body">
        {addressLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        <div>We’ll email you when it ships.</div>
      </div>
    </div>
  ) : null;
}

function OrderConfirmationSheet({ open, confirmation, onRequestClose }: OrderConfirmationProps) {
  const supportHref = confirmation
    ? `mailto:${supportEmail}?subject=${encodeURIComponent(`Order ${confirmation.orderNumber}`)}`
    : `mailto:${supportEmail}`;
  return (
    <AnimatePresence>
      {open && confirmation ? (
        <>
          <motion.div
            key="confirm-backdrop"
            className="order-confirm-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onRequestClose}
          />
          <motion.div
            key="confirm-sheet"
            className="order-confirm-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            role="dialog"
            aria-labelledby="order-confirm-title"
          >
            <div className="order-confirm-header">
              <div>
                <h3 id="order-confirm-title">Thanks — order confirmed</h3>
                <p>
                  Order <span className="order-confirm-number">{confirmation.orderNumber}</span>
                  {confirmation.customer.email ? ` · receipt sent to ${confirmation.customer.email}` : ""}
                </p>
              </div>
              <button type="button" className="order-confirm-close" onClick={onRequestClose}>
                Close
              </button>
            </div>
            <div className="order-confirm-body">
              <div className="order-confirm-items">
                {confirmation.items.map((item, i) => (
                  <div className="order-confirm-item" key={`${item.productId}-${item.size ?? ""}-${i}`}>
                    <div className="order-confirm-item__thumb" aria-hidden="true">
                      {item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}
                    </div>
                    <div className="order-confirm-item__text">
                      <div className="order-confirm-item__title">{item.title}</div>
                      <div className="order-confirm-item__meta">
                        {[item.size ? `Size ${item.size}` : "", `× ${item.qty}`, item.detail ?? ""].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="order-confirm-item__price">{formatCurrency(item.lineTotalCents)}</div>
                  </div>
                ))}
              </div>
              <ConfirmationFulfillment confirmation={confirmation} />
              <div className="order-confirm-row order-confirm-total">
                <span className="order-confirm-label">Total paid</span>
                <span className="order-confirm-value">
                  {formatCurrency(confirmation.totalCents)}
                </span>
              </div>
              <a className="order-confirm-support" href={supportHref}>
                Questions? Email {supportEmail}
              </a>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/** The blank's measurements, beside the size buttons. Closed until asked for. */
function SizeGuideToggle({ guide, title }: { guide: SizeGuide; title: string }) {
  const [open, setOpen] = useState(false);
  const id = `size-guide-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <span className="size-guide">
      <button
        type="button"
        className="size-guide__toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        Size guide
      </button>
      {open ? (
        <span className="size-guide__panel" id={id} role="region" aria-label={`Size guide for ${title}`}>
          <table>
            <thead>
              <tr>
                <th scope="col">Size</th>
                <th scope="col">Chest</th>
                <th scope="col">Length</th>
              </tr>
            </thead>
            <tbody>
              {guide.rows.map((row) => (
                <tr key={row.size}>
                  <th scope="row">{row.size}</th>
                  <td>{row.chest || "—"}</td>
                  <td>{row.length || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {guide.note ? <span className="size-guide__note">{guide.note}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
/**
 * Product shots. One image behaves exactly as before; with more, tapping the
 * image (or the dots) steps through front / back / detail. Swipe works on
 * touch. Deliberately no arrows or chrome at rest — the dots only appear when
 * there is more than one shot.
 */
/** Native share sheet where the device has one, copy-to-clipboard everywhere else. */
function ShareButton({ productId, title }: { productId: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/p/${encodeURIComponent(productId)}`;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* dismissed — nothing to report */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; leave the label alone */
    }
  };

  return (
    <button type="button" className="cta share-cta" onClick={share} aria-label={`Share ${title}`}>
      {copied ? "Copied" : "Share"}
    </button>
  );
}

function ProductGallery({ images, labels, title }: { images: string[]; labels: Record<string, string>; title: string }) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);

  // A product can be swapped out from under us when the catalog reloads.
  useEffect(() => {
    setIndex(0);
  }, [images.join("|")]);

  if (images.length <= 1) {
    return <img src={images[0] ?? "/placeholder.png"} alt={labels[images[0]] ? `${title} — ${labels[images[0]]}` : title} loading="lazy" />;
  }

  const step = (delta: number) =>
    setIndex((i) => (i + delta + images.length) % images.length);
  const labelOf = (src: string, i: number) => labels[src] || `View ${i + 1}`;
  const hasLabels = images.some((src) => Boolean(labels[src]));

  return (
    <div
      className={`shots${hasLabels ? " shots--labeled" : ""}`}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
      }}
    >
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={`${title} — ${labelOf(src, i)}`}
          loading={i === 0 ? "eager" : "lazy"}
          className={i === index ? "is-current" : undefined}
          aria-hidden={i === index ? undefined : true}
        />
      ))}

      <button
        type="button"
        className="shots__hit"
        aria-label={`${title} — next view`}
        onClick={() => step(1)}
      />

      {/* Labeled views ("Front", "Back", "Artwork") when the product names them; plain dots otherwise. */}
      <div className={`shots__dots${hasLabels ? " shots__dots--labeled" : ""}`} role="tablist" aria-label={`${title} views`}>
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`${labelOf(src, i)} (${i + 1} of ${images.length})`}
            className={i === index ? "is-on" : undefined}
            onClick={() => setIndex(i)}
          >
            {hasLabels ? labelOf(src, i) : null}
          </button>
        ))}
      </div>
    </div>
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
    if (!open) return;
    setFormError(null);
    setShippingStatus(null);
    setFormLoading(false);
    if (!user) {
      setAuthMode("login");
    }
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    if (user?.defaultShipping) {
      setShipLine1(user.defaultShipping.line1 ?? "");
      setShipLine2(user.defaultShipping.line2 ?? "");
      setShipCity(user.defaultShipping.city ?? "");
      setShipState(user.defaultShipping.state ?? "");
      setShipPostal(user.defaultShipping.postalCode ?? "");
      setShipCountry((user.defaultShipping.country ?? "US").toUpperCase());
    } else if (!user) {
      setShipLine1("");
      setShipLine2("");
      setShipCity("");
      setShipState("");
      setShipPostal("");
      setShipCountry("US");
    }
  }, [open, user]);

  useEffect(() => {
    if (open && user && !ordersLoading && orders.length === 0) {
      void onRefreshOrders();
    }
  }, [open, user, orders.length, ordersLoading, onRefreshOrders]);

  // Escape closes the sheet — the backdrop sits under it on a phone, so tapping
  // outside is not an option there.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onRequestClose]);

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      await onLogin(loginEmail.trim(), loginPassword);
      setLoginEmail("");
      setLoginPassword("");
      setAuthMode("login");
      setShippingStatus(null);
      void onRefreshOrders();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setFormLoading(false);
    }
  };

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      await onRegister({
        name: registerName.trim() || undefined,
        email: registerEmail.trim(),
        password: registerPassword,
      });
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      setAuthMode("login");
      setShippingStatus(null);
      void onRefreshOrders();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to create account");
    } finally {
      setFormLoading(false);
    }
  };

  const handleSaveShipping = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShippingStatus(null);
    setFormError(null);
    if (!user) {
      setFormError("Sign in to save shipping details");
      return;
    }
    if (!shipLine1 || !shipCity || !shipState || !shipPostal) {
      setFormError("Complete all required shipping fields");
      return;
    }
    setFormLoading(true);
    try {
      await onSaveShipping({
        line1: shipLine1.trim(),
        line2: shipLine2.trim() || undefined,
        city: shipCity.trim(),
        state: shipState.trim(),
        postalCode: shipPostal.trim(),
        country: shipCountry.trim().toUpperCase(),
      });
      setShippingStatus("Saved");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save shipping");
    } finally {
      setFormLoading(false);
    }
  };

  const handleLogout = async () => {
    setFormError(null);
    setShippingStatus(null);
    await onLogout();
  };

  const renderOrders = () => {
    if (!user) return null;
    if (ordersLoading) {
      return <div className="account-orders-empty">Loading orders...</div>;
    }
    if (!orders.length) {
      return <div className="account-orders-empty">No purchases yet.</div>;
    }
    return (
      <div className="account-orders-list">
        {orders.map((order) => (
          <div className="account-order" key={order.orderId}>
            <div className="account-order-header">
              <div>
                <div className="account-order-id">Order {order.orderNumber ?? order.orderId}</div>
                <div className="account-order-ts">{new Date(order.ts).toLocaleString()}</div>
              </div>
              <div className="account-order-total">{formatCurrency(order.totalCents)}</div>
            </div>
            <div className="account-order-items">
              {order.items.map((item) => (
                <div className="account-order-item" key={`${order.orderId}-${item.productId}`}>
                  <div className="account-order-item-title">
                    {item.productTitle || item.productId}
                    <span className="account-order-item-id">{item.productId}</span>
                  </div>
                  <div className="account-order-item-meta">
                    <span>{item.qty} · {formatCurrency(item.priceCents)}</span>
                    <strong>{formatCurrency(item.lineTotalCents)}</strong>
                  </div>
                </div>
              ))}
            </div>
            {order.shippingAddress ? (
              <div className="account-order-shipping">
                <div className="account-section-title">Shipped to</div>
                <div className="account-order-address">{formatAccountAddress(order.shippingAddress)}</div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="account-backdrop"
            className="account-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onRequestClose}
          />
          <motion.div
            key="account-sheet"
            className="account-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <div className="account-header">
              <div>
                <h3>{user ? "Your account" : authMode === "login" ? "Sign in" : "Create account"}</h3>
                {user ? <p className="account-subtitle">{user.email}</p> : null}
              </div>
              <button type="button" className="account-close" onClick={onRequestClose}>
                Close
              </button>
            </div>

            {loading ? (
              <div className="account-loading">Loading...</div>
            ) : !user ? (
              <div className="account-auth">
                <div className="account-auth-tabs">
                  <button
                    type="button"
                    className={authMode === "login" ? "active" : ""}
                    onClick={() => setAuthMode("login")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={authMode === "register" ? "active" : ""}
                    onClick={() => setAuthMode("register")}
                  >
                    Create account
                  </button>
                </div>
                {formError ? <div className="account-error">{formError}</div> : null}
                {error ? <div className="account-error">{error}</div> : null}
                {authMode === "login" ? (
                  <form className="account-form" onSubmit={handleLoginSubmit}>
                    <label>
                      Email
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(event) => setLoginEmail(event.target.value)}
                        autoComplete="email"
                        required
                      />
                    </label>
                    <label>
                      Password
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(event) => setLoginPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <button type="submit" className="account-primary" disabled={formLoading}>
                      {formLoading ? "Signing in..." : "Sign in"}
                    </button>
                  </form>
                ) : (
                  <form className="account-form" onSubmit={handleRegisterSubmit}>
                    <label>
                      Name
                      <input
                        value={registerName}
                        onChange={(event) => setRegisterName(event.target.value)}
                        autoComplete="name"
                      />
                    </label>
                    <label>
                      Email
                      <input
                        type="email"
                        value={registerEmail}
                        onChange={(event) => setRegisterEmail(event.target.value)}
                        autoComplete="email"
                        required
                      />
                    </label>
                    <label>
                      Password (min 8 characters)
                      <input
                        type="password"
                        value={registerPassword}
                        onChange={(event) => setRegisterPassword(event.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                    </label>
                    <button type="submit" className="account-primary" disabled={formLoading}>
                      {formLoading ? "Creating..." : "Create account"}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="account-profile">
                {formError ? <div className="account-error">{formError}</div> : null}
                {error ? <div className="account-error">{error}</div> : null}

                <section className="account-section">
                  <div className="account-section-title">Saved shipping</div>
                  <form className="account-form" onSubmit={handleSaveShipping}>
                    <label>
                      Address line 1
                      <input
                        value={shipLine1}
                        onChange={(event) => setShipLine1(event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Address line 2
                      <input
                        value={shipLine2}
                        onChange={(event) => setShipLine2(event.target.value)}
                        placeholder="Apt, suite, etc."
                      />
                    </label>
                    <label>
                      City
                      <input
                        value={shipCity}
                        onChange={(event) => setShipCity(event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      State / Province
                      <input
                        value={shipState}
                        onChange={(event) => setShipState(event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Postal code
                      <input
                        value={shipPostal}
                        onChange={(event) => setShipPostal(event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Country
                      <input
                        value={shipCountry}
                        onChange={(event) => setShipCountry(event.target.value.toUpperCase())}
                        maxLength={2}
                        required
                      />
                    </label>
                    <button type="submit" className="account-primary" disabled={formLoading}>
                      {formLoading ? "Saving..." : "Save shipping"}
                    </button>
                    {shippingStatus ? <div className="account-success">{shippingStatus}</div> : null}
                  </form>
                </section>

                <section className="account-section">
                  <div className="account-section-title">
                    Purchase history
                    <button
                      type="button"
                      className="account-refresh"
                      onClick={() => {
                        setShippingStatus(null);
                        void onRefreshOrders();
                      }}
                      disabled={ordersLoading}
                    >
                      Refresh
                    </button>
                  </div>
                  {renderOrders()}
                </section>

                <button type="button" className="account-secondary" onClick={handleLogout}>
                  Sign out
                </button>
              </div>
            )}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/** The confirmation sheet's data from the server's confirm response. */
function confirmationFromResponse(
  json: Record<string, unknown>,
  paymentIntentId: string,
  customer: CheckoutCustomer,
  fallbackTotal: number,
  fallbackItems: number,
): OrderConfirmation {
  const totals = (json?.totals ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(json?.items) ? (json.items as ConfirmedItem[]) : [];
  const orderId = String(json?.orderId ?? paymentIntentId ?? "");
  return {
    orderId,
    orderNumber: String(json?.orderNumber ?? `NC-${orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase()}`),
    totalCents: Number(totals.grossCents ?? fallbackTotal ?? 0),
    totalItems: Number(totals.items ?? fallbackItems ?? 0),
    items: rawItems,
    // The address the order was recorded with; none for a pickup-only order.
    customer: { ...customer, address: (json?.shippingAddress as CheckoutCustomer["address"]) ?? undefined },
    fulfillment: (json?.fulfillment as ConfirmedFulfillment | undefined) ?? undefined,
  };
}

function formatAccountAddress(address: AccountShippingAddress) {
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", ").trim(),
    address.country,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);
  if (!parts.length) return "-";
  return parts.join("\n");
}



function CartPaymentRequestButton({
  amountCents,
  sizes,
  coupon,
  onPrepare,
  onCheckoutStart,
  onOrderComplete,
  onError,
}: {
  amountCents: number;
  sizes: Record<string, string[]>;
  /** The code the bag arrived with, if it came from a checkout link. */
  coupon?: string | null;
  onPrepare: (paymentIntentId: string, customer: CheckoutCustomer) => Promise<PrepareResult>;
  /** Fired once a wallet payment has a payment intent (Meta InitiateCheckout). */
  onCheckoutStart?: () => void;
  onOrderComplete: (confirmation: OrderConfirmation) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentRequestRef = useRef<any>(null);
  const [prAvailable, setPrAvailable] = useState(false);
  // Bumped whenever the payment request is rebuilt, so handlers and the button re-attach to it.
  const [prVersion, setPrVersion] = useState(0);
  const onOrderCompleteRef = useRef(onOrderComplete);
  const onErrorRef = useRef(onError);
  const onCheckoutStartRef = useRef(onCheckoutStart);
  const onPrepareRef = useRef(onPrepare);
  useEffect(() => { onCheckoutStartRef.current = onCheckoutStart; });
  useEffect(() => { onPrepareRef.current = onPrepare; });
  const sizesPayloadRef = useRef(sizes);
  useEffect(() => { sizesPayloadRef.current = sizes; }, [sizes]);
  const couponRef = useRef(coupon);
  useEffect(() => { couponRef.current = coupon; }, [coupon]);
  useEffect(() => { onOrderCompleteRef.current = onOrderComplete; });
  useEffect(() => { onErrorRef.current = onError; });

  // Create the payment request once, then keep its total in step with the bag.
  useEffect(() => {
    if (!stripe || amountCents <= 0) {
      setPrAvailable(false);
      paymentRequestRef.current = null;
      return;
    }
    if (paymentRequestRef.current) {
      paymentRequestRef.current.update({ total: { label: "NC Order", amount: amountCents } });
      return;
    }
    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: "NC Order", amount: amountCents },
      requestPayerName: true,
      requestPayerEmail: true,
      requestShipping: true,
      shippingOptions: [STANDARD_SHIPPING],
    });
    paymentRequestRef.current = pr;
    setPrAvailable(false);
    setPrVersion((v) => v + 1);
    pr.canMakePayment().then((result) => {
      if (result && paymentRequestRef.current === pr) setPrAvailable(true);
    });
  }, [stripe, amountCents]);

  // Attach payment handlers once the request is ready
  useEffect(() => {
    const pr = paymentRequestRef.current;
    if (!pr || !stripe || !prAvailable) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleShippingChange = (event: any) => {
      event.updateWith({ status: "success", shippingOptions: [STANDARD_SHIPPING] });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlePaymentMethod = async (event: any) => {
      // Create the payment intent on demand
      let clientSecret: string;
      let paymentIntentId: string;
      try {
        const res = await fetchWithSession(`${BACKEND_URL}/api/checkout/create-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(couponRef.current ? { coupon: couponRef.current } : {}),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.clientSecret) {
          event.complete("fail");
          onErrorRef.current(json.error ?? "Unable to start checkout");
          return;
        }
        clientSecret = json.clientSecret;
        paymentIntentId = json.paymentIntentId;
        // Tracking only: guarded separately so it can never fail the payment.
        try { onCheckoutStartRef.current?.(); } catch { /* ignore */ }
      } catch {
        event.complete("fail");
        onErrorRef.current("Checkout error");
        return;
      }

      const shipping = event.shippingAddress;
      const customer: CheckoutCustomer = {
        name: event.payerName ?? "",
        email: event.payerEmail ?? "",
        address: shipping ? {
          line1: shipping.addressLine?.[0] ?? "",
          line2: shipping.addressLine?.[1],
          city: shipping.city ?? "",
          state: shipping.region ?? "",
          postalCode: shipping.postalCode ?? "",
          country: shipping.country ?? "US",
        } : undefined,
      };

      // Same server check as the card form (as a shipped order), before the wallet payment is confirmed.
      const prepared = await onPrepareRef.current(paymentIntentId, customer);
      if (!prepared.ok) {
        event.complete("fail");
        onErrorRef.current(prepared.error ?? "Unable to prepare payment. Nothing was charged.");
        return;
      }

      // Confirm with the wallet payment method
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: event.paymentMethod.id },
        { handleActions: false },
      );
      if (error) { event.complete("fail"); onErrorRef.current(error.message ?? "Payment failed"); return; }
      if (paymentIntent?.status === "requires_action") {
        const { error: actionError } = await stripe.confirmCardPayment(clientSecret);
        if (actionError) { event.complete("fail"); onErrorRef.current(actionError.message ?? "Payment failed"); return; }
      }
      event.complete("success");

      // Confirm order with backend
      try {
        const res = await fetchWithSession(`${BACKEND_URL}/api/checkout/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId, customer, sizes: sizesPayloadRef.current }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) { onErrorRef.current(json.error ?? "Checkout failed"); return; }
        onOrderCompleteRef.current(confirmationFromResponse(json, paymentIntentId, customer, 0, 0));
      } catch {
        onErrorRef.current("Order confirmation failed");
      }
    };

    pr.on("shippingaddresschange", handleShippingChange);
    pr.on("paymentmethod", handlePaymentMethod);
    return () => {
      pr.off("shippingaddresschange", handleShippingChange);
      pr.off("paymentmethod", handlePaymentMethod);
    };
  }, [prAvailable, stripe, prVersion]);

  if (!prAvailable || !paymentRequestRef.current) return null;

  return (
    <div className="cart-pr-button">
      <PaymentRequestButtonElement
        key={prVersion}
        options={{ paymentRequest: paymentRequestRef.current, style: { paymentRequestButton: { height: "52px" } } }}
      />
      <div className="payment-divider"><span>or</span></div>
    </div>
  );
}

/** The delivery choice and the pre-payment check, handed from the shop into checkout. */
type CheckoutFulfillmentProps = {
  /** What pickup checkout can offer right now; null until it has loaded. */
  pickup: PickupOffer | null;
  delivery: DeliveryChoice;
  onDeliveryChange: (choice: DeliveryChoice) => void;
  notice: string | null;
  /** Why paying isn't possible with the current choice, if anything. */
  problem: string | null;
  needsAddress: boolean;
  onPrepare: (paymentIntentId: string, customer: CheckoutCustomer) => Promise<PrepareResult>;
};

type PaymentModalProps = {
  open: boolean;
  intent: PaymentIntentState | null;
  onRequestClose: () => void;
  onPaymentComplete: (paymentIntentId: string, customer: CheckoutCustomer) => Promise<boolean>;
  processing: boolean;
  error?: string | null;
  accountUser?: AccountUser | null;
  checkout: CheckoutFulfillmentProps;
};

function PaymentModal({
  open,
  intent,
  onRequestClose,
  onPaymentComplete,
  processing,
  error,
  accountUser,
  checkout,
}: PaymentModalProps) {
  return (
    <AnimatePresence>
      {open && intent ? (
        <>
          <motion.div
            key="payment-backdrop"
            className="payment-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => (!processing ? onRequestClose() : null)}
          />
          <motion.div
            key="payment-sheet"
            className="payment-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            role="dialog"
            aria-label="Checkout"
          >
            <div className="payment-header">
              <h3>Checkout</h3>
              <button
                type="button"
                className="payment-close"
                onClick={onRequestClose}
                disabled={processing}
              >
                Close
              </button>
            </div>
            {stripePromise ? (
              <Elements key={intent.clientSecret} stripe={stripePromise} options={{ clientSecret: intent.clientSecret }}>
                <StripePaymentForm
                  amount={intent.amount}
                  clientSecret={intent.clientSecret}
                  paymentIntentId={intent.paymentIntentId}
                  onCancel={onRequestClose}
                  onComplete={onPaymentComplete}
                  processing={processing}
                  errorMessage={error}
                  accountUser={accountUser}
                  checkout={checkout}
                />
              </Elements>
            ) : (
              <div className="payment-form">
                <p>Payment processing is currently unavailable.</p>
                <button className="payment-submit" type="button" onClick={onRequestClose}>
                  Close
                </button>
              </div>
            )}
          </motion.div>
        </>
      ) : null}
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
  checkout: CheckoutFulfillmentProps;
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
  checkout,
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
  // Changing delivery flips the address fields on or off immediately. Everything
  // typed stays in state either way, so switching back loses nothing.
  const { needsAddress } = checkout;
  // Pickup is only offered when a show is open for it, or when the server just
  // reported that the customer's pickup choice stopped being possible.
  const showDelivery = Boolean(checkout.pickup && (checkout.pickup.state === "available" || checkout.notice || checkout.delivery.method === "pickup"));

  useEffect(() => {
    if (!accountUser) return;
    setName((prev) => (prev ? prev : accountUser.name ?? ""));
    setEmail((prev) => (prev ? prev : accountUser.email ?? ""));
    const shipping = accountUser.defaultShipping;
    if (shipping) {
      setAddressLine1((prev) => (prev ? prev : shipping.line1 ?? ""));
      setAddressLine2((prev) => (prev ? prev : shipping.line2 ?? ""));
      setCity((prev) => (prev ? prev : shipping.city ?? ""));
      setStateProvince((prev) => (prev ? prev : shipping.state ?? ""));
      setPostalCode((prev) => (prev ? prev : shipping.postalCode ?? ""));
      const normalizedCountry = (shipping.country ?? "US")?.toUpperCase?.() ?? "US";
      setCountry((prev) => (prev ? prev : normalizedCountry));
    }
  }, [accountUser, paymentIntentId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) {
      setLocalError("Card details are required");
      return;
    }

    if (checkout.problem) {
      // The picker already shows a server notice; otherwise say what's missing.
      setLocalError(checkout.notice ? null : checkout.problem);
      return;
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

    if (!trimmedName) {
      setLocalError("Enter your name.");
      return;
    }
    if (!trimmedEmail || !emailPattern.test(trimmedEmail)) {
      setLocalError("Enter a valid email address.");
      return;
    }
    if (needsAddress) {
      if (!trimmedLine1 || !trimmedCity || !trimmedState || !trimmedPostal) {
        setLocalError("Complete the shipping address.");
        return;
      }
      if (trimmedCountry.length !== 2) {
        setLocalError("Use the 2-letter country code (e.g. US).");
        return;
      }
    }

    setSubmitting(true);
    setLocalError(null);

    const customer: CheckoutCustomer = {
      name: trimmedName,
      email: trimmedEmail,
      address: needsAddress
        ? {
            line1: trimmedLine1,
            line2: trimmedLine2 || undefined,
            city: trimmedCity,
            state: trimmedState,
            postalCode: trimmedPostal,
            country: trimmedCountry,
          }
        : undefined,
    };

    // The server checks everything again before the card is touched.
    const prepared = await checkout.onPrepare(paymentIntentId, customer);
    if (!prepared.ok) {
      // Pickup/shipping problems appear on the picker; everything else appears here.
      const fulfillmentIssue = Boolean(prepared.code && FULFILLMENT_CODES.has(prepared.code));
      setLocalError(fulfillmentIssue ? null : prepared.error ?? "Unable to prepare payment. Nothing was charged.");
      setSubmitting(false);
      return;
    }

    const stripeAddress = customer.address
      ? {
          line1: customer.address.line1,
          line2: customer.address.line2,
          city: customer.address.city,
          state: customer.address.state,
          postal_code: customer.address.postalCode,
          country: customer.address.country,
        }
      : undefined;

    const result = await stripe.confirmCardPayment(clientSecret, {
      receipt_email: trimmedEmail,
      payment_method: {
        card,
        billing_details: {
          name: trimmedName,
          email: trimmedEmail,
          ...(stripeAddress ? { address: stripeAddress } : {}),
        },
      },
      // Pickup-only orders have nothing to ship, so no shipping details go to Stripe.
      ...(stripeAddress ? { shipping: { name: trimmedName, address: stripeAddress } } : {}),
    });

    if (result.error) {
      setLocalError(result.error.message ?? "Payment failed");
      setSubmitting(false);
      return;
    }

    const intent = result.paymentIntent;
    if (!intent || intent.status !== "succeeded") {
      setLocalError("Payment was not completed");
      setSubmitting(false);
      return;
    }

    const ok = await onComplete(intent.id, customer);
    if (!ok) {
      setLocalError("Unable to finalize order. Please try again.");
      setSubmitting(false);
    }
  };

  const disabled = submitting || processing || !stripe || !elements;
  const blocked = disabled || Boolean(checkout.problem);
  const payLabel = submitting || processing ? "Processing..." : `Pay ${formatCurrency(amount)}`;

  return (
    <form className="payment-form" onSubmit={handleSubmit}>
      {showDelivery && checkout.pickup ? (
        <PickupOption
          offer={checkout.pickup}
          choice={checkout.delivery}
          onChange={(choice) => {
            setLocalError(null);
            checkout.onDeliveryChange(choice);
          }}
          notice={checkout.notice}
        />
      ) : null}
      {(localError || errorMessage) && (
        <div className="payment-error" role="alert">
          {localError || errorMessage}
        </div>
      )}
      <div className="payment-row">
        <label htmlFor="checkout-name">Full name</label>
        <input
          id="checkout-name"
          placeholder="Alex Shopper"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
        />
      </div>
      <div className="payment-row">
        <label htmlFor="checkout-email">Email</label>
        <input
          id="checkout-email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          inputMode="email"
        />
      </div>
      {needsAddress ? (
        <>
          <div className="payment-row">
            <label htmlFor="checkout-address1">Address line 1</label>
            <input
              id="checkout-address1"
              placeholder="123 Market St"
              value={addressLine1}
              onChange={(event) => setAddressLine1(event.target.value)}
              autoComplete="address-line1"
            />
          </div>
          <div className="payment-row">
            <label htmlFor="checkout-address2">Address line 2 (optional)</label>
            <input
              id="checkout-address2"
              placeholder="Apt, suite, etc."
              value={addressLine2}
              onChange={(event) => setAddressLine2(event.target.value)}
              autoComplete="address-line2"
            />
          </div>
          <div className="payment-row">
            <label htmlFor="checkout-city">City</label>
            <input
              id="checkout-city"
              placeholder="City"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              autoComplete="address-level2"
            />
          </div>
          <div className="payment-row">
            <label htmlFor="checkout-state">State / Province</label>
            <input
              id="checkout-state"
              placeholder="State"
              value={stateProvince}
              onChange={(event) => setStateProvince(event.target.value.toUpperCase())}
              autoComplete="address-level1"
            />
          </div>
          <div className="payment-row">
            <label htmlFor="checkout-postal">Postal code</label>
            <input
              id="checkout-postal"
              placeholder="Postal code"
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              autoComplete="postal-code"
              inputMode="text"
            />
          </div>
          <div className="payment-row">
            <label htmlFor="checkout-country">Country</label>
            <input
              id="checkout-country"
              placeholder="US"
              value={country}
              onChange={(event) => setCountry(event.target.value.toUpperCase())}
              autoComplete="country"
            />
          </div>
        </>
      ) : (
        <p className="payment-note">Picking up: just your name and email, no shipping address needed.</p>
      )}
      <div className="payment-row">
        <label>Card details</label>
        <div className="stripe-card">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "16px",
                  color: "#111",
                  fontFamily: "inherit",
                  "::placeholder": { color: "#9ca3af" },
                },
                invalid: { color: "#ef4444" },
              },
            }}
          />
        </div>
      </div>
      <div className="payment-totals" aria-label="Order total">
        <div className="payment-totals__line payment-totals__line--total"><span>Total</span><span>{formatCurrency(amount)}</span></div>
      </div>
      {checkout.problem && !checkout.notice ? <p className="payment-note">{checkout.problem}</p> : null}
      <div className="payment-actions">
        <button
          type="button"
          className="payment-cancel"
          onClick={onCancel}
          disabled={submitting || processing}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="payment-submit"
          disabled={blocked}
          aria-disabled={blocked}
        >
          {payLabel}
        </button>
      </div>
    </form>
  );
}

export default App;






