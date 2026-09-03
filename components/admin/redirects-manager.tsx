'use client';

// components/admin/redirects-manager.tsx
//
// Add, disable and delete one-off redirects, and see which are being used.
//
// The hit counter is the reason this screen is worth having at all. A rule with
// zero hits after a month is one you can retire; a spike on one source is a
// link somebody is still publishing.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, ArrowRight } from 'lucide-react';
import { useT } from './i18n-provider';

export interface RedirectRow {
  id: string;
  source: string;
  destination: string;
  statusCode: number;
  isActive: boolean;
  hits: number;
  lastHitAt: string | null;
  note: string | null;
}

export function RedirectsManager({ initial }: { initial: RedirectRow[] }) {
  const t = useT();
  const router = useRouter();
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [permanent, setPermanent] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          source,
          destination,
          // 301 or 302 only. See the route for why 307/308 are not offered.
          statusCode: permanent ? 301 : 302,
          isActive: true,
          note: note.trim() || undefined,
        }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message?: string } };
      if (!response.ok || !json.success) {
        setError(json.error?.message ?? t('redirects.saveFailed'));
        return;
      }
      setSource('');
      setDestination('');
      setNote('');
      router.refresh();
    } catch {
      setError(t('redirects.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: RedirectRow) => {
    setBusy(true);
    try {
      await fetch(`/api/redirects?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-test-id="redirects-manager">
      <div className="admin-card space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            {t('redirects.source')}
            <input
              className="admin-input"
              dir="ltr"
              value={source}
              placeholder="/en/OldPage"
              onChange={(e) => setSource(e.target.value)}
              data-test-id="redirect-source"
            />
            <span className="text-xs text-[var(--admin-text-muted)]">
              {t('redirects.sourceHint')}
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('redirects.destination')}
            <input
              className="admin-input"
              dir="ltr"
              value={destination}
              placeholder="/en/new-page"
              onChange={(e) => setDestination(e.target.value)}
              data-test-id="redirect-destination"
            />
            <span className="text-xs text-[var(--admin-text-muted)]">
              {t('redirects.destinationHint')}
            </span>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          {t('redirects.note')}
          <input
            className="admin-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-test-id="redirect-note"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={permanent}
            onChange={(e) => setPermanent(e.target.checked)}
            data-test-id="redirect-permanent"
          />
          {t('redirects.permanent')}
        </label>
        <p className="text-xs text-[var(--admin-text-muted)]">
          {permanent ? t('redirects.permanentHint') : t('redirects.temporaryHint')}
        </p>

        {error && (
          <p className="text-sm text-[var(--admin-danger)]" data-test-id="redirect-error">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !source.trim() || !destination.trim()}
          className="admin-btn self-start"
          data-test-id="redirect-save"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus size={14} aria-hidden="true" />
          )}
          {t('redirects.add')}
        </button>
      </div>

      {initial.length === 0 ? (
        <p className="admin-card py-16 text-center text-sm text-[var(--admin-text-muted)]">
          {t('redirects.empty')}
        </p>
      ) : (
        <div className="admin-card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--admin-line)] text-xs uppercase tracking-wide text-[var(--admin-text-muted)]">
                <th className="p-3 text-start font-medium">{t('redirects.source')}</th>
                <th className="p-3 text-start font-medium">{t('redirects.destination')}</th>
                <th className="p-3 text-start font-medium">{t('redirects.code')}</th>
                <th className="p-3 text-start font-medium">{t('redirects.hits')}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {initial.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--admin-line)] last:border-b-0"
                  data-test-id={`redirect-row-${row.id}`}
                >
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    {row.source}
                    {row.note && (
                      <span className="mt-0.5 block font-sans text-[11px] text-[var(--admin-text-muted)]">
                        {row.note}
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    <ArrowRight size={11} aria-hidden="true" className="me-1 inline" />
                    {row.destination}
                  </td>
                  <td className="p-3 tabular-nums">
                    {row.statusCode}
                    {!row.isActive && (
                      <span className="ms-2 text-[11px] text-[var(--admin-text-muted)]">
                        {t('redirects.disabled')}
                      </span>
                    )}
                  </td>
                  <td className="p-3 tabular-nums">
                    {row.hits}
                    {row.lastHitAt && (
                      <span className="mt-0.5 block text-[11px] text-[var(--admin-text-muted)]" dir="ltr">
                        {new Date(row.lastHitAt).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-end">
                    <button
                      type="button"
                      onClick={() => void remove(row)}
                      className="rounded p-1 text-[var(--admin-text-muted)] hover:text-[var(--admin-danger)]"
                      aria-label={t('common.delete')}
                      data-test-id={`redirect-delete-${row.id}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
