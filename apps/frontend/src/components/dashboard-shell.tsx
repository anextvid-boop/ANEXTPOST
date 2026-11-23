"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useT, type MessageKey } from "@/lib/i18n";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsBell } from "./notifications-bell";
import { BrandConnectionsMenu } from "./brand-connections-menu";
import { PublishingPauseBanner, usePublishingState } from "./publishing-pause";
import styles from "./dashboard-shell.module.css";

interface NavItem {
  href: string;
  labelKey: MessageKey;
  icon: ReactNode;
  /** Minimum role required. Default: everyone. */
  minRole?: "ADMIN" | "SUPERADMIN";
  /** Only shown when the org has agency mode enabled (Settings → Organization). */
  agencyModeOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/media",
    labelKey: "nav.media",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect
          x="2.5"
          y="3.5"
          width="11"
          height="9"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="6" cy="6.5" r="1" fill="currentColor" />
        <path
          d="M3 11.5 6.5 8.5l3 3 1.7-1.5 1.8 1.7"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/copywriting",
    labelKey: "nav.copywriting",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M3.5 3.5h9M3.5 7h6.5M3.5 10.5h4.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M11.25 8.75 13.5 11l-3.25 3.25H8v-2.25l3.25-3.25Z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/builder",
    labelKey: "nav.builder",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect
          x="2.5"
          y="2.5"
          width="11"
          height="3.25"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <rect
          x="2.5"
          y="7"
          width="11"
          height="3.25"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M2.5 12.75h7"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/visualizer",
    labelKey: "nav.visualizer",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect
          x="2.25"
          y="3.25"
          width="11.5"
          height="9.5"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5 7h2.5M8.5 7H11M5 9.75h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/calendar",
    labelKey: "nav.calendar",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect
          x="2.75"
          y="3.75"
          width="10.5"
          height="9.5"
          rx="1.75"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M2.75 6.5h10.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5 2.5v2M11 2.5v2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/posts",
    labelKey: "nav.posts",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect
          x="2.5"
          y="2.5"
          width="11"
          height="11"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5 6h6M5 8.5h6M5 11h4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/analytics",
    labelKey: "nav.analytics",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M3 12V8M7 12V4M11 12V9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M2.5 13.25h11"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/approval",
    labelKey: "nav.approval",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M3.5 8.5l2.5 2.5 6-6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/agents",
    labelKey: "nav.agents",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M1.75 8h2.5l1.75-4.5 3 9 1.75-4.5h3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/agency",
    labelKey: "nav.agency",
    agencyModeOnly: true,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M3 12.5V7.5M8 12.5V3.5M13 12.5V5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M2 12.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/settings",
    labelKey: "nav.settings",
    minRole: "ADMIN",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M19.43 12.98a7.7 7.7 0 0 0 .07-.98 7.7 7.7 0 0 0-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.32 7.32 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.49.42l-.38 2.65a7.5 7.5 0 0 0-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65A7.83 7.83 0 0 0 4.5 12c0 .33.03.66.07.98L2.46 14.63a.5.5 0 0 0-.12.64l2 3.46c.14.24.42.34.66.25l2.49-1c.51.39 1.07.71 1.69.98l.38 2.65c.04.24.25.42.49.42h4c.24 0 .45-.18.49-.42l.38-2.65a7.5 7.5 0 0 0 1.69-.98l2.49 1c.24.09.52-.01.66-.25l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/billing",
    labelKey: "nav.billing",
    minRole: "SUPERADMIN",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect
          x="2"
          y="3.5"
          width="12"
          height="9"
          rx="1.75"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M2 6.5h12"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M4.5 10h3"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

const STORAGE_KEY = "postsider:sidebar-collapsed";
const PRIMARY_NAV_HREFS = ["/media", "/copywriting", "/builder", "/visualizer", "/posts", "/calendar"] as const;

const ROLE_LEVEL: Record<string, number> = {
  USER: 0,
  ADMIN: 1,
  SUPERADMIN: 2,
};

function ChevronDown({ open = false }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      width="12"
      height="12"
      style={{
        transform: open ? "rotate(180deg)" : undefined,
        transition: "transform 150ms var(--ease)",
        flexShrink: 0,
      }}
    >
      <path
        d="M4 6.25 8 10.25 12 6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronCollapse({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden width="14" height="14">
      <path
        d={collapsed ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const t = useT();
  const myLevel = ROLE_LEVEL[user?.role ?? "USER"] ?? 0;
  const [collapsed, setCollapsed] = useState(false);
  // Mobile off-canvas drawer (opened from the hamburger in the topbar).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Desktop topbar dropdowns.
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.agencyModeOnly && !user?.agencyMode) return false;
    if (!item.minRole) return true;
    return myLevel >= (ROLE_LEVEL[item.minRole] ?? 0);
  });

  const primaryNavItems = PRIMARY_NAV_HREFS.map((href) =>
    visibleNavItems.find((item) => item.href === href),
  ).filter((item): item is NavItem => Boolean(item));

  const moreNavItems = visibleNavItems.filter(
    (item) => !PRIMARY_NAV_HREFS.includes(item.href as (typeof PRIMARY_NAV_HREFS)[number]),
  );

  const isRouteActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");
  const isMoreActive = moreNavItems.some((item) => isRouteActive(item.href));

  // Emergency Pause (kill switch) — live state for the dashboard-wide banner.
  const {
    state: publishingState,
    refresh: refreshPublishingState,
  } = usePublishingState();

  // Restore collapsed state from localStorage on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {}
  }, []);

  // Close the drawer and desktop dropdowns on navigation.
  useEffect(() => {
    setMobileNavOpen(false);
    setMoreOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  // Close More / Account dropdowns on outside click or Escape.
  useEffect(() => {
    if (!moreOpen && !accountOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const activeEl = document.activeElement;
        if (moreOpen && moreRef.current?.contains(activeEl)) {
          moreButtonRef.current?.focus();
        } else if (accountOpen && accountRef.current?.contains(activeEl)) {
          accountButtonRef.current?.focus();
        }
        setMoreOpen(false);
        setAccountOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreOpen && moreRef.current && !moreRef.current.contains(target)) {
        setMoreOpen(false);
      }
      if (accountOpen && accountRef.current && !accountRef.current.contains(target)) {
        setAccountOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [moreOpen, accountOpen]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileNavOpen) return;
    drawerCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileNavOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  const closeMobileNav = () => {
    setMobileNavOpen(false);
    menuButtonRef.current?.focus();
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  // The open drawer always shows the full sidebar; on desktop the drawer is
  // never open, so this matches the stored collapsed state exactly.
  const isCollapsed = collapsed && !mobileNavOpen;

  const accountDisplayName = user?.name || user?.email?.split("@")[0] || "AN";
  const accountInitials = accountDisplayName.slice(0, 2).toUpperCase();

  return (
    <div
      className={
        styles.shell + (pathname === "/calendar" ? " " + styles.shellCalendar : "")
      }
    >
      {/* Desktop (>= 901px) single 56px top navigation bar */}
      <header className={styles.desktopTopbar}>
        <div className={styles.desktopNavLeft}>
          <BrandConnectionsMenu />
          <span className={styles.brandDivider} aria-hidden />
          <nav aria-label="Primary" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {primaryNavItems.map((item) => {
              const active = isRouteActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    styles.topNavLink + (active ? " " + styles.topNavLinkActive : "")
                  }
                >
                  <span
                    aria-hidden
                    className={styles.topNavIcon}
                  >
                    {item.icon}
                  </span>
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}

            {moreNavItems.length > 0 && (
              <div ref={moreRef} className={styles.menuWrap}>
                <button
                  ref={moreButtonRef}
                  type="button"
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setAccountOpen(false);
                    setMoreOpen((v) => !v);
                  }}
                  className={
                    styles.topNavLink +
                    (isMoreActive ? " " + styles.topNavMoreActive : "")
                  }
                >
                  <span>More</span>
                  <ChevronDown open={moreOpen} />
                </button>
                {moreOpen && (
                  <div className={styles.menuDropdown} role="menu">
                    {moreNavItems.map((item) => {
                      const active = isRouteActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMoreOpen(false)}
                          className={
                            styles.menuItem + (active ? " " + styles.menuItemActive : "")
                          }
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 15,
                              height: 15,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {item.icon}
                          </span>
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>

        <div className={styles.desktopNavRight}>
          <OrgSwitcher placement="bottom" />
          <NotificationsBell compact className="anext-btn-icon" />
          <LanguageSwitcher compact selectClassName="anext-select" />
          <ThemeToggle compact className="anext-btn-icon" />
          {user && (
            <div ref={accountRef} className={styles.menuWrap}>
              <button
                ref={accountButtonRef}
                type="button"
                aria-label={accountDisplayName}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setMoreOpen(false);
                  setAccountOpen((v) => !v);
                }}
                className={"anext-btn-secondary " + styles.accountButton}
              >
                <span>{accountInitials}</span>
                <ChevronDown open={accountOpen} />
              </button>
              {accountOpen && (
                <div
                  className={styles.menuDropdown + " " + styles.menuDropdownRight}
                  role="menu"
                >
                  <div
                    style={{
                      padding: "8px 10px 10px",
                      borderBottom: "1px solid var(--line-soft)",
                      marginBottom: 4,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                      {accountDisplayName}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {user.email}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      logout();
                    }}
                    className={styles.menuItem}
                  >
                    <span>{t("nav.signOut")}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.menuButton}
          ref={menuButtonRef}
          onClick={() => setMobileNavOpen(true)}
          aria-label={t("calendar.openMenu")}
          aria-expanded={mobileNavOpen}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden width="18" height="18">
            <path
              d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span className={styles.topbarBrand}>
          <BrandConnectionsMenu />
        </span>
        {/* The sidebar copy lives in a drawer on mobile, so the bell needs its
            own always-visible spot here. */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* theme-toggle-topbar: same 44x44 box as the bell beside it. */}
          <ThemeToggle compact className="theme-toggle-topbar" />
          <NotificationsBell compact />
        </div>
      </header>

      {mobileNavOpen && (
        <div
          className={styles.backdrop}
          onClick={closeMobileNav}
          aria-hidden
        />
      )}

      <aside
        className={
          styles.sidebar +
          (isCollapsed ? " " + styles.sidebarCollapsed : "") +
          (mobileNavOpen ? " " + styles.sidebarOpen : "")
        }
        role={mobileNavOpen ? "dialog" : undefined}
        aria-modal={mobileNavOpen ? "true" : undefined}
        aria-label={mobileNavOpen ? t("calendar.openMenu") : undefined}
      >
        {mobileNavOpen && (
          <button
            type="button"
            className={styles.mobileCloseButton}
            ref={drawerCloseRef}
            onClick={closeMobileNav}
            aria-label={t("calendar.closeMenu")}
          >
            ×
          </button>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "space-between",
            gap: 8,
            padding: isCollapsed ? 0 : "0 6px",
          }}
        >
          <BrandConnectionsMenu
            label={isCollapsed ? "AP" : "ANEXTPOST"}
            fontSize={isCollapsed ? "15px" : "20px"}
          />
          <button
            type="button"
            className="touch-target"
            onClick={toggleCollapsed}
            aria-label={
              isCollapsed ? t("calendar.expand") : t("calendar.collapse")
            }
            style={{
              width: 28,
              height: 28,
              padding: 0,
              borderRadius: 999,
              border: "none",
              background: "transparent",
              color: "var(--fg)",
              display: isCollapsed ? "none" : "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition:
                "background 140ms var(--ease), transform 120ms var(--ease)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgb(var(--tint) / 0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <ChevronCollapse collapsed={isCollapsed} />
          </button>
        </div>

        {isCollapsed && (
          <button
            type="button"
            className="touch-target"
            onClick={toggleCollapsed}
            aria-label={t("calendar.expand")}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              borderRadius: 999,
              border: "none",
              background: "transparent",
              color: "var(--fg)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              alignSelf: "center",
              marginTop: -8,
              transition:
                "background 140ms var(--ease), transform 120ms var(--ease)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgb(var(--tint) / 0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <ChevronCollapse collapsed={isCollapsed} />
          </button>
        )}

        <nav>
          <ul style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {NAV_ITEMS.filter((item) => {
              if (item.agencyModeOnly && !user?.agencyMode) return false;
              if (!item.minRole) return true;
              return myLevel >= (ROLE_LEVEL[item.minRole] ?? 0);
            }).map((item) => {
              const isActive =
                pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    title={isCollapsed ? t(item.labelKey) : undefined}
                    className={
                      styles.navLink +
                      (isActive ? " " + styles.navLinkActive : "")
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: isCollapsed ? 0 : "12px",
                      justifyContent: isCollapsed ? "center" : "flex-start",
                      padding: isCollapsed ? "10px 0" : "10px 14px",
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </span>
                    {!isCollapsed && <span>{t(item.labelKey)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {!isCollapsed && (
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            <NotificationsBell />
            <OrgSwitcher />
            {/* Language and theme share one row: two small preferences that
                read as a pair, and the sidebar footer has no height to spare. */}
            {/* gap 0: the language switcher already carries 10px of its own
                padding on that side, which is the spacing we want. */}
            <div className="lang-theme-row" style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <LanguageSwitcher />
              <ThemeToggle compact />
            </div>
            {user && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  padding: "10px 10px",
                  borderTop: "1px solid var(--line-soft)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                  {user.name || user.email.split("@")[0]}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {user.email}
                </span>
                <button
                  type="button"
                  className="touch-target"
                  onClick={() => logout()}
                  style={{
                    marginTop: 6,
                    alignSelf: "flex-start",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    color: "var(--muted)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {t("nav.signOut")}
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      <main
        className={
          styles.main + (pathname === "/calendar" ? " " + styles.mainCalendar : "")
        }
      >
        <PublishingPauseBanner
          state={publishingState}
          refresh={refreshPublishingState}
          canManage={user?.role === "SUPERADMIN"}
        />
        {user?.onTrial &&
          user.trialDaysLeft !== null &&
          !pathname?.startsWith("/billing") && (
            <TrialBanner daysLeft={user.trialDaysLeft} />
          )}
        {children}
      </main>
    </div>
  );
}

/** Logo when the org has one, initials otherwise — shared by the trigger and the dropdown list. */
function OrgAvatar({
  name,
  logo,
  size,
  invert,
}: {
  name: string;
  logo?: string | null;
  size: number;
  invert: boolean;
}) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: size >= 28 ? 8 : 6,
          objectFit: "cover",
          flexShrink: 0,
          display: "block",
        }}
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size >= 28 ? 8 : 6,
        background: invert ? "var(--fg)" : "rgb(var(--tint) / 0.1)",
        color: invert ? "var(--bg)" : "var(--fg)",
        display: "grid",
        placeItems: "center",
        fontSize: size >= 28 ? 11 : 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Org switcher — shown in the desktop topbar and mobile drawer footer. */
function OrgSwitcher({ placement = "top" }: { placement?: "top" | "bottom" }) {
  const { user, switchOrg, createOrg } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newProjectType, setNewProjectType] = useState("youtube");
  const [newBrandHandle, setNewBrandHandle] = useState("");
  const [newBrandWebsite, setNewBrandWebsite] = useState("");
  const [newBrandEmail, setNewBrandEmail] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const orgs = user?.organizations || [];
  const currentOrgId = user?.orgId;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Always reachable — even with a single org, "+ New organization" must
  // have somewhere to live. Was hidden entirely below 2 orgs, which meant
  // an agency starting with one client had no way to add a second.
  if (orgs.length === 0) return null;

  const submitCreate = async () => {
    const name = newOrgName.trim();
    if (!name || createBusy) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      await createOrg({
        name,
        projectType: newProjectType,
        brandHandle: newBrandHandle.trim() || undefined,
        brandWebsite: newBrandWebsite.trim() || undefined,
        brandEmail: newBrandEmail.trim() || undefined,
      });
      // createOrg reloads the page on success (same as switchOrg) — no need
      // to reset local state, but guard anyway in case that ever changes.
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : t("orgSwitcher.createError"));
      setCreateBusy(false);
    }
  };

  const currentOrg = orgs.find((o) => o.id === currentOrgId);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={placement === "bottom" ? "anext-btn-secondary" : undefined}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          width: placement === "bottom" ? "auto" : "100%",
          maxWidth: placement === "bottom" ? 140 : undefined,
          display: "flex",
          alignItems: "center",
          gap: placement === "bottom" ? 8 : 10,
          padding: placement === "bottom" ? "0 10px" : "8px 10px",
          borderRadius: placement === "bottom" ? undefined : "var(--radius-md)",
          border: placement === "bottom" ? undefined : "1px solid var(--line-soft)",
          background: placement === "bottom" ? undefined : "var(--bg)",
          color: "var(--fg)",
          cursor: "pointer",
          fontSize: 13,
          textAlign: "left",
        }}
      >
        <OrgAvatar name={currentOrg?.name || "?"} logo={currentOrg?.logo} size={placement === "bottom" ? 20 : 28} invert />
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentOrg?.name || "?"}
        </span>
        <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0 }}>▼</span>
      </button>

      {open && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            ...(placement === "bottom"
              ? { top: "calc(100% + 6px)", right: 0, minWidth: 250 }
              : { bottom: "100%", left: 0, right: 0, margin: "0 0 4px 0" }),
            padding: 4,
            listStyle: "none",
            background: "var(--bg)",
            border: "1px solid var(--line-soft)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 8px 24px rgb(var(--shadow) / calc(0.12 * var(--shadow-boost)))",
            zIndex: 70,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {orgs.map((org) => {
            const isCurrent = org.id === currentOrgId;
            return (
              <li key={org.id} role="option" aria-selected={isCurrent}>
                <button
                  type="button"
                  className={
                    styles.menuItem + (isCurrent ? " " + styles.menuItemActive : "")
                  }
                  onClick={() => {
                    if (!isCurrent) switchOrg(org.id);
                    setOpen(false);
                  }}
                  style={{
                    cursor: isCurrent ? "default" : "pointer",
                  }}
                >
                  <OrgAvatar name={org.name} logo={org.logo} size={24} invert={isCurrent} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {org.name}
                  </span>
                  {isCurrent && <span style={{ fontSize: 12 }}>✓</span>}
                  <span style={{ fontSize: 10, opacity: 0.5 }}>
                    {org.role === "SUPERADMIN" ? "Admin" : org.role === "ADMIN" ? "Admin" : "Member"}
                  </span>
                </button>
              </li>
            );
          })}

          <li style={{ borderTop: "1px solid var(--line-soft)", marginTop: 2, paddingTop: 4 }}>
            {creating ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 6px" }}>
                <input
                  autoFocus
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void submitCreate(); }}
                  placeholder={t("orgSwitcher.namePlaceholder")}
                  style={{
                    padding: "6px 8px", borderRadius: 6,
                    border: "1px solid var(--line-soft)",
                    background: "var(--bg)", color: "var(--fg)", fontSize: 13,
                  }}
                />
                <select
                  value={newProjectType}
                  onChange={(e) => setNewProjectType(e.target.value)}
                  aria-label="Project type"
                  style={{
                    padding: "6px 8px", borderRadius: 6,
                    border: "1px solid var(--line-soft)",
                    background: "var(--bg)", color: "var(--fg)", fontSize: 12.5,
                  }}
                >
                  <option value="youtube">YouTube Channel</option>
                  <option value="app">App / SaaS</option>
                  <option value="creator">Creator / Brand</option>
                  <option value="blank">Blank / Custom</option>
                </select>
                <input
                  type="text"
                  value={newBrandHandle}
                  onChange={(e) => setNewBrandHandle(e.target.value)}
                  placeholder="Handle (optional, e.g. @mychannel)"
                  style={{
                    padding: "6px 8px", borderRadius: 6,
                    border: "1px solid var(--line-soft)",
                    background: "var(--bg)", color: "var(--fg)", fontSize: 12.5,
                  }}
                />
                <input
                  type="url"
                  value={newBrandWebsite}
                  onChange={(e) => setNewBrandWebsite(e.target.value)}
                  placeholder="Website (optional, https://...)"
                  style={{
                    padding: "6px 8px", borderRadius: 6,
                    border: "1px solid var(--line-soft)",
                    background: "var(--bg)", color: "var(--fg)", fontSize: 12.5,
                  }}
                />
                <input
                  type="email"
                  value={newBrandEmail}
                  onChange={(e) => setNewBrandEmail(e.target.value)}
                  placeholder="Contact email (optional)"
                  style={{
                    padding: "6px 8px", borderRadius: 6,
                    border: "1px solid var(--line-soft)",
                    background: "var(--bg)", color: "var(--fg)", fontSize: 12.5,
                  }}
                />
                <span style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.4 }}>
                  {t("orgSwitcher.newOrgHint")}
                </span>
                {createError && (
                  <span style={{ fontSize: 11, color: "var(--danger-bright)" }}>{createError}</span>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    disabled={createBusy || !newOrgName.trim()}
                    onClick={() => void submitCreate()}
                    style={{
                      flex: 1, padding: "6px 8px", borderRadius: 6, border: "none",
                      background: "var(--fg)", color: "var(--bg)", fontSize: 12,
                      fontWeight: 600, cursor: "pointer",
                      opacity: createBusy || !newOrgName.trim() ? 0.5 : 1,
                    }}
                  >
                    {createBusy ? t("orgSwitcher.creating") : t("orgSwitcher.create")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setNewOrgName(""); setCreateError(null); }}
                    style={{
                      padding: "6px 8px", borderRadius: 6,
                      border: "1px solid var(--line-soft)", background: "var(--bg)",
                      color: "var(--fg)", fontSize: 12, cursor: "pointer",
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => setCreating(true)}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: 6,
                  border: "1px dashed var(--line-soft)",
                  display: "grid", placeItems: "center", fontSize: 13, flexShrink: 0,
                }}>
                  +
                </span>
                {t("orgSwitcher.newOrg")}
              </button>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}

function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const t = useT();
  const urgent = daysLeft <= 2;
  const label =
    daysLeft <= 0
      ? t("trial.endsToday")
      : daysLeft === 1
        ? t("trial.oneDayLeft")
        : t("trial.daysLeft", { days: daysLeft });

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: "var(--radius-md)",
        marginBottom: 24,
        background: urgent ? "var(--warning-soft)" : "rgb(var(--tint) / 0.04)",
        border: urgent
          ? "1px solid color-mix(in srgb, var(--warning) 38%, transparent)"
          : "1px solid var(--line-soft)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          background: urgent ? "var(--warning-bright)" : "var(--fg)",
          color: "var(--on-fg)",
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M8 5v3l2 1.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {/* flex-basis 220px: on a phone the CTA wraps under the text instead
          of squeezing it into a five-line column beside the button. */}
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: urgent ? "var(--warning)" : "var(--fg)" }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {t("trial.cta")}
        </div>
      </div>
      <Link
        href="/billing"
        style={{
          height: 34,
          padding: "0 16px",
          borderRadius: 999,
          background: "var(--fg)",
          color: "var(--bg)",
          fontSize: 13,
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {t("trial.chooseAPlan")}
      </Link>
    </div>
  );
}
