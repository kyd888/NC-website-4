import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import SiteShell from "../../components/SiteShell";
import Tile from "../../components/Tile";
import { projects } from "../../data/site";

type Panel = "listen" | "lyrics" | "credits" | "visual" | null;

/**
 * Single project page. Title, one large image/video, four plain words, a year.
 * Each word toggles a small panel under the media — no separate pages.
 */
export default function KydProject() {
  const { slug } = useParams();
  const project = projects.find((p) => p.slug === slug);
  const [panel, setPanel] = useState<Panel>(null);

  if (!project) {
    return (
      <SiteShell section="kyd">
        <div className="nc-empty">
          <p>NOT FOUND.</p>
          <p>
            <Link to="/kyd" className="nc-link">
              BACK
            </Link>
          </p>
        </div>
      </SiteShell>
    );
  }

  const toggle = (next: Panel) => setPanel((cur) => (cur === next ? null : next));
  const isVideoFile = project.video?.match(/\.(mp4|webm|mov)(\?|$)/i);

  const items: { key: Panel; label: string }[] = [
    { key: "listen", label: "LISTEN" },
    { key: "lyrics", label: "LYRICS" },
    { key: "credits", label: "CREDITS" },
    { key: "visual", label: "VISUAL" },
  ];

  return (
    <SiteShell section="kyd" crumb={project.title}>
      <div className="nc-project">
        <aside className="nc-project__side">
          <ul>
            {items.map((it) => (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => toggle(it.key)}
                  aria-expanded={panel === it.key}
                  style={{ opacity: panel && panel !== it.key ? 0.45 : 1 }}
                >
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
          <span className="nc-muted">{project.year}</span>
        </aside>

        <div>
          {project.video ? (
            <div className="nc-project__media">
              {isVideoFile ? (
                <video src={project.video} controls playsInline preload="metadata" />
              ) : (
                <iframe src={project.video} title={project.title} allow="autoplay; fullscreen" allowFullScreen />
              )}
            </div>
          ) : (
            <div className="nc-project__media">
              <Tile image={project.image} alt={project.title} ratio="16 / 9" seed={project.slug} />
              <span className="nc-project__play" aria-hidden="true">
                ▶
              </span>
            </div>
          )}

          {panel === "listen" && (
            <div className="nc-project__body">
              {project.listen ? (
                <a className="nc-link" href={project.listen} target="_blank" rel="noreferrer">
                  OPEN
                </a>
              ) : (
                <span className="nc-muted">NOT RELEASED.</span>
              )}
            </div>
          )}
          {panel === "lyrics" && (
            <div className="nc-project__body">
              {project.lyrics && project.lyrics.length > 0 ? (
                project.lyrics.join("\n")
              ) : (
                <span className="nc-muted">—</span>
              )}
            </div>
          )}
          {panel === "credits" && (
            <div className="nc-project__body">
              {project.credits && project.credits.length > 0 ? (
                project.credits.map((c) => <span key={c}>{c}</span>)
              ) : (
                <span className="nc-muted">—</span>
              )}
            </div>
          )}
          {panel === "visual" && (
            <div className="nc-project__body">
              {project.visual ? (
                <a className="nc-link" href={project.visual} target="_blank" rel="noreferrer">
                  WATCH
                </a>
              ) : (
                <span className="nc-muted">—</span>
              )}
            </div>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
