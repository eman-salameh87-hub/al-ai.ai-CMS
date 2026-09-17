// app/(site)/[locale]/layout.tsx
// ROOT layout for the public site. There is deliberately no app/layout.tsx:
// with a single root layout, `dir`/`lang` were pinned to Arabic for every
// locale. Route groups each owning a root layout is the supported way to vary
// the <html> element. (Navigating between the site and the admin group causes a
// full document load, which is fine — they are separate applications.)
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Script from 'next/script';
import { Anton, Cairo, Inter, Poppins } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { Navbar } from '@/components/site/navbar';
import { AnnouncementBar } from '@/components/site/announcement-bar';
import { themePairToCss, themeModeAttr, hasDark, type ThemeMode } from '@/lib/theme/slots';
import { THEME_COOKIE, effectiveMode } from '@/lib/theme/visitor-mode';
import { needsSetup } from '@/lib/setup/status';
import { Footer } from '@/components/site/footer';
import { getNavigation, getSettings } from '@/lib/db/queries';
import { TrackingScripts, TrackingNoScript } from '@/components/site/tracking-scripts';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/session';
import { env, locales, type Locale } from '@/lib/env';
import { buildMetadata } from '@/lib/seo/metadata';
import { SiteSchema } from '@/components/site/site-schema';
import { WhatsAppButton } from '@/components/site/whatsapp-button';
import '../../globals.css';

/*
 * The typefaces al-ai.ai uses (see al-ai.ai-pages/assets/css/theme-black.css
 * --tt-body-font / --tt-alter-font): Big Shoulders Display for headings,
 * Poppins for Latin body copy. Cairo still carries Arabic, which neither of
 * the other two covers.
 *
 * Weights are pinned rather than left to the default. `next/font` fetches
 * every available weight when none is named.
 */
// "Big Shoulders Display" isn't in next/font/google's bundled font list
// under Turbopack (build error: "Unknown font") — Anton is the closest
// always-supported stand-in: ultra-bold, condensed, same headline role.
const anton = Anton({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-display',
  display: 'swap',
});
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});
const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });
// Kept: the admin shell and any component still naming font-inter resolve
// through this variable, and dropping it would leave those with no family.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Site name comes from settings, never a hardcoded brand string.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const settings = await getSettings();
  const siteName = settings?.siteName ?? 'CMS';
  const typed = (locales.includes(locale as Locale) ? locale : env.DEFAULT_LOCALE) as Locale;

  const base = buildMetadata({
    locale: typed,
    path: '',
    title: siteName,
    description: settings?.siteDescription,
    siteName,
    image: settings?.logo,
    icon: settings?.favicon,
  });

  return {
    ...base,
    /**
     * metadataBase makes every relative URL — here and in every page that
     * inherits from this layout — resolve against the real origin. Without it
     * Next emits a relative og:image, which no scraper follows.
     */
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
    /**
     * Overrides the plain string buildMetadata returns: a child page that sets
     * its own title gets "Page · Site", and one that sets none gets the site
     * name on its own.
     */
    title: { default: siteName, template: `%s · ${siteName}` },
  };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale as Locale)) {
    notFound();
  }
  const typedLocale = locale as Locale;

  // Required for next-intl static rendering; without it every page opts into
  // dynamic rendering.
  setRequestLocale(typedLocale);

  const [messages, headerNav, footerNav, settings, headerList] = await Promise.all([
    getMessages(),
    getNavigation('header', typedLocale),
    getNavigation('footer', typedLocale),
    getSettings(),
    headers(),
  ]);

  /*
   * Coming-soon gate.
   *
   * This lives in the layout, not middleware: the flag is a database value and
   * middleware runs on the Edge with no DB access. Signed-in staff bypass it so
   * the site can be reviewed before launch.
   */
  let staffPreview = false;
  if (settings?.comingSoonMode) {
    const token = (await cookies()).get('access_token')?.value;
    if (token) {
      try {
        await verifyAccessToken(token);
        staffPreview = true;
      } catch {
        staffPreview = false;
      }
    }
  }
  /*
   * redirect(), not a conditional render.
   *
   * Rendering the holding page instead of {children} keeps it out of the DOM,
   * but `children` has already been computed — the real content still ships
   * inside the RSC flight payload, visible in view-source. A redirect sends no
   * body at all.
   */
  /**
   * A fresh deploy sends its PUBLIC url to the wizard too.
   *
   * The alternative is a storefront with no name, no navigation and no
   * products, which reads as a broken site rather than an unfinished one. This
   * adds no exposure: /api/setup is open during exactly this window whether or
   * not the page is shown, and it closes the moment an administrator exists.
   */
  if (await needsSetup()) redirect('/setup');

  if (settings?.comingSoonMode && !staffPreview) {
    redirect('/coming-soon');
  }

  const dir = typedLocale === 'ar' ? 'rtl' : 'ltr';
  const nonce = headerList.get('x-nonce') ?? undefined;

  /**
   * Light and dark for the saved skin, plus the attribute that decides which.
   *
   * The stylesheet is the same whatever the mode; only the stamp changes. On
   * 'auto' nothing is stamped, which is what lets the prefers-color-scheme
   * block win — stamping "auto" would match no selector and pin everyone to
   * light.
   */
  const themeCss = themePairToCss(settings?.theme ?? null, settings?.themeDark ?? null);
  /*
   * The visitor's own choice wins over the site's default. Read on the SERVER
   * so the right variant is in the first painted frame — the whole reason this
   * is a cookie and not localStorage.
   */
  const darkAvailable = hasDark(settings?.themeDark ?? null);
  const themeAttr = themeModeAttr(
    effectiveMode(
      darkAvailable ? (await cookies()).get(THEME_COOKIE)?.value : null,
      (settings?.themeMode as ThemeMode | null) ?? 'light'
    )
  );


  return (
    <html
      lang={typedLocale}
      dir={dir}
      data-theme={themeAttr}
      className={`${anton.variable} ${poppins.variable} ${cairo.variable} ${inter.variable} h-full`}
    >
      <head>
        {/* theme-black.css sets every tt-, pgi- and pcli- prefixed heading
            to font-family: var(--tt-alter-font), which resolves to "Big
            Shoulders Display" (see that file's :root block) — a face
            next/font/google can't bundle under Turbopack ("Unknown font"),
            so it's loaded the same way index.html loads it: a direct
            Google Fonts <link>, not next/font. Poppins is loaded here too
            (var(--tt-body-font)) for the same reason — next/font's Poppins
            is registered under a generated local name, not the literal
            family name theme-black.css's var(--tt-body-font) resolves to,
            so it wouldn't be picked up by that rule either. Without this,
            every literal-markup title silently fell back to the browser's
            default sans-serif instead of the source's condensed display
            face (middleware.ts's CSP style-src/font-src must allow
            fonts.googleapis.com/fonts.gstatic.com or this is blocked).

            Big Shoulders Display specifically uses `display=block`, not
            `swap`: this is the only font in the app that's a live
            cross-origin fetch instead of a next/font self-hosted file, so
            it's the only one racing the rest of page load over the
            network. `.tt-haci-title`'s ancestor chain
            (.tt-horizontal-accordion.tt-anim-fadeinup /
            .tt-sticky-testimonials) gets promoted to a GPU-composited
            layer by GSAP almost immediately on load; with `display=swap`,
            if that layer's first paint lands before this font's network
            fetch resolves, Chromium rasterizes it once with the
            `sans-serif` fallback and — confirmed live: getComputedStyle,
            document.fonts.check() and a canvas fillText() all reported/
            painted the correct font, while the actual composited element
            kept showing the fallback glyphs indefinitely — never
            repaints that specific layer once the real font swaps in
            globally. `display=block` makes the browser render the text
            invisible (rather than in the fallback) for up to ~3s until
            the font is ready, so no fallback glyph bitmap is ever baked
            into that layer to begin with. See the scrolltrigger-resync
            Script below for a second-line defense in case the fetch is
            slower than that 3s block window. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@100..900&display=block"
          rel="stylesheet"
        />

        {/* al-ai.ai-pages' own stylesheets, loaded exactly as index.html
            loads them (same files, same order) — helper.css and
            theme-black.css both target the original tt-, pgi- and pcli-
            prefixed class names, so components that render those classes
            pick up this CSS directly rather than a Tailwind re-approximation. */}
        <link rel="stylesheet" href="/al-ai-pages/assets/vendor/fontawesome/css/all.min.css" />
        <link rel="stylesheet" href="/al-ai-pages/assets/vendor/fancybox/css/fancybox.css" />
        <link rel="stylesheet" href="/al-ai-pages/assets/vendor/swiper/css/swiper-bundle.min.css" />
        <link rel="stylesheet" href="/al-ai-pages/assets/css/helper.css" />
        <link rel="stylesheet" href="/al-ai-pages/assets/css/theme-black.css" />
      </head>
      {/* id="body" + the four tt-* classes are load-bearing, not cosmetic:
          theme.js gates entire features on `$("body").hasClass(...)` —
          most importantly `tt-smooth-scroll`, which is what turns Lenis on
          at all (see theme.js's `new Lenis(...)` call). Without it Lenis
          never initializes, GSAP ScrollTrigger never gets synced to it via
          `lenis.on('scroll', ScrollTrigger.update)`, and every pinned
          section (the "Empower growth with AI" sticky cards, the
          horizontal accordion, the scroll-driven reveals) free-runs off
          native scroll instead and visibly desyncs — pinned elements can
          end up positioned off the wrong scroll offset entirely. `tt-noise`
          and `tt-magic-cursor` are theme-black.css hooks (the grain
          overlay, `cursor: none` + the custom cursor below); `tt-transition`
          is the page-load/page-transition state class. */}
      <body id="body" className="site-body min-h-full antialiased tt-transition tt-noise tt-magic-cursor tt-smooth-scroll">
        {/* GTM requires its noscript iframe first inside <body>. */}
        <TrackingNoScript gtmId={settings?.gtmId} />
        {/* theme.js moves this dot to the pointer and scales it on hover
            over `.tt-magnetic-item`s — inert markup until then, matching
            index.html's placement (first thing inside the body-inner
            wrapper, before the header). */}
        <div id="magic-cursor">
          <div id="ball" />
        </div>
        <NextIntlClientProvider messages={messages} locale={typedLocale}>
          <div id="body-inner" className="min-h-screen flex flex-col">
            {staffPreview && (
                <p className="bg-[var(--site-accent)] px-4 py-2 text-center text-sm font-medium text-[var(--site-accent-ink)]">
                  {typedLocale === 'ar'
                    ? 'وضع «قريباً» مفعّل — أنت ترى الموقع لأنك مسجّل الدخول. الزوار يرون صفحة الانتظار.'
                    : 'Coming-soon mode is on. You can see the site because you are signed in; visitors get the holding page.'}
                </p>
              )}
            {/* Organization + WebSite, once per page, built from Settings. This
                is what lets an answer engine treat the name, the site and the
                social profiles as one entity rather than unrelated pages. */}
            <SiteSchema locale={typedLocale} />

            {/* Above the navbar and outside its sticky container, so it
                scrolls away instead of costing a second pinned row. */}
            <AnnouncementBar locale={typedLocale} />

            <Navbar
              navigation={headerNav}
              logo={settings?.logo ?? null}
              siteName={settings?.siteName ?? 'CMS'}
              locale={typedLocale}
              commerceOn={Boolean(settings?.eCommerceEnabled)}
              // Nothing to toggle between when the site has no dark colours.
              showThemeToggle={darkAvailable}
            />
            {/* clip, not hidden: `hidden` would make this a scroll container
                and break any position: sticky inside it. This absorbs the few
                pixels a full-bleed block overhangs by, because 100vw counts
                the scrollbar and the visible area does not. */}
            <main className="flex-1 overflow-x-clip">{children}</main>

            {/* A link, not a widget. Renders nothing when no number is set. */}
            <WhatsAppButton locale={typedLocale} />
            <Footer navigation={footerNav} settings={settings} locale={typedLocale} />
          </div>
        </NextIntlClientProvider>

        <TrackingScripts settings={settings} />

        {/*
          The saved theme, before customCss so a hand-written override still
          wins. Values come from themeToCss, which only ever emits known slots
          with hex values — a theme cannot smuggle CSS into the page the way a
          raw stylesheet field could.
        */}
        {themeCss && (
          <style
            nonce={nonce}
            // The nonce exists only on the server: React does not serialise it
            // to the client, so hydration compares nonce="abc…" against "" and
            // reports a mismatch on every page load. Suppressed rather than
            // dropped — without the nonce the CSP blocks the style outright.
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: themeCss }}
          />
        )}

        {settings?.customCss && (
          // Same nonce/hydration story as the theme block above. This one has
          // always had the problem; it simply never fired, because no install
          // in this repo had customCss set.
          <style
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: settings.customCss }}
          />
        )}

        {/* al-ai.ai-pages' own vendor JS + theme.js, same files and load
            order as index.html. `nonce` is required — the CSP's script-src
            uses 'strict-dynamic', which ignores 'self' and blocks any
            <script src> that isn't nonced. `afterInteractive` (Next's
            default) preserves this exact order: each script only starts
            once the ones above it have run.
            NOTE: theme.js selects elements by their original tt-, pgi- and
            pcli- prefixed classes and ids (#tt-header, .tt-main-menu,
            #magic-cursor, etc). Until a component renders those exact classes/ids, its
            related behaviour (magnetic cursor, page transition, isotope
            grid, sticky testimonials, horizontal accordion…) has nothing to
            attach to and no-ops — this wires the scripts in, it doesn't by
            itself change any component's markup. */}
        <Script src="/al-ai-pages/assets/vendor/jquery/jquery.min.js" strategy="afterInteractive" nonce={nonce} />
        <Script src="/al-ai-pages/assets/vendor/gsap/gsap.min.js" strategy="afterInteractive" nonce={nonce} />
        <Script src="/al-ai-pages/assets/vendor/gsap/ScrollToPlugin.min.js" strategy="afterInteractive" nonce={nonce} />
        <Script src="/al-ai-pages/assets/vendor/gsap/ScrollTrigger.min.js" strategy="afterInteractive" nonce={nonce} />
        <Script src="/al-ai-pages/assets/vendor/lenis.min.js" strategy="afterInteractive" nonce={nonce} />
        <Script src="/al-ai-pages/assets/vendor/isotope/imagesloaded.pkgd.min.js" strategy="afterInteractive" nonce={nonce} />
        <Script src="/al-ai-pages/assets/vendor/isotope/isotope.pkgd.min.js" strategy="afterInteractive" nonce={nonce} />
        <Script src="/al-ai-pages/assets/vendor/isotope/packery-mode.pkgd.min.js" strategy="afterInteractive" nonce={nonce} />
        <Script src="/al-ai-pages/assets/vendor/fancybox/js/fancybox.umd.js" strategy="afterInteractive" nonce={nonce} />
        <Script src="/al-ai-pages/assets/vendor/swiper/js/swiper-bundle.min.js" strategy="afterInteractive" nonce={nonce} />
        <Script src="/al-ai-pages/assets/js/theme.js" strategy="afterInteractive" nonce={nonce} />

        {/* theme.js's own ScrollTrigger.create() calls (the "Empower growth
            with AI" pin, every .tt-anim-fadeinup/.tt-text-reveal reveal)
            run as soon as this script tag executes — before several
            `loading="lazy"` images further up the page (sector-grid.tsx's
            portfolio cards, compact-list.tsx's numbered strip) have
            finished loading and pushed the rest of the page down to its
            final height. theme.js only re-measures for ONE specific case
            (`imagesLoaded` on the isotope grid, so that grid's own masonry
            layout is right), not page-wide — so every OTHER ScrollTrigger
            keeps whatever start/end it computed against that shorter,
            pre-image layout. That is what let the pinned "Empower growth"
            column activate while scrolled to "Explore Our Services" —
            confirmed live: ScrollTrigger.getAll() showed every trigger's
            `start` frozen at 0 right after load, then correctly spread
            across the page (matching each section's real position) the
            moment something forced a refresh. A plain `<img>` firing its
            own `load` event doesn't retrigger GSAP the way `imagesLoaded`
            does, so nothing was doing that here. This does only that:
            re-measures once the browser's own `load` event fires (covers
            the lazy images finishing) and once more after the fonts
            loaded via <link> above finish swapping in (covers their
            line-height/metrics changing section heights) — it moves
            nothing and changes no styling, it only re-syncs GSAP's cached
            positions with the page's actual final layout. */}
        {/* Second-line defense for the Big Shoulders Display race described
            in the <head> comment above: once document.fonts.ready actually
            fires, force a repaint of every literal-markup title class that
            resolves to var(--tt-alter-font)/var(--tt-body-font) by
            toggling visibility off/on (a synchronous reflow via
            offsetHeight in between). That invalidates any GPU-composited
            layer that got rasterized with a fallback glyph bitmap before
            the font arrived, so it repaints with whatever font is
            actually loaded by the time this runs — independent of the
            `display=block` fix, which only shrinks the race window rather
            than closing it (a slow/blocked network fetch can still exceed
            the ~3s block period). */}
        <Script id="scrolltrigger-resync" strategy="afterInteractive" nonce={nonce}>
          {`(function () {
            function resync() {
              if (window.ScrollTrigger) { window.ScrollTrigger.refresh(); }
            }
            function repaintAlterFontTitles() {
              document
                .querySelectorAll('.tt-haci-title, .tt-heading-title, .pgi-title, .pcli-title, .tt-heading-subtitle')
                .forEach(function (el) {
                  el.style.visibility = 'hidden';
                  void el.offsetHeight;
                  el.style.visibility = '';
                });
            }
            window.addEventListener('load', function () { setTimeout(resync, 300); });
            if (document.fonts && document.fonts.ready) {
              document.fonts.ready.then(function () {
                repaintAlterFontTitles();
                resync();
              });
            }

            /*
             * theme.js wires up .tt-text-reveal exactly once, on its own
             * script load: it wraps each element's contents in a <span>
             * and only THAT span's ScrollTrigger-driven scrub ever raises
             * theme-black.css's baseline ".tt-text-reveal > span"
             * background-size from 0% (its permanently-transparent,
             * --tt-linear-text-bg-color-only resting state, which is
             * white-at-20%-opacity — the washed-out grey the user reported
             * on /about's round-cta heading, not a colour bug) up toward
             * 100%. That one-time query only catches elements that exist
             * in the DOM at the moment theme.js runs. A page navigated to
             * client-side (Next's <Link>, rather than a hard reload) mounts
             * its content well after that — its .tt-text-reveal elements
             * never get wrapped, so the scrub that would ever reveal them
             * is never created, and they sit at 0% forever regardless of
             * scroll position. This reproduces theme.js's own wrap+scrub
             * for anything it missed: once immediately for whatever's
             * already on the page, then on every later DOM mutation so a
             * client-side navigation to a new page is covered too.
             */
            function alreadyWrapped(el) {
              return !!(el.firstElementChild && el.firstElementChild.tagName === 'SPAN' && el.children.length === 1);
            }
            function revealify(el) {
              if (!el.classList || !el.classList.contains('tt-text-reveal')) return;
              if (el.dataset.ttReveal || alreadyWrapped(el)) return;
              el.dataset.ttReveal = '1';
              var span = document.createElement('span');
              while (el.firstChild) span.appendChild(el.firstChild);
              el.appendChild(span);
              if (window.gsap && window.ScrollTrigger) {
                gsap.timeline({
                  scrollTrigger: {
                    trigger: el,
                    start: 'top 87%',
                    end: function () { return '+=' + 2 * el.offsetHeight; },
                    scrub: 1,
                  },
                }).to(span, { duration: 1, backgroundSize: '200% 100%', ease: 'none' });
              }
            }
            function revealifyTree(root) {
              if (root.nodeType !== 1) return;
              revealify(root);
              if (root.querySelectorAll) {
                root.querySelectorAll('.tt-text-reveal').forEach(revealify);
              }
            }
            revealifyTree(document.body);
            if ('MutationObserver' in window) {
              new MutationObserver(function (mutations) {
                mutations.forEach(function (m) {
                  m.addedNodes.forEach(revealifyTree);
                });
              }).observe(document.body, { childList: true, subtree: true });
            }
          })();`}
        </Script>
      </body>
    </html>
  );
}
