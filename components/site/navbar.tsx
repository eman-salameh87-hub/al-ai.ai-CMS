// components/site/navbar.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages/index.html's <header
// id="tt-header">, not a Tailwind re-approximation — same element ids and
// tt-*/pgi-*/pcli-* class names theme-black.css and theme.js already target
// (see app/(site)/[locale]/layout.tsx, which loads those files as-is). That
// is what lets theme.js's own jQuery bindings (mobile menu open/close,
// magnetic-cursor hover, submenu behaviour) attach for free — no React state
// duplicates what theme.js already does.
//
// Content stays admin-editable: `navigation` and `logo`/`siteName` still come
// from the CMS (getNavigation / settings), only the markup they render into
// changed. A top-level item with children (only "Services" today) renders
// index.html's Services dropdown (.tt-submenu-wrap / .tt-submenu-list).
//
// Two source-template features aren't reproduced here because the source
// has no equivalent and dropping them would break the bilingual CMS: an
// EN/AR locale switch (kept, unobtrusive) and search/wishlist/account icons
// (dropped — this is a content site with eCommerce off, so they're pure
// noise; commerceOn is threaded through in case a future al-ai.ai variant
// turns the shop back on).
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Shape returned by getNavigation(). `parentId` set means this item is a
 *  Services-style submenu child, not a top-level link. */
export interface NavItem {
  id: string;
  label: string;
  url: string;
  openInNew: boolean | null;
  parentId?: string | null;
}

/** External domain the source's own badge links to (index.html: .tt-btn2
 *  anchor) — carried over exactly per the reference file, not a guess. */
const PARTNER_BADGE_URL = 'https://newaeonjo-001-site3.dtempurl.com/';

interface NavbarProps {
  navigation: NavItem[];
  logo?: string | null;
  /** From settings — never a hardcoded brand string. */
  siteName: string;
  locale: 'ar' | 'en';
  /** Whether the shop is switched on; unused today (see file header) but
   *  kept so a future al-ai.ai variant with commerce on doesn't need a
   *  signature change here too. */
  commerceOn?: boolean;
  /** No source equivalent (the design has no theme toggle); accepted and
   *  unused so the layout's call site doesn't need touching too. */
  showThemeToggle?: boolean;
}

export function Navbar({ navigation, logo, siteName, locale }: NavbarProps) {
  const pathname = usePathname();

  // Nav URLs stored in the DB are locale-agnostic ("/about"); prefix them so
  // links do not escape the current locale.
  const localized = (url: string) =>
    /^https?:\/\//i.test(url) ? url : `/${locale}${url.startsWith('/') ? url : `/${url}`}`;

  const topLevel = navigation.filter((item) => !item.parentId);

  return (
    // tt-header-filled: the source's permanently-solid header variant (as
    // opposed to tt-header-alter's default transparent-over-hero state) —
    // matches index.html exactly, which uses both classes together.
    <header id="tt-header" className="tt-header-alter tt-header-filled">
      <div className="tt-header-inner tt-noise">
        <div className="tt-header-col tt-header-col-left">
          <div className="tt-logo">
            <Link href={`/${locale}`} className="tt-magnetic-item" data-test-id="navbar-home">
              {logo ? (
                <>
                  <Image src={logo} alt={siteName} width={160} height={40} priority className="tt-logo-light" />
                  <Image src={logo} alt={siteName} width={160} height={40} priority className="tt-logo-dark" />
                </>
              ) : (
                // No logo saved yet in settings — index.html has no text
                // fallback (it's always an image), so this is a plain
                // legible stand-in rather than an attempt to fake the mark.
                // Plain Tailwind, not a tt-* class: there's no source rule
                // for this state to hook into.
                <span className="text-xl font-bold text-site-ink-inverted">{siteName}</span>
              )}
            </Link>
          </div>
        </div>

        <div className="tt-header-col tt-header-col-center">
          <nav className="tt-main-menu tt-m-menu-center">
            <div className="tt-main-menu-holder">
              <div className="tt-main-menu-inner">
                <div className="tt-main-menu-content">
                  <ul className="tt-main-menu-list">
                    {topLevel.map((item) => {
                      const href = localized(item.url);
                      const active = pathname === href;
                      const children = navigation.filter((child) => child.parentId === item.id);

                      if (children.length === 0) {
                        return (
                          <li key={item.id} className={active ? 'active' : undefined}>
                            <Link
                              href={href}
                              target={item.openInNew ? '_blank' : undefined}
                              rel={item.openInNew ? 'noopener noreferrer' : undefined}
                              aria-current={active ? 'page' : undefined}
                              data-test-id={`navbar-link-${item.id}`}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      }

                      return (
                        <li
                          key={item.id}
                          className={cn('tt-submenu-wrap tt-submenu-master', active && 'active')}
                        >
                          <div className="tt-submenu-trigger">
                            <Link href={href} data-test-id={`navbar-link-${item.id}`}>
                              {item.label}
                            </Link>
                          </div>
                          <div className="tt-submenu">
                            <ul className="tt-submenu-list">
                              {children.map((child) => (
                                <li key={child.id}>
                                  <Link href={localized(child.url)} data-test-id={`navbar-sublink-${child.id}`}>
                                    {child.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          </nav>
        </div>

        <div className="tt-header-col tt-header-col-right">
          {/* Pure markup — theme.js binds the open/close click handler and
              GSAP animation to #tt-m-menu-toggle-btn-wrap itself, so no
              React state duplicates that here (see the file header note). */}
          <div id="tt-m-menu-toggle-btn-wrap">
            <div className="tt-m-menu-toggle-btn-text">
              <span className="tt-m-menu-text-menu">{locale === 'ar' ? 'القائمة' : 'Menu'}</span>
              <span className="tt-m-menu-text-close">{locale === 'ar' ? 'إغلاق' : 'Close'}</span>
            </div>
            <div className="tt-m-menu-toggle-btn-holder">
              <a href="#" className="tt-m-menu-toggle-btn" data-test-id="navbar-menu-toggle">
                <span></span>
              </a>
            </div>
          </div>

          {/* The header-corner partner badge, matching the reference
              index.html exactly — same external target, same image, same
              pill styling. `.tt-btn2`'s actual rules (border-radius: 50px,
              padding, inline-flex, etc.) live in index.html's own inline
              <style> block, not in theme-black.css, so they're reproduced
              here as an inline style rather than a class that doesn't
              exist in the loaded stylesheet. */}
          <a
            href={PARTNER_BADGE_URL}
            className="tt-btn2 tt-btn-secondary tt-magnetic-item"
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              backgroundColor: '#fff',
              padding: '3px 15px',
              textTransform: 'uppercase',
              textAlign: 'center',
              fontSize: '15px',
              fontWeight: 500,
              overflow: 'hidden',
              cursor: 'pointer',
              letterSpacing: '0.5px',
              border: 'none',
              borderRadius: '50px',
              zIndex: 9,
            }}
          >
            <Image
              src="/al-ai-pages/revacity.png"
              alt="Revacity"
              width={100}
              height={24}
              style={{ width: '100px', maxWidth: 'fit-content' }}
            />
          </a>
        </div>
      </div>
    </header>
  );
}
