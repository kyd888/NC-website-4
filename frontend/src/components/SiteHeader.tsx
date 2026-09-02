import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

export type NavItem = { label: string; to: string; end?: boolean };

type Props = {
  /** Text shown top-left. Links to `brandTo`. */
  brand: string;
  brandTo?: string;
  /** Optional trailing crumb, e.g. "EMBER" → "KYD / EMBER". */
  crumb?: string;
  nav: NavItem[];
  /** Right side. Defaults to a CART (n) link into the shop. */
  right?: ReactNode;
  cartCount?: number;
  onCartClick?: () => void;
};

// Items shown in the mobile menu — the three doors of the site.
const MENU: NavItem[] = [
  { label: "NO CONNECTION", to: "/shop" },
  { label: "KYD", to: "/kyd" },
  { label: "EVENTS", to: "/events" },
  { label: "BOOKING", to: "/kyd/info" },
];

export default function SiteHeader({ brand, brandTo = "/", crumb, nav, right, cartCount = 0, onCartClick }: Props) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the menu on navigation.
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

  const cart = onCartClick ? (
    <button type="button" className="nc-header__cart" onClick={onCartClick}>
      CART ({cartCount})
    </button>
  ) : (
    <Link className="nc-header__cart" to="/shop?cart=open">
      CART ({cartCount})
    </Link>
  );

  return (
    <header className="nc-header">
      <div className="nc-header__row">
        <div className="nc-header__brand">
          <Link to={brandTo}>{brand}</Link>
          {crumb && (
            <>
              <span className="nc-header__slash">/</span>
              <span>{crumb}</span>
            </>
          )}
        </div>

        <nav className="nc-header__nav" aria-label="Section">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nc-header__link${isActive ? " is-active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="nc-header__right">
          {right ?? cart}
          <button
            type="button"
            className="nc-header__burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* Mobile: section nav sits on its own line under the brand row. */}
      <nav className="nc-header__subnav" aria-label="Section (mobile)">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nc-header__link${isActive ? " is-active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
        <span className="nc-header__subnav-cart">{right ?? cart}</span>
      </nav>

      {open && (
        <div className="nc-menu" role="dialog" aria-label="Site menu">
          <ul>
            {MENU.map((item) => (
              <li key={item.to}>
                <Link to={item.to}>{item.label}</Link>
              </li>
            ))}
          </ul>
          <span className="nc-menu__arrow" aria-hidden="true">
            ↓
          </span>
        </div>
      )}
    </header>
  );
}
