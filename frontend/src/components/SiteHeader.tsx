import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import "../site.css";

export type NavItem = { label: string; to: string; end?: boolean };

// Primary nav — identical on every page so you always know where you are.
export const PRIMARY_NAV: NavItem[] = [
  { label: "Shop", to: "/shop" },
  { label: "Events", to: "/events" },
  { label: "KYD", to: "/kyd" },
];

// KYD's section strip, shown under the header while inside /kyd.
export const KYD_NAV: NavItem[] = [
  { label: "Music", to: "/kyd", end: true },
  { label: "Live", to: "/kyd/live" },
  { label: "Visuals", to: "/kyd/visuals" },
  { label: "Info", to: "/kyd/info" },
];

type Props = {
  /** Small muted text next to the brand (the shop shows the collection name). */
  subtitle?: string;
  cartCount?: number;
  /** Shop passes this to open its bag sheet; other pages link into the shop. */
  onCartClick?: () => void;
  /** Extra controls after the cart (shop: live status + account). */
  extra?: ReactNode;
  /** Optional second row: a section strip with an optional crumb, e.g. KYD / Ember. */
  subnav?: { label: string; labelTo: string; crumb?: string; items: NavItem[] };
};

const SiteHeader = forwardRef<HTMLElement, Props>(function SiteHeader(
  { subtitle, cartCount = 0, onCartClick, extra, subnav },
  ref,
) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const cartLabel = `Cart (${cartCount})`;
  const cart = onCartClick ? (
    <button type="button" className="nav-cart" onClick={onCartClick}>
      {cartLabel}
    </button>
  ) : (
    <Link className="nav-cart" to="/shop?cart=open">
      {cartLabel}
    </Link>
  );

  const link = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
    >
      {item.label}
    </NavLink>
  );

  return (
    <header ref={ref} className="header">
      <div className="container header-row">
        <div className="brand">
          <Link className="brand-logo" to="/" aria-label="No Connection — home">
            <img src="/nc-logo.png" alt="No Connection" />
          </Link>
          {subtitle && <span className="collection">{subtitle}</span>}
        </div>

        <nav className="nav-primary" aria-label="Primary">
          {PRIMARY_NAV.map(link)}
        </nav>

        <div className="header-right">
          {cart}
          {extra}
          <button
            type="button"
            className="nav-burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>

      {subnav && (
        <div className="container subnav">
          <div className="subnav__label">
            <Link to={subnav.labelTo}>{subnav.label}</Link>
            {subnav.crumb && (
              <>
                <span className="subnav__slash">/</span>
                <span>{subnav.crumb}</span>
              </>
            )}
          </div>
          <nav className="subnav__items" aria-label={`${subnav.label} sections`}>
            {subnav.items.map(link)}
          </nav>
        </div>
      )}

      {open && (
        <div className="nav-menu" role="dialog" aria-label="Menu">
          <nav>
            {PRIMARY_NAV.map(link)}
            <NavLink to="/kyd/info" className="nav-link">
              Booking
            </NavLink>
          </nav>
        </div>
      )}
    </header>
  );
});

export default SiteHeader;
