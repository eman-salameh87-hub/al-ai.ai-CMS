// app/(holding)/layout.tsx
// ROOT layout for the coming-soon holding page. Deliberately separate from the
// (site) group: nothing here queries or renders real content, so none can leak
// into the RSC payload.
import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import { getSettings } from '@/lib/db/queries';
import '../globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });

// generateMetadata rather than a static object: settings.favicon is a
// database value. Its own root layout, same as (admin)'s — see that
// layout's matching comment on why this needs setting here explicitly too.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    robots: { index: false, follow: false },
    icons: settings?.favicon ? { icon: settings.favicon } : undefined,
  };
}

export default function HoldingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
