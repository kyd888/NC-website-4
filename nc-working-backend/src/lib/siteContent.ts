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
  revision: number;
  projects: KydProject[];
  shows: KydShow[];
  visuals: KydVisual[];
  booking: KydBooking;
};

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const KYD_FILE = path.join(DATA_DIR, "kyd.json");
const CONTENT_ID = "kyd";
const CURRENT_CONTENT_REVISION = 3;

const WHEELER_POSTER = "/kyd/wheeler-ferris-wheel.jpg";

const WHEELER_SHOW: KydShow = {
  id: "wheeler-summer-concert-series-2026",
  title: "WHEELER SUMMER CONCERT SERIES",
  date: "2026-09-18",
  city: "OKLAHOMA CITY, OK",
  venue: "WHEELER FERRIS WHEEL",
  poster: WHEELER_POSTER,
  info: "https://www.instagram.com/p/DY2k5GSo0aJ/",
};

/** The original demo document, retained only so it can be migrated safely. */
const LEGACY_PLACEHOLDER_CONTENT: KydContent = {
  revision: 0,
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

/** Real KYD content seeded for new installs and the one-time demo migration. */
const DEFAULT_CONTENT: KydContent = {
  revision: CURRENT_CONTENT_REVISION,
  projects: [
    {
      slug: "lost",
      title: "LOST",
      year: "2025",
      image: "/kyd/lost.jpg",
      listen: "https://ffm.to/lost-kyd.bio",
      credits: ["ARTIST: KYD", "FEATURING: J.K. MAC & LOCALÉ", "LABEL: NO CONNECTION RECORDS"],
      visual: "https://www.youtube.com/watch?v=MJLZI696cQQ",
    },
    {
      slug: "haunted",
      title: "HAUNTED",
      year: "2024",
      image: "/kyd/haunted.jpg",
      listen: "https://music.apple.com/us/album/haunted-single/1778169559",
      credits: ["ARTIST: KYD", "LABEL: NO CONNECTION RECORDS"],
      visual: "https://www.youtube.com/watch?v=MJLZI696cQQ",
    },
    {
      slug: "american-nightmare",
      title: "AMERICAN NIGHTMARE",
      year: "2024",
      image: "/kyd/american-nightmare.jpg",
      listen: "https://ffm.to/nmgme1x.bio",
      credits: ["ARTIST: KYD", "FEATURING: MATT MEMS", "LABEL: NO CONNECTION RECORDS"],
    },
    {
      slug: "red",
      title: "RED",
      year: "2024",
      image: "/kyd/red.jpg",
      listen: "https://ffm.to/kyd-red.bio",
      credits: ["ARTISTS: KYD, MATT MEMS", "LABEL: NO CONNECTION RECORDS"],
      visual: "https://www.youtube.com/watch?v=MJLZI696cQQ",
    },
    {
      slug: "wyd",
      title: "WYD",
      year: "2024",
      image: "/kyd/wyd.jpg",
      listen: "https://ffm.to/kydwyd.bio",
      credits: ["ARTIST: KYD", "FEATURING: K3KO", "LABEL: NO CONNECTION RECORDS"],
    },
    {
      slug: "october-4th",
      title: "OCTOBER 4TH",
      year: "2023",
      image: "/kyd/october-4th.jpg",
      video: "https://www.youtube.com/embed/QGWlc8TuaXo",
      listen: "https://music.apple.com/us/album/october-4th-single/1719861079",
      credits: ["ARTIST: KYD", "LABEL: NO CONNECTION RECORDS"],
      visual: "https://www.youtube.com/watch?v=QGWlc8TuaXo",
    },
    {
      slug: "im-going-numb",
      title: "I'M GOING NUMB!",
      year: "2021",
      image: "/kyd/im-going-numb.jpg",
      video: "https://www.youtube.com/embed/aj_Z7Nh7xuU",
      listen: "https://music.apple.com/us/album/im-going-numb-single/1585839518",
      credits: ["ARTIST: KYD", "LABEL: NVRND"],
      visual: "https://www.youtube.com/watch?v=aj_Z7Nh7xuU",
    },
  ],
  shows: [
    WHEELER_SHOW,
    {
      id: "unboxed-2026",
      title: "UNBOXED: THE INAUGURATION FESTIVAL",
      date: "2026-08-29",
      city: "TULSA, OK",
      venue: "PLAZA SANTA CECILIA",
      poster: "/kyd/unboxed-2026.jpg",
      archive:
        "https://www.facebook.com/TulsaGlobal/posts/unboxed-the-inauguration-festival-is-this-saturday-come-celebrate-with-us-at-pla/1418763923688273/",
    },
    {
      id: "norman-music-festival-2026",
      title: "NORMAN MUSIC FESTIVAL",
      date: "2026-04-25",
      city: "NORMAN, OK",
      venue: "GRAY STREET STAGE",
      poster: "/kyd/kyd-press.jpg",
      archive: "https://normanmusicfestival.com/artist/kyd/",
    },
    {
      id: "groves-listening-party-2026",
      title: "GROVES PERFORMANCE & LISTENING PARTY",
      date: "2026-03-21",
      city: "TULSA, OK",
      venue: "CHIMERA BALLROOM",
      poster: "/kyd/groves-live.webp",
      archive:
        "https://thetulsaartsdistrict.org/event/kyd-groves-at-chimera-ballroom-with-micaela-young-and-marlee-vox/",
    },
    {
      id: "tulsa-songwriting-exchange-2026",
      title: "TULSA SONGWRITING EXCHANGE SHOWCASE",
      date: "2026-03-06",
      city: "TULSA, OK",
      venue: "THE CHURCH STUDIO",
      poster: "/kyd/tse-2026.webp",
      archive: "https://www.thechurchstudio.com/tulsa-songwriting-exchange-showcase/",
    },
  ],
  visuals: [
    {
      id: "infrasounds-live",
      title: "INFRASOUNDS (LIVE)",
      year: "2025",
      image: "/kyd/infrasounds-live.jpg",
      url: "https://www.youtube.com/watch?v=Mr3QiT4H_1I",
    },
    {
      id: "red-infrasounds-haunted-lost",
      title: "RED X INFRASOUNDS X HAUNTED X LOST",
      year: "2024",
      image: "/kyd/lost.jpg",
      url: "https://www.youtube.com/watch?v=MJLZI696cQQ",
    },
    {
      id: "october-4th-video",
      title: "OCTOBER 4TH",
      year: "2023",
      image: "/kyd/october-4th.jpg",
      url: "https://www.youtube.com/watch?v=QGWlc8TuaXo",
    },
    {
      id: "im-going-numb-video",
      title: "I'M GOING NUMB!",
      year: "2021",
      image: "/kyd/im-going-numb.jpg",
      url: "https://www.youtube.com/watch?v=aj_Z7Nh7xuU",
    },
  ],
  booking: {
    services: ["Live performance", "Festivals", "Support", "Private events", "Creative collaboration"],
    contacts: [
      { label: "Booking", email: "booking@no-connection.com" },
      { label: "Press", email: "press@no-connection.com" },
      { label: "Management", email: "management@no-connection.com" },
    ],
    links: [
      { label: "Artist bio", href: "https://normanmusicfestival.com/artist/kyd/" },
      { label: "Press photos", href: "https://photos.app.goo.gl/wqcHB2B8ieJDj9Fh8" },
      { label: "Music", href: "https://ffm.bio/kyd888" },
    ],
    photo: "/kyd/kyd-press.jpg",
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
  const revision =
    typeof source.revision === "number" && Number.isInteger(source.revision)
      ? Math.max(0, source.revision)
      : 0;

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

  return { revision, projects, shows, visuals, booking };
}

/** Match the exact shipped demo document so real admin edits are never overwritten. */
function isLegacyPlaceholderContent(value: KydContent): boolean {
  return JSON.stringify(value) === JSON.stringify(sanitizeContent(LEGACY_PLACEHOLDER_CONTENT));
}

/** Apply narrowly scoped content corrections without replacing admin-managed data. */
function migrateKnownContent(value: KydContent): boolean {
  let changed = false;

  if (value.revision < 1) {
    const infrasounds = value.visuals.find((visual) => visual.id === "infrasounds-live");
    if (infrasounds?.image === "/kyd/kyd-press.jpg") {
      infrasounds.image = "/kyd/infrasounds-live.jpg";
    }
    value.revision = 1;
    changed = true;
  }

  if (value.revision < 2) {
    const hasWheelerShow = value.shows.some(
      (show) =>
        show.id === WHEELER_SHOW.id ||
        (show.date === WHEELER_SHOW.date && show.title.toLowerCase().includes("wheeler")),
    );
    if (!hasWheelerShow) value.shows.unshift(clone(WHEELER_SHOW));
    value.revision = 2;
    changed = true;
  }

  if (value.revision < 3) {
    // The Wheeler date shipped without artwork and rendered as a black tile.
    // Only fills a gap: a poster set in the admin is left alone.
    const wheeler = value.shows.find((show) => show.id === WHEELER_SHOW.id);
    if (wheeler && !wheeler.poster) wheeler.poster = WHEELER_POSTER;
    value.revision = CURRENT_CONTENT_REVISION;
    changed = true;
  }

  return changed;
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
        const stored = sanitizeContent(rows.rows[0].data);
        if (isLegacyPlaceholderContent(stored)) {
          content = clone(DEFAULT_CONTENT);
          loaded = true;
          await persist();
          return;
        }
        content = stored;
        loaded = true;
        if (migrateKnownContent(content)) await persist();
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
        const stored = sanitizeContent(JSON.parse(raw));
        if (isLegacyPlaceholderContent(stored)) {
          content = clone(DEFAULT_CONTENT);
          loaded = true;
          await persist();
          return;
        }
        content = stored;
        loaded = true;
        if (migrateKnownContent(content)) await persist();
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
    revision: source.revision ?? content.revision,
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
