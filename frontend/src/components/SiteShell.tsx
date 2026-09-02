import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import SiteHeader, { type NavItem } from "./SiteHeader";
import { useCartCount } from "../hooks/useCartCount";
import "../site.css";

export const NC_NAV: NavItem[] = [
  { label: "SHOP", to: "/shop" },
  { label: "EVENTS", to: "/events" },
  { label: "KYD", to: "/kyd" },
];

export const KYD_NAV: NavItem[] = [
  { label: "MUSIC", to: "/kyd", end: true },
  { label: "LIVE", to: "/kyd/live" },
  { label: "VISUALS", to: "/kyd/visuals" },
  { label: "INFO", to: "/kyd/info" },
];

type Props = {
  section: "nc" | "kyd";
  crumb?: string;
  children: ReactNode;
};

/**
 * Page frame for everything outside the shop: header, content, and a one-line
 * footer with the three doors of the site. Keeps every page on the same grid.
 */
export default function SiteShell({ section, crumb, children }: Props) {
  const cartCount = useCartCount();
  const isKyd = section === "kyd";

  return (
    <div className="nc-site">
      <SiteHeader
        brand={isKyd ? "KYD" : "NO CONNECTION"}
        brandTo={isKyd ? "/kyd" : "/"}
        crumb={crumb}
        nav={isKyd ? KYD_NAV : NC_NAV}
        cartCount={cartCount}
      />
      <main className="nc-main">{children}</main>
      <footer className="nc-footer">
        <Link to="/">NO CONNECTION</Link>
        <span className="nc-footer__links">
          <Link to="/shop">SHOP</Link>
          <Link to="/events">EVENTS</Link>
          <Link to="/kyd">KYD</Link>
          <Link to="/kyd/info">BOOKING</Link>
        </span>
        <span className="nc-footer__year">{new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
