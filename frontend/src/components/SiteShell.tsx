import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import SiteHeader, { KYD_NAV } from "./SiteHeader";
import { useCartCount } from "../hooks/useCartCount";
import "../site.css";

type Props = {
  section: "nc" | "kyd";
  /** Trailing crumb in the KYD strip, e.g. "Ember". */
  crumb?: string;
  children: ReactNode;
};

/**
 * Page frame for everything outside the shop. Same header as the shop;
 * KYD pages get a section strip underneath it.
 */
export default function SiteShell({ section, crumb, children }: Props) {
  const cartCount = useCartCount();

  return (
    <div className="site">
      <SiteHeader
        cartCount={cartCount}
        account={{ label: "Account", to: "/shop?account=open" }}
        subnav={section === "kyd" ? { label: "KYD", labelTo: "/kyd", crumb, items: KYD_NAV } : undefined}
      />
      <main className="site-main container">{children}</main>
      <footer className="site-footer container">
        <Link to="/">No Connection</Link>
        <nav>
          <Link to="/shop">Shop</Link>
          <Link to="/events">Events</Link>
          <Link to="/kyd">KYD</Link>
          <Link to="/kyd/info">Booking</Link>
        </nav>
        <span>{new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
