import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import SiteShell from "../../components/SiteShell";
import Tile from "../../components/Tile";
import { projects } from "../../data/site";

type Panel = "listen" | "lyrics" | "credits" | "visual";

const TABS: { key: Panel; label: string }[] = [
  { key: "listen", label: "Listen" },
  { key: "lyrics", label: "Lyrics" },
  { key: "credits", label: "Credits" },
  { key: "visual", label: "Visual" },
];

/**
 * Single project page. Title, one large image/video, four pills, a year.
 * Each pill opens a small panel under the media — no separate pages.
 */
export default function KydProject() {
  const { slug } = useParams();
  const project = projects.find((p) => p.slug === slug);
  const [panel, setPanel] = useState<Panel | null>(null);

  if (!project) {
    return (
      <SiteShell section="kyd">
        <div className="empty">
          <p>Not found.</p>
          <Link to="/kyd" className="pill-btn">
            Back to music
          </Link>
        </div>
      </SiteShell>
    );
  }

  const isVideoFile = project.video?.match(/\.(mp4|webm|mov)(\?|$)/i);

  const panelBody = () => {
    switch (panel) {
      case "listen":
        return project.listen ? (
          <a className="pill-btn is-dark" href={project.listen} target="_blank" rel="noreferrer">
            Open
          </a>
        ) : (
          <span className="muted">Not released yet.</span>
        );
      case "lyrics":
        return project.lyrics && project.lyrics.length > 0 ? project.lyrics.join("\n") : <span className="muted">—</span>;
      case "credits":
        return project.credits && project.credits.length > 0 ? (
          <ul>
            {project.credits.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : (
          <span className="muted">—</span>
        );
      case "visual":
        return project.visual ? (
          <a className="pill-btn is-dark" href={project.visual} target="_blank" rel="noreferrer">
            Watch
          </a>
        ) : (
          <span className="muted">—</span>
        );
      default:
        return null;
    }
  };

  return (
    <SiteShell section="kyd" crumb={project.title}>
      <div className="project">
        <div className="project__head">
          <h1 className="page-title">{project.title}</h1>
          <span className="label">{project.year}</span>
        </div>

        <div className="project__media">
          {project.video ? (
            isVideoFile ? (
              <video src={project.video} controls playsInline preload="metadata" />
            ) : (
              <iframe src={project.video} title={project.title} allow="autoplay; fullscreen" allowFullScreen />
            )
          ) : (
            <>
              <Tile image={project.image} alt={project.title} ratio="16 / 9" seed={project.slug} />
              <div className="project__play" aria-hidden="true">
                <span>▶</span>
              </div>
            </>
          )}
        </div>

        <div className="project__tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`pill-btn${panel === t.key ? " is-on" : ""}`}
              aria-expanded={panel === t.key}
              onClick={() => setPanel((cur) => (cur === t.key ? null : t.key))}
            >
              {t.label}
            </button>
          ))}
        </div>

        {panel && <div className="project__panel">{panelBody()}</div>}
      </div>
    </SiteShell>
  );
}
