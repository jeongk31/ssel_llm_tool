"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The top navigation, arranged as a desktop-style menu bar: a few short master
 * labels, each opening a list of destinations underneath.
 *
 * CAT has more pages than fit comfortably as one flat row of tabs, and most of
 * them are read once. Grouping keeps Coding — the page people actually work in —
 * as the only always-visible destination, and keeps the bar short enough to stay
 * thin.
 */

type MenuItem = { label: string; href: string; hint?: string };
type MenuGroup = { label: string; items: MenuItem[] };

export const MENU_GROUPS: MenuGroup[] = [
  {
    label: "Learn",
    items: [
      { label: "Learn CAT", href: "/learn-cat", hint: "Guided walkthrough of the workflow" },
      { label: "Documentation", href: "/documentation", hint: "The full methodological paper" },
    ],
  },
  {
    label: "Project",
    items: [
      { label: "Usage Statistics", href: "/usage", hint: "How much the tool is being used" },
      { label: "Acknowledgements", href: "/acknowledgements", hint: "People who shaped CAT" },
      { label: "Release History", href: "/versions", hint: "What shipped, and when" },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Contact Us", href: "/contact", hint: "Questions, bugs, and requests" },
      { label: "Privacy Notice", href: "/privacy", hint: "What CAT records, and why" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MenuBar({ pathname }: { pathname: string }) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpenLabel(null), []);

  // Close on an outside click or Escape, the way a real menu bar behaves.
  useEffect(() => {
    if (!openLabel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openLabel, close]);

  // Route changes come from clicking an item, so the menu should not linger.
  useEffect(() => { close(); }, [pathname, close]);

  return (
    <div className="topbar-menu" ref={barRef}>
      <Link
        href="/coding"
        className={`topbar-tab ${isActive(pathname, "/coding") ? "active" : ""}`}
      >
        Coding
      </Link>
      {MENU_GROUPS.map((group) => {
        const open = openLabel === group.label;
        const groupActive = group.items.some((item) => isActive(pathname, item.href));
        return (
          <div className="topbar-menu-group" key={group.label}>
            <button
              type="button"
              className={`topbar-tab topbar-menu-btn ${groupActive ? "active" : ""} ${open ? "open" : ""}`}
              aria-expanded={open}
              aria-haspopup="true"
              onClick={() => setOpenLabel(open ? null : group.label)}
              // Once one menu is open, sliding across the bar switches menus.
              onPointerEnter={() => { if (openLabel) setOpenLabel(group.label); }}
            >
              {group.label}
              <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            {open && (
              <div className="topbar-dropdown" role="menu">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className={`topbar-dropdown-item ${isActive(pathname, item.href) ? "active" : ""}`}
                    onClick={close}
                  >
                    <span className="topbar-dropdown-label">{item.label}</span>
                    {item.hint && <span className="topbar-dropdown-hint">{item.hint}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
