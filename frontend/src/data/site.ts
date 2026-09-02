// Content for the non-shop parts of the site (gateway, KYD, events, booking).
// Everything here is plain data so it can be edited without touching components.
// Images are optional — when `image` is missing, a dark placeholder tile is rendered.
// Drop files into frontend/public/kyd/ and reference them as "/kyd/filename.jpg".

export type Project = {
  slug: string;
  title: string;
  year: string;
  image?: string;
  /** Video URL (mp4 or an embeddable page) for the project page. Optional. */
  video?: string;
  listen?: string;
  lyrics?: string[];
  credits?: string[];
  visual?: string;
};

export type Show = {
  id: string;
  title: string;
  /** ISO date (YYYY-MM-DD). Past dates automatically flip TICKETS → ARCHIVE. */
  date: string;
  city: string;
  venue?: string;
  poster?: string;
  tickets?: string;
  info?: string;
  archive?: string;
};

export type Visual = {
  id: string;
  title: string;
  year: string;
  image?: string;
  url?: string;
};

export const projects: Project[] = [
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
];

export const shows: Show[] = [
  { id: "nc-show-001", title: "NC SHOW 001", date: "2026-09-18", city: "CHICAGO, IL" },
  { id: "live-002", title: "LIVE 002", date: "2026-10-04", city: "CHICAGO, IL" },
  { id: "live-003", title: "LIVE 003", date: "2026-11-21", city: "BROOKLYN, NY" },
];

// No Connection events. Same shape as shows so the two lists render the same way.
export const events: Show[] = [
  { id: "NC-006", title: "NC-006", date: "2026-09-18", city: "CHICAGO, IL" },
  { id: "NC-005", title: "NC-005", date: "2026-06-12", city: "CHICAGO, IL" },
  { id: "NC-004", title: "NC-004", date: "2026-04-03", city: "CHICAGO, IL" },
  { id: "NC-003", title: "NC-003", date: "2026-02-14", city: "CHICAGO, IL" },
  { id: "NC-002", title: "NC-002", date: "2025-12-05", city: "CHICAGO, IL" },
  { id: "NC-001", title: "NC-001", date: "2025-10-10", city: "CHICAGO, IL" },
];

export const visuals: Visual[] = [
  { id: "ember-visual", title: "EMBER — VISUAL", year: "2026" },
  { id: "signal-test-01", title: "SIGNAL TEST 01", year: "2026" },
  { id: "infrasounds-live", title: "INFRASOUNDS — LIVE", year: "2026" },
  { id: "no-sleep-poster", title: "NO SLEEP — POSTER", year: "2026" },
];

export const booking = {
  services: ["Live performance", "Festivals", "Support", "Private events", "Creative collaboration"],
  contacts: [
    { label: "Booking", email: "booking@kyd.world" },
    { label: "Press", email: "press@kyd.world" },
    { label: "Management", email: "management@kyd.world" },
  ],
  links: [
    { label: "EPK", href: "#" },
    { label: "Press photos", href: "#" },
    { label: "Music", href: "/kyd" },
  ],
  photo: undefined as string | undefined,
};

// ---- helpers ----

export function isPast(isoDate: string, now = new Date()): boolean {
  const d = new Date(`${isoDate}T23:59:59`);
  return d.getTime() < now.getTime();
}

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

/** "2026-09-18" → "SEPTEMBER 18 2026" */
export function formatShowDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${MONTHS[m - 1]} ${d} ${y}`;
}

/** "2026-09-18" → "09.18.26" */
export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${m}.${d}.${y.slice(2)}`;
}
