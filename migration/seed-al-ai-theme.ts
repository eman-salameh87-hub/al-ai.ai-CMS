// migration/seed-al-ai-theme.ts
//
// Applies the al-ai.ai dark skin (colors) to Settings so the whole site —
// not just the two seeded pages — renders in the template's actual look
// instead of the CMS's default light theme.
//
// Values pulled from al-ai.ai-pages/assets/css/theme-black.css :root block:
//   --tt-main-color: #ffc619   (already the CMS's default accent — kept)
//   --tt-bg-color:   #090b0f
//   --tt-text-color: #efedea
//   --tt-text-muted-color: #8f8f8f
//
// This only sets `settings.theme` (the single/base skin) — no dark-mode
// toggle is added, matching the source site, which has no light variant.
// Fonts (Poppins + Big Shoulders Display) are NOT set here — that requires
// editing app/(site)/[locale]/layout.tsx's next/font imports directly,
// done alongside this script (see chat).
//
//   npx tsx --env-file=.env migration/seed-al-ai-theme.ts --dry-run
//   npx tsx --env-file=.env migration/seed-al-ai-theme.ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import type { Theme } from '@/lib/theme/slots';

const DRY_RUN = process.argv.includes('--dry-run');

const AL_AI_THEME: Theme = {
  accent: '#ffc619',
  'accent-hover': '#fddc0d',
  'accent-ink': '#130c0e',
  surface: '#090b0f',
  'surface-raised': '#14161c',
  'surface-inverted': '#050608',
  line: '#2a2d33',
  ink: '#efedea',
  'ink-muted': '#8f8f8f',
  'ink-inverted': '#efedea',
  radius: '0.5rem',
};

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== Applying al-ai.ai theme ===');
  console.log(AL_AI_THEME);

  if (DRY_RUN) {
    console.log('\nDry run — nothing written.');
    process.exit(0);
  }

  const [existing] = await db.select({ id: settings.id }).from(settings).limit(1);
  if (existing) {
    await db.update(settings).set({ theme: AL_AI_THEME }).where(eq(settings.id, existing.id));
  } else {
    await db.insert(settings).values({ id: 1, theme: AL_AI_THEME });
  }

  console.log('\nDone. Restart the dev server and hard-refresh to see it.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
