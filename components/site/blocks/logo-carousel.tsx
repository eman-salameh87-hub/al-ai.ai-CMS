'use client';

// components/site/blocks/logo-carousel.tsx
//
// The client logo strip from the legacy home page.
//
// CSS ANIMATION, NOT A CAROUSEL LIBRARY
// The legacy page used Swiper for this — 124 KB of JavaScript to move a row of
// images sideways. A duplicated track and one `translateX` keyframe does the
// same thing with no script at all, keeps working if JS fails, and cannot get
// out of step with the DOM.
//
// The marquee stops on hover and stops entirely under `prefers-reduced-motion`
// — a continuously moving element is a genuine accessibility problem, and
// something a visitor is trying to read while it slides away is just annoying.
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { FULL_BLEED } from '@/lib/blocks/layout';

interface Logo {
  src: string;
  alt: string;
  url?: string;
}

interface Props {
  title?: string;
  logos: Logo[];
  speedSeconds: number;
  grayscale: boolean;
}

export function LogoCarousel({ title, logos, speedSeconds, grayscale }: Props) {
  if (!logos.length) return null;

  /*
   * A marquee needs enough items to fill the track twice over, or the loop
   * shows a visible gap. Below that — and whenever the editor sets the speed to
   * zero — it renders as a static centred row, which is what a short list
   * should look like anyway.
   */
  const animate = speedSeconds > 0 && logos.length >= 8;

  return (
    <section
      className={cn('overflow-hidden bg-site-surface-inverted py-14', FULL_BLEED)}
      data-test-id="logo-carousel"
    >
      {title && (
        <h2 className="font-display mb-10 text-center text-3xl font-bold text-site-ink-inverted">
          {title}
        </h2>
      )}

      {animate ? (
        <div className="group relative">
          {/* Fades at both edges, so logos enter and leave rather than
              appearing to be clipped by the viewport. */}
          <div className="pointer-events-none absolute inset-y-0 start-0 z-10 w-24 bg-gradient-to-r from-site-surface-inverted to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 end-0 z-10 w-24 bg-gradient-to-l from-site-surface-inverted to-transparent" />

          <div
            className="logo-marquee flex w-max items-center gap-12"
            style={{ ['--marquee-duration' as string]: `${speedSeconds}s` }}
          >
            {/*
              The track, twice. The animation moves it exactly -50%, so the
              second copy is under the cursor at the moment the first finishes
              and the loop is seamless. aria-hidden on the duplicate — it is the
              same logos, and announcing every client twice is worse than not
              announcing the strip at all.
            */}
            {[false, true].map((isClone) => (
              <ul
                key={String(isClone)}
                className="flex shrink-0 items-center gap-12"
                aria-hidden={isClone || undefined}
              >
                {logos.map((logo, index) => (
                  <li key={`${logo.src}-${index}`} className="shrink-0">
                    <LogoMark logo={logo} grayscale={grayscale} linkable={!isClone} />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      ) : (
        <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-12 gap-y-8 px-4">
          {logos.map((logo, index) => (
            <li key={`${logo.src}-${index}`}>
              <LogoMark logo={logo} grayscale={grayscale} linkable />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LogoMark({
  logo,
  grayscale,
  linkable,
}: {
  logo: Logo;
  grayscale: boolean;
  linkable: boolean;
}) {
  const mark = (
    <Image
      src={logo.src}
      alt={linkable ? logo.alt : ''}
      width={180}
      height={80}
      className={cn(
        'h-14 w-auto max-w-[180px] object-contain transition duration-300',
        grayscale && 'opacity-70 grayscale hover:opacity-100 hover:grayscale-0'
      )}
    />
  );

  // Only the real track is interactive. A focusable clone would put every
  // client twice into the tab order.
  if (!linkable || !logo.url) return mark;

  return (
    <Link href={logo.url} title={logo.alt} className="block">
      {mark}
    </Link>
  );
}
