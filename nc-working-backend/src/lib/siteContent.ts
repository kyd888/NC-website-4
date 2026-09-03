import fs from "fs";
import path from "path";
import { dbEnabled, dbQuery, logDbError } from "./db.js";

/**
 * Editable content for the KYD side of the site — live dates, music, visuals
 * and booking. This used to be hardcoded in the frontend, so the shapes here
 * match what those pages already render.
 */
export type KydProject = {
  slug: string;
  title: string;
  year: string;
  image?: string;
  video?: string;
  listen?: string;
  lyrics?: string[];
  credits?: string[];
  visual?: string;
};

export type KydShow = {
  id: string;
  title: string;
  /** ISO date (YYYY-MM-DD). Past dates flip TICKETS to ARCHIVE on their own. */
  date: string;
  city: string;
  venue?: string;
  poster?: string;
  tickets?: string;
  info?: string;
  archive?: string;
};

export type KydVisual = {
  id: string;
  title: string;
  year: string;
  image?: string;
  url?: string;
};

export type KydBooking = {
  services: string[];
  contacts: Array<{ label: string; email: string }>;
  links: Array<{ label: string; href: string }>;
  photo?: string;
};

export type KydContent = {
  projects: KydProject[];
  shows: KydShow[];
  visuals: KydVisual[];
  booking: KydBooking;
};

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const KYD_FILE = path.join(DATA_DIR, "kyd.json");
const CONTENT_ID = "kyd";

/** Seeded on first run so the site keeps the content it already shipped with. */
const DEFAULT_CONTENT: KydContent = {
  projects: [
    {
      slug: "ember",
      title: "EMBER",
      year: "2026",
      lyrics: [],
      credits: ["WRITTEN / PRODUCED — KYD", "MIXED — KYD", "ART — NO CONNECTION"],
    },
    { slug: "infrasounds", title: "INFRASOUNDS", year: "2026" },
    { slug: "miraj", title: "MIRAJ", year: "2026" },
    { slug: "i-used-to-see-music", title: "I USED TO SEE MUSIC", year: "2026" },
    { slug: "violence-v1", title: "VIOLENCE V1", year: "2026" },
    { slug: "manic-cure", title: "MANIC CURE", year: "2026" },
    { slug: "poor-baby", title: "POOR BABY", year: "2026" },
  ],
  shows: [
    { id: "nc-show-001", title: "NC SHOW 001", date: "2026-09-18", city: "CHICAGO, IL" },
    { id: "live-002", title: "LIVE 002", date: "2026-10-04", city: "CHICAGO, IL" },
    { id: "live-003", title: "LIVE 003", date: "2026-11-21", city: "BROOKLYN, NY" },
  ],
  visuals: [
    { id: "ember-visual", title: "EMBER — VISUAL", year: "2026" },
    { id: "signal-test-01", title: "SIGNAL TEST 01", year: "2026" },
    { id: "infrasounds-live", title: "INFRASOUNDS — LIVE", year: "2026" },
    { id: "no-sleep-poster", title: "NO SLEEP — POSTER", year: "2026" },
  ],
  booking: {
    services: ["Live performance", "Festivals", "Support", "Private events", "Creative collaboration"],
    contacts: [
      { label: "Booking", email: "booking@no-connection.com" },
      { label: "Press", email: "press@no-connection.com" },
      { label: "Management", email: "management@no-connection.com" },
    ],
    links: [
      { label: "EPK", href: "#" },
      { label: "Press photos", href: "#" },
      { label: "Music", href: "/kyd" },
    ],
  },
};

let content: KydContent = clone(DEFAULT_CONTENT);
let loaded = false;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function optional(value: unknown): string | undefined {
  const out = str(value);
  return out.length ? out : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => str(entry)).filter((entry) => entry.length > 0);
}

/** A slug/id safe for a URL. Project slugs show up as /kyd/<slug>. */
function slugify(value: string, fallback: string): string {
  const base = (value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}

/**
 * Prefers an explicit id, then the title, then a positional fallback — and
 * keeps them unique, since two rows sharing a slug would collide in routing.
 */
function uniqueSlug(taken: Set<string>, id: string, title: string, fallback: string): string {
  const base = slugify(id || title, fallback);
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}-${n++}`;
  taken.add(candidate);
  return candidate;
}

export function sanitizeContent(input: unknown): KydContent {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const projectSlugs = new Set<string>();
  const projects: KydProject[] = (Array.isArray(source.projects) ? source.projects : [])
    .map((raw, i): KydProject | null => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const title = str(r.title);
      if (!title) return null;
      return {
        slug: uniqueSlug(projectSlugs, str(r.slug), title, `project-${i + 1}`),
        title,
        year: str(r.year),
        image: optional(r.image),
        video: optional(r.video),
        listen: optional(r.listen),
        lyrics: stringList(r.lyrics),
        credits: stringList(r.credits),
        visual: optional(r.visual),
      };
    })
    .filter((p): p is KydProject => p !== null);

  const showIds = new Set<string>();
  const shows: KydShow[] = (Array.isArray(source.shows) ? source.shows : [])
    .map((raw, i): KydShow | null => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const title = str(r.title);
      const date = str(r.date);
      // A show without a date can't be sorted into upcoming or past.
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      return {
        id: uniqueSlug(showIds, str(r.id), title, `show-${i + 1}`),
        title,
        date,
        city: str(r.city),
        venue: optional(r.venue),
        poster: optional(r.poster),
        tickets: optional(r.tickets),
        info: optional(r.info),
        archive: optional(r.archive),
      };
    })
    .filter((s): s is KydShow => s !== null);

  const visualIds = new Set<string>();
  const visuals: KydVisual[] = (Array.isArray(source.visuals) ? source.visuals : [])
    .map((raw, i): KydVisual | null => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const title = str(r.title);
      if (!title) return null;
      return {
        id: uniqueSlug(visualIds, str(r.id), title, `visual-${i + 1}`),
        title,
        year: str(r.year),
        image: optional(r.image),
        url: optional(r.url),
      };
    })
    .filter((v): v is KydVisual => v !== null);

  const bookingRaw = (source.booking ?? {}) as Record<string, unknown>;
  const booking: KydBooking = {
    services: stringList(bookingRaw.services),
    contacts: (Array.isArray(bookingRaw.contacts) ? bookingRaw.contacts : [])
      .map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        return { label: str(r.label), email: str(r.email) };
      })
      .filter((c) => c.label && c.email),
    links: (Array.isArray(bookingRaw.links) ? bookingRaw.links : [])
      .map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        return { label: str(r.label), href: str(r.href) };
      })
      .filter((l) => l.label && l.href),
    photo: optional(bookingRaw.photo),
  };

  return { projects, shows, visuals, booking };
}

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") {
      console.error("[kyd] could not create the data directory:", error);
    }
  }
}

async function persist() {
  if (dbEnabled) {
    try {
      await dbQuery(
        `INSERT INTO site_content (id, data, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [CONTENT_ID, JSON.stringify(content)],
      );
    } catch (error) {
      logDbError("kyd:persist", error);
    }
    return;
  }
  ensureDataDir();
  try {
    fs.writeFileSync(KYD_FILE, JSON.stringify(content, null, 2), "utf8");
  } catch (error) {
    console.error("[kyd] could not write content:", error);
  }
}

export async function loadKydContent() {
  if (dbEnabled) {
    try {
      const rows = await dbQuery("SELECT data FROM site_content WHERE id = $1 LIMIT 1", [CONTENT_ID]);
      if (rows.rows[0]?.data) {
        content = sanitizeContent(rows.rows[0].data);
        loaded = true;
        return;
      }
    } catch (error) {
      logDbError("kyd:load", error);
    }
    // Nothing stored yet — seed with what the site already shipped.
    content = clone(DEFAULT_CONTENT);
    loaded = true;
    await persist();
    return;
  }

  try {
    if (fs.existsSync(KYD_FILE)) {
      const raw = fs.readFileSync(KYD_FILE, "utf8");
      if (raw.trim()) {
        content = sanitizeContent(JSON.parse(raw));
        loaded = true;
        return;
      }
    }
  } catch (error) {
    console.error("[kyd] could not read content, using defaults:", error);
  }
  content = clone(DEFAULT_CONTENT);
  loaded = true;
  await persist();
}

export function getKydContent(): KydContent {
  return clone(content);
}

/** Replace the whole document. Partial input keeps the sections left out. */
export async function saveKydContent(input: unknown): Promise<KydContent> {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const merged = {
    projects: source.projects ?? content.projects,
    shows: source.shows ?? content.shows,
    visuals: source.visuals ?? content.visuals,
    booking: source.booking ?? content.booking,
  };
  content = sanitizeContent(merged);
  await persist();
  return getKydContent();
}

export function kydContentLoaded() {
  return loaded;
}
