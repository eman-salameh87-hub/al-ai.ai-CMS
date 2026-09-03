'use client';

// components/site/blocks/video-hero.tsx
//
// The full-bleed autoplay video the legacy home page opened with.
//
// REDUCED MOTION IS HANDLED IN JS, NOT ONLY CSS
// `prefers-reduced-motion` can hide a video with CSS, but it cannot stop it
// downloading and decoding — and a full-screen video is the single heaviest
// thing on the page. The preference is read here so the <video> element is
// never mounted for someone who has asked not to have it: they get the poster
// as a plain image, and the megabytes are never fetched.
//
// It is read in an effect rather than during render because the server has no
// media queries. The first paint is therefore the poster for everyone, which is
// also the right thing for perceived performance — the video fades in over a
// picture rather than over nothing.
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { FULL_BLEED } from '@/lib/blocks/layout';

interface Props {
  src: string;
  poster: string;
  eyebrow?: string;
  title?: string;
  text?: string;
  buttonText?: string;
  buttonUrl?: string;
  skipLabel: string;
  loop: boolean;
  height: 'viewport' | 'tall' | 'medium';
}

const HEIGHT_CLASS: Record<Props['height'], string> = {
  // svh, not vh: on mobile browsers vh is the tallest possible viewport, so a
  // 100vh hero sits partly behind the address bar until the user scrolls.
  viewport: 'h-[100svh] min-h-[520px]',
  tall: 'h-[75svh] min-h-[440px]',
  medium: 'h-[55svh] min-h-[360px]',
};

export function VideoHero({
  src,
  poster,
  eyebrow,
  title,
  text,
  buttonText,
  buttonUrl,
  skipLabel,
  loop,
  height,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [motionOk, setMotionOk] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setMotionOk(!query.matches);

    // The preference can change while the page is open — someone toggling it in
    // system settings should not have to reload.
    const onChange = (event: MediaQueryListEvent) => setMotionOk(!event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const showVideo = Boolean(src) && motionOk && !skipped;

  /** Scroll past the hero, which is what the legacy skip button did. */
  const skip = () => {
    setSkipped(true);
    // Pause before unmounting: a video element removed mid-playback can keep
    // decoding for a beat, and on a slow device that is audible battery drain
    // for nothing.
    videoRef.current?.pause();
    const next = sectionRef.current?.nextElementSibling;
    if (next) next.scrollIntoView({ behavior: motionOk ? 'smooth' : 'auto', block: 'start' });
    else window.scrollTo({ top: window.innerHeight, behavior: motionOk ? 'smooth' : 'auto' });
  };

  return (
    <section
      ref={sectionRef}
      /*
       * The inverted-surface slot, not bg-black.
       *
       * This is what shows in the moment before the poster paints and behind a
       * video whose aspect ratio does not fill the box. Tying it to the theme
       * means a brand with a light inverted surface gets its own colour there
       * rather than a black band it never asked for — the same reasoning as
       * the slider's scrim.
       */
      className={cn(
        'relative overflow-hidden bg-site-surface-inverted',
        // A hero is a band, not a column of prose. See lib/blocks/layout.ts.
        FULL_BLEED,
        HEIGHT_CLASS[height]
      )}
      data-test-id="video-hero"
    >
      {/*
        The poster, always rendered and always underneath. It is the reduced
        motion presentation, the loading state, and the fallback if the video
        fails to decode — one element covering all three, rather than three
        code paths that can each be wrong.
      */}
      {poster && (
        <Image
          src={poster}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
          // Decorative: the words are in the overlay below, and a screen reader
          // announcing a description of the background is noise.
          aria-hidden="true"
        />
      )}

      {showVideo && (
        <video
          ref={videoRef}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-700',
            playing ? 'opacity-100' : 'opacity-0'
          )}
          src={src}
          poster={poster || undefined}
          autoPlay
          // muted is REQUIRED for autoplay to be allowed at all, and it is also
          // simply correct — a page that makes noise on load is a page people
          // close.
          muted
          loop={loop}
          playsInline
          preload="metadata"
          onPlaying={() => setPlaying(true)}
          // A decode failure falls back to the poster already underneath.
          onError={() => setSkipped(true)}
          aria-hidden="true"
          tabIndex={-1}
        />
      )}

      {/*
        Scrim, so overlay text stays legible over any frame.

        Derived from --site-surface-inverted rather than hardcoded black, and
        only rendered when there are words to protect — an unadorned video hero
        should show the video, not a permanent grey wash over it.
      */}
      {(eyebrow || title || text) && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to top, color-mix(in srgb, var(--site-surface-inverted) 72%, transparent), color-mix(in srgb, var(--site-surface-inverted) 30%, transparent) 50%, color-mix(in srgb, var(--site-surface-inverted) 18%, transparent))',
          }}
        />
      )}

      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        {eyebrow && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--site-accent)]">
            {eyebrow}
          </p>
        )}
        {title && (
          <h1 className="font-display max-w-4xl text-4xl font-bold leading-tight text-site-ink-inverted drop-shadow md:text-6xl">
            {title}
          </h1>
        )}
        {text && (
          <p className="mt-4 max-w-2xl text-lg text-site-ink-inverted/90 drop-shadow">{text}</p>
        )}

        {buttonText && buttonUrl && (
          <a
            href={buttonUrl}
            className="mt-8 rounded-full bg-[var(--site-accent)] px-10 py-3.5 font-bold text-[var(--site-accent-ink)] transition hover:opacity-90"
          >
            {buttonText}
          </a>
        )}
      </div>

      {/*
        A real button, not the legacy page's empty <button value="Skip">.
        It carries text, it is keyboard reachable, and it is only rendered when
        there is a video to skip.
      */}
      {showVideo && (
        <button
          type="button"
          onClick={skip}
          // The page surface, so the button reads as UI rather than as part of
          // the video — and stays legible whatever the brand's colours are.
          className="absolute bottom-6 end-6 z-10 rounded-full bg-site-surface/90 px-5 py-2 text-sm font-semibold text-site-ink shadow-lg transition hover:bg-site-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]"
        >
          {skipLabel}
        </button>
      )}
    </section>
  );
}
