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
];

export const shows: Show[] = [
  {
    id: "wheeler-summer-concert-series-2026",
    title: "WHEELER SUMMER CONCERT SERIES",
    date: "2026-09-18",
    city: "OKLAHOMA CITY, OK",
    venue: "WHEELER FERRIS WHEEL",
    poster: "/kyd/wheeler-ferris-wheel.jpg",
    info: "https://www.instagram.com/p/DY2k5GSo0aJ/",
  },
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
];

// No Connection events. Same shape as shows so the two lists render the same
// way. Empty until there is a real date to announce — the page says so rather
// than showing placeholders that read as a real schedule.
export const events: Show[] = [];

export const visuals: Visual[] = [
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
];

// The no-connection.com inboxes, in one place so an address is never typed twice.
// Anything not referenced yet is here so it can be dropped in without guessing.
export const emails = {
  /** Main artist inbox. */
  kyd: "kyd@no-connection.com",
  /** Shows, festivals, support slots, private events. */
  booking: "booking@no-connection.com",
  /** Interviews, media, press requests. */
  press: "press@no-connection.com",
  /** NO CONNECTION events — venue and artist inquiries. */
  events: "events@no-connection.com",
  /** Store and customer order issues. Store only. */
  orders: "orders@no-connection.com",
  /** General catch-all. */
  hello: "hello@no-connection.com",
  /** Management and business communication. */
  management: "management@no-connection.com",
} as const;

export const booking = {
  services: ["Live performance", "Festivals", "Support", "Private events", "Creative collaboration"],
  contacts: [
    { label: "Booking", email: emails.booking },
    { label: "Press", email: emails.press },
    { label: "Management", email: emails.management },
  ],
  links: [
    { label: "Artist bio", href: "https://normanmusicfestival.com/artist/kyd/" },
    { label: "Press photos", href: "https://photos.app.goo.gl/wqcHB2B8ieJDj9Fh8" },
    { label: "Music", href: "https://ffm.bio/kyd888" },
  ],
  photo: "/kyd/kyd-press.jpg" as string | undefined,
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
