import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import "./ArtistLanding.css";

type CampaignPhase = "groves" | "presave" | "tickets" | "listen";

const campaignCtas: Record<
  CampaignPhase,
  {
    label: "ENTER THE GROVES" | "PRESAVE" | "GET TICKETS" | "LISTEN NOW";
    url: string;
  }
> = {
  groves: { label: "ENTER THE GROVES", url: "#archive" },
  presave: { label: "PRESAVE", url: "#music" },
  tickets: { label: "GET TICKETS", url: "#live" },
  listen: { label: "LISTEN NOW", url: "#music" },
};

const artistLandingConfig: {
  phase: CampaignPhase;
} = {
  phase: "groves",
};

const modules = [
  {
    id: "music",
    label: "MUSIC +",
    body: "Fragments from the GROVES cycle, sent in low light and remembered out of order.",
  },
  {
    id: "watch",
    label: "WATCH +",
    body: "Visual transmissions, field recordings, and signal tests will surface here first.",
  },
  {
    id: "live",
    label: "LIVE +",
    body: "No dates are broadcasting yet. Check back when the signal clears.",
  },
  {
    id: "archive",
    label: "ARCHIVE +",
    body: "Recovered notes, image traces, and pieces that did not want to stay buried.",
  },
  {
    id: "contact",
    label: "CONTACT +",
    body: "For booking, press, or transmission requests: kyd@noconnection.local",
  },
];

const artifacts = [
  {
    title: "Burnt Sienna",
    tone: "sienna",
    reveal: "IT WAS REAL FOR ME",
  },
  {
    title: "Ochre",
    tone: "ochre",
    reveal: "ONE HUNDRED MORE MILES",
  },
  {
    title: "Deep Green",
    tone: "green",
    reveal: "CALL WHEN YOU'RE HOME SAFE",
  },
];

export default function ArtistLanding() {
  const reducedMotion = useReducedMotion();
  const [openModule, setOpenModule] = useState<string | null>("music");
  const [openArtifact, setOpenArtifact] = useState<string | null>(null);
  const [reveal, setReveal] = useState({ x: 50, y: 50, active: false });

  const cta = campaignCtas[artistLandingConfig.phase];

  const pageStyle = useMemo(
    () =>
      ({
        "--kyd-reveal-x": `${reveal.x}%`,
        "--kyd-reveal-y": `${reveal.y}%`,
        "--kyd-reveal-opacity": reveal.active ? 1 : 0,
      }) as React.CSSProperties,
    [reveal],
  );

  function updateReveal(clientX: number, clientY: number, target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return;
    const root = target.closest(".artist-page");
    if (!(root instanceof HTMLElement)) return;
    const rect = root.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    setReveal({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
      active: true,
    });
  }

  return (
    <main
      className="artist-page"
      style={pageStyle}
      onPointerMove={(event) => updateReveal(event.clientX, event.clientY, event.target)}
      onPointerLeave={() => setReveal((current) => ({ ...current, active: false }))}
      onPointerDown={(event) => updateReveal(event.clientX, event.clientY, event.target)}
    >
      <div className="artist-visual" aria-hidden="true">
        <div className="artist-visual__base" />
        <div className="artist-visual__clear" />
        <div className="artist-visual__grain" />
      </div>

      <section className="artist-hero" aria-labelledby="artist-title">
        <motion.div
          className="artist-hero__copy"
          initial={reducedMotion ? false : { opacity: 0, y: 18 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <p className="artist-kicker">A NO CONNECTION TRANSMISSION</p>
          <h1 id="artist-title">KYD</h1>
          <p className="artist-statement">MUSIC REMEMBERED WRONG.</p>
          <a className="artist-cta" href={cta.url} data-phase={artistLandingConfig.phase}>
            {cta.label}
          </a>
        </motion.div>

        <div className="artist-signal" aria-label="Signal Glass">
          <span>SIGNAL</span>
          <span>GLASS</span>
        </div>
      </section>

      <section className="artist-overlays" aria-label="Artist transmission modules">
        <div className="artist-modules">
          {modules.map((item) => {
            const isOpen = openModule === item.id;
            return (
              <div className="artist-module" key={item.id} id={item.id}>
                <button
                  type="button"
                  className="artist-module__toggle"
                  aria-expanded={isOpen}
                  aria-controls={`${item.id}-panel`}
                  onClick={() => setOpenModule(isOpen ? null : item.id)}
                  onFocus={() => setReveal((current) => ({ ...current, active: true }))}
                >
                  {item.label}
                </button>
                <motion.div
                  id={`${item.id}-panel`}
                  className="artist-module__panel"
                  initial={false}
                  animate={isOpen ? "open" : "closed"}
                  variants={{
                    open: { height: "auto", opacity: 1 },
                    closed: { height: 0, opacity: 0 },
                  }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.28, ease: "easeOut" }}
                >
                  <p>{item.body}</p>
                </motion.div>
              </div>
            );
          })}
        </div>

        <div className="artist-artifacts" aria-label="GROVES artifacts">
          {artifacts.map((artifact) => {
            const isOpen = openArtifact === artifact.title;
            return (
              <button
                type="button"
                key={artifact.title}
                className={`artist-artifact artist-artifact--${artifact.tone}`}
                aria-pressed={isOpen}
                onClick={() => setOpenArtifact(isOpen ? null : artifact.title)}
              >
                <span>{artifact.title}</span>
                <strong>{isOpen ? artifact.reveal : "OPEN SIGNAL"}</strong>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
