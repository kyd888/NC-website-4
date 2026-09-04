import { cartNotificationRecipient, sendCartActivityEmail, type CartActivityLine } from "./mailer.js";

/**
 * Cart adds, batched.
 *
 * A busy drop can push dozens of items into carts a minute, so one email per
 * tap would be unreadable — and would get the sender marked as spam. Instead
 * every add lands here, and the first one opens a window (10 minutes by
 * default, CART_NOTIFY_WINDOW_MINUTES to change it). When the window closes,
 * one digest goes out covering everything inside it. A quiet shop sends
 * nothing at all.
 */

export type CartAddEvent = {
  sessionId: string;
  productId: string;
  title: string;
  qty: number;
  priceCents?: number;
  size?: string;
  email?: string;
};

function windowMinutes(): number {
  const raw = Number.parseFloat(process.env.CART_NOTIFY_WINDOW_MINUTES ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return 10;
  return Math.min(120, Math.max(1, raw));
}

// A digest is a summary, not a log — past this many adds the extra detail
// buys nothing and the memory is worth more.
const MAX_PENDING = 500;

let pending: CartAddEvent[] = [];
let timer: NodeJS.Timeout | null = null;

export function noteCartAdd(event: CartAddEvent): void {
  if (!cartNotificationRecipient()) return;
  if (pending.length < MAX_PENDING) pending.push(event);

  if (!timer) {
    const minutes = windowMinutes();
    timer = setTimeout(() => {
      timer = null;
      void flushCartAlerts(minutes);
    }, minutes * 60 * 1000);
    // Never hold the process open just to send a digest.
    timer.unref?.();
  }
}

/** Sends whatever has accumulated. Exported so a shutdown can drain it. */
export async function flushCartAlerts(minutes = windowMinutes()): Promise<boolean> {
  const batch = pending;
  pending = [];
  if (!batch.length) return false;

  const grouped = new Map<string, CartActivityLine>();
  for (const event of batch) {
    const key = `${event.productId}::${event.size ?? ""}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.qty += event.qty;
    } else {
      grouped.set(key, {
        title: event.title,
        size: event.size,
        qty: event.qty,
        priceCents: event.priceCents,
      });
    }
  }

  const lines = [...grouped.values()].sort((a, b) => b.qty - a.qty);
  const carts = new Set(batch.map((event) => event.sessionId)).size;
  const shoppers = [...new Set(batch.map((event) => event.email).filter((email): email is string => Boolean(email)))];

  try {
    const sent = await sendCartActivityEmail({ lines, carts, windowMinutes: minutes, shoppers });
    if (!sent) console.warn("[cart-alert] Digest not delivered — check the mailer configuration.");
    return sent;
  } catch (error) {
    console.error("[cart-alert] Digest failed:", error);
    return false;
  }
}
