import { useEffect, useState } from "react";
import { backendUrl } from "../config";
import {
  projects as fallbackProjects,
  shows as fallbackShows,
  visuals as fallbackVisuals,
  booking as fallbackBooking,
  type Project,
  type Show,
  type Visual,
} from "../data/site";

export type KydContent = {
  projects: Project[];
  shows: Show[];
  visuals: Visual[];
  booking: typeof fallbackBooking;
};

/** What the pages render before the fetch lands, and if it never does. */
const FALLBACK: KydContent = {
  projects: fallbackProjects,
  shows: fallbackShows,
  visuals: fallbackVisuals,
  booking: fallbackBooking,
};

// One fetch per page load, shared by every page that needs it.
let cache: KydContent | null = null;
let inflight: Promise<KydContent> | null = null;

async function load(): Promise<KydContent> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (!backendUrl) throw new Error("no backend configured");
      const res = await fetch(`${backendUrl}/api/kyd`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      cache = {
        projects: Array.isArray(data?.projects) ? data.projects : FALLBACK.projects,
        shows: Array.isArray(data?.shows) ? data.shows : FALLBACK.shows,
        visuals: Array.isArray(data?.visuals) ? data.visuals : FALLBACK.visuals,
        booking: data?.booking && typeof data.booking === "object" ? data.booking : FALLBACK.booking,
      };
      return cache;
    } catch {
      // Backend asleep or unreachable — the pages still render the shipped content.
      cache = FALLBACK;
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useKydContent(): KydContent {
  const [content, setContent] = useState<KydContent>(cache ?? FALLBACK);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setContent(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return content;
}
