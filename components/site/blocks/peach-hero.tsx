// components/site/blocks/peach-hero.tsx
//
// Reproduces the al-ai.ai source hero exactly (al-ai.ai-pages/index.html,
// #page-header): a full-viewport interactive iframe (the site's own
// PeachWorlds embed) with a caption overlay and a "scroll to explore"
// circular indicator on top.
//
// This is registered as a `custom` block (lib/blocks/custom-registry.tsx,
// name "peach-hero") rather than a new typed ContentBlock, because its only
// real content is a URL — there's no structured field set worth adding to
// the shared block union for one page's hero. The iframe's own content
// (the rotating slide captions like "Data-Driven AI Solution") is rendered
// BY that third-party embed; this component does not and cannot control it.
//
// NOTE the src is a PeachWorlds preview subdomain
// (severe-fncjenao.peachworlds.com) copied from the client's own static
// template. Those preview links can be regenerated/expired by PeachWorlds
// at any time — if the hero goes blank, get a fresh embed URL from the
// client's PeachWorlds account rather than assuming the block is broken.
//
// middleware.ts's CSP frame-src must allow *.peachworlds.com or this iframe
// is silently blocked by the browser (not a whitelisted embed host by
// default — see the frame-src line there).
import { FULL_BLEED } from '@/lib/blocks/layout';

interface PeachHeroProps {
  src?: string;
}

export function PeachHero({ src = 'https://severe-fncjenao.peachworlds.com/' }: PeachHeroProps) {
  return (
    <div className={`relative h-screen w-screen overflow-hidden bg-site-surface-inverted ${FULL_BLEED}`}>
      <iframe
        src={src}
        title="al-ai.ai"
        scrolling="yes"
        className="absolute inset-0 h-full w-full border-0"
      />

      {/* No caption overlay: the embed's own scene already carries its own
          title/caption content, so a second one here just duplicated it on
          top. `title`/`text` props were dropped along with it — nothing else
          sets them (see migration/seed-al-ai-pages.ts). */}

      {/* Literal .tt-scroll-down markup (theme-black.css/theme.js already
          style and drive this — see app/(site)/[locale]/layout.tsx), not a
          Tailwind reconstruction. */}
      <div className="tt-scroll-down">
        <a href="#tt-page-content" className="tt-scroll-down-inner tt-magnetic-item" data-offset="0">
          <div className="tt-scrd-icon"></div>
          <svg viewBox="0 0 500 500">
            <defs>
              <path
                id="textcircle"
                d="M50,250c0-110.5,89.5-200,200-200s200,89.5,200,200s-89.5,200-200,200S50,360.5,50,250"
              />
            </defs>
            <text dy="30">
              <textPath xlinkHref="#textcircle">Scroll to Explore - Scroll to Explore -</textPath>
            </text>
          </svg>
        </a>
      </div>
    </div>
  );
}
