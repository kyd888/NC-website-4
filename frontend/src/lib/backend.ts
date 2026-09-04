import { fetchWithSession } from "./session";

/**
 * Talking to a backend that may be asleep.
 *
 * The API host suspends the service after a quiet spell and takes the better
 * part of a minute to come back. During that window it answers with a holding
 * page rather than JSON, so a single fetch fails and — before this — the shop
 * rendered as empty and stayed that way until the visitor thought to reload.
 * A blank shop during a drop is a lost sale.
 *
 * So requests here retry through a cold start instead of giving up on the
 * first failure, and the last good response is kept in localStorage so a
 * returning visitor sees the catalog immediately while the retry runs behind
 * it.
 */

// Roughly 75 seconds in total, front-loaded: a warm service that blipped
// recovers in a second or two, a cold one gets the full wake-up window.
const BACKOFF_MS = [1_500, 3_000, 5_000, 8_000, 12_000, 15_000, 15_000, 15_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class BackendAsleepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendAsleepError";
  }
}

/** True while the service is starting: unreachable, or answering with the host's holding page. */
function looksLikeColdStart(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export type FetchJsonOptions = RequestInit & {
  /** Called before each wait, so the UI can say it is reconnecting rather than broken. */
  onRetry?: (attempt: number, waitMs: number) => void;
  signal?: AbortSignal;
};

/**
 * Fetches JSON, riding out a cold start. Throws BackendAsleepError only after
 * every attempt has failed — by then the service is genuinely down, not dozing.
 */
export async function fetchBackendJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { onRetry, ...init } = options;
  let lastError = "Unable to reach the shop";

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt += 1) {
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    let retryable = true;
    try {
      const res = await fetchWithSession(url, {
        ...init,
        headers: { Accept: "application/json", ...(init.headers ?? {}) },
      });

      if (res.ok) {
        // A waking service can answer 200 with an HTML holding page, which is
        // a cold start wearing a success code — parse before trusting it.
        const text = await res.text();
        try {
          return JSON.parse(text) as T;
        } catch {
          lastError = "Shop is starting up";
        }
      } else {
        lastError = `Request failed: ${res.status}`;
        retryable = looksLikeColdStart(res.status);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      lastError = error instanceof Error ? error.message : "Network error";
    }

    // A 404 or a 401 will say the same thing however long we wait.
    if (!retryable) break;

    const waitMs = BACKOFF_MS[attempt];
    if (waitMs === undefined) break;
    onRetry?.(attempt + 1, waitMs);
    await sleep(waitMs);
  }

  throw new BackendAsleepError(lastError);
}

// -----------------------------
// Last-known-good snapshots
// -----------------------------

const CACHE_PREFIX = "nc_cache_";
// Stale enough to be worth showing while the service wakes, not so stale that
// a week-old drop reappears.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = { at: number; value: T };

export function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: CacheEnvelope<T> = { at: Date.now(), value };
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(envelope));
  } catch {
    // A full or disabled store just means no snapshot; the fetch still runs.
  }
}
