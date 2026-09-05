import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation } from "react-router-dom";
import "../site.css";

export type NavItem = { label: string; to: string; end?: boolean };

// Primary nav — identical on every page so you always know where you are.
export const PRIMARY_NAV: NavItem[] = [
  { label: "Shop", to: "/shop" },
  { label: "Events", to: "/events" },
  { label: "KYD", to: "/kyd" },
];

// Everything the full menu lists, in order.
const MENU_NAV: NavItem[] = [...PRIMARY_NAV, { label: "Booking", to: "/kyd/info" }];

// KYD's section strip, shown under the header while inside /kyd.
export const KYD_NAV: NavItem[] = [
  { label: "Music", to: "/kyd", end: true },
  { label: "Live", to: "/kyd/live" },
  { label: "Visuals", to: "/kyd/visuals" },
  { label: "Info", to: "/kyd/info" },
];

/** Account entry in the menu: either opens something in place or links somewhere. */
export type AccountEntry = { label: string; to?: string; onSelect?: () => void };

type Props = {
  /** Small muted text next to the brand (the shop shows the collection name). */
  subtitle?: string;
  cartCount?: number;
  /** Shop passes this to open its bag sheet; other pages link into the shop. */
  onCartClick?: () => void;
  /** Extra controls after the cart (shop: live status). */
  extra?: ReactNode;
  /** Account / sign-in, listed at the foot of the menu. */
  account?: AccountEntry;
  /** Optional second row: a section strip with an optional crumb, e.g. KYD / Ember. */
  subnav?: { label: string; labelTo: string; crumb?: string; items: NavItem[] };
};

const SiteHeader = forwardRef<HTMLElement, Props>(function SiteHeader(
  { subtitle, cartCount = 0, onCartClick, extra, account, subnav },
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cartLabel = `Cart (${cartCount})`;
  const cartControl = (className: string, before?: () => void) =>
    onCartClick ? (
      <button
        type="button"
        className={className}
        onClick={() => {
          before?.();
          onCartClick();
        }}
      >
        {cartLabel}
      </button>
    ) : (
      <Link className={className} to="/shop?cart=open">
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

  const burger = (
    <button
      type="button"
      className={`nav-burger${open ? " is-open" : ""}`}
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
    >
      <span />
      <span />
    </button>
  );

  const accountControl =
    account &&
    (account.to ? (
      <Link to={account.to}>{account.label}</Link>
    ) : (
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          account.onSelect?.();
        }}
      >
        {account.label}
      </button>
    ));

  return (
    <header ref={ref} className="header">
      <div className="container header-row">
        <div className="brand">
          <Link className="brand-logo" to="/" aria-label="No Connection — home">
            <img src="/nc-star.png" alt="No Connection" />
          </Link>
          {subtitle && <span className="collection">{subtitle}</span>}
        </div>

        <nav className="nav-primary" aria-label="Primary">
          {PRIMARY_NAV.map(link)}
        </nav>

        <div className="header-right">
          {cartControl("nav-cart")}
          {extra}
          {burger}
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

      {/* The header carries a backdrop-filter, which traps fixed children in its
          stacking context — so the menu is portalled to the body instead. */}
      {open &&
        createPortal(
          <div className="nav-menu" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="nav-menu__top">
              <Link className="brand-logo" to="/" aria-label="No Connection — home">
                <img src="/nc-star.png" alt="No Connection" />
              </Link>
              {burger}
            </div>

            <nav className="nav-menu__links" aria-label="Menu">
              {MENU_NAV.map((item, i) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? "is-active" : undefined)}
                >
                  <span className="nav-menu__index">{String(i + 1).padStart(2, "0")}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="nav-menu__foot">
              {accountControl ?? <span />}
              {cartControl("", () => setOpen(false))}
            </div>
          </div>,
          document.body,
        )}
    </header>
  );
});

export default SiteHeader;
