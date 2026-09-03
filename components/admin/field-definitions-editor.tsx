'use client';

// components/admin/field-definitions-editor.tsx
//
// Defines the extra fields a content type's entries carry.
//
// This is the screen `contentTypes.customFields` was missing. The column existed
// and nothing read or wrote it — so a client's country, a service's video link
// and the extra image slots all had nowhere to be declared, and the migration
// wrote them in by script because no UI could.
//
// The list is edited as a whole and saved in one PATCH. Per-field saves would
// need an id per field and a reconciliation step, for a list that is almost
// always under ten items and always edited in one sitting.
import { useState } from 'react';
import { Plus, Trash2, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { useT } from './i18n-provider';
import {
  FIELD_KINDS, FIELD_DISPLAYS, type FieldDefinition, type FieldKind, type FieldDisplay,
} from '@/lib/content/custom-fields';
import type { ContentTypeRow } from '@/lib/content/types-admin';
import type { MessageKey } from '@/lib/admin-i18n/messages';

const KIND_LABEL: Record<FieldKind, MessageKey> = {
  text: 'fields.kindText',
  textarea: 'fields.kindTextarea',
  url: 'fields.kindUrl',
  number: 'fields.kindNumber',
  boolean: 'fields.kindBoolean',
  image: 'fields.kindImage',
  select: 'fields.kindSelect',
};

const DISPLAY_LABEL: Record<FieldDisplay, MessageKey> = {
  banner: 'fields.displayBanner',
  inline: 'fields.displayInline',
  hidden: 'fields.displayHidden',
};

const blankField = (): FieldDefinition => ({
  key: '',
  kind: 'text',
  label: { en: '', ar: '' },
  required: false,
  display: 'inline',
});

export function FieldDefinitionsEditor({
  type,
  onClose,
}: {
  type: ContentTypeRow;
  onClose: () => void;
}) {
  const t = useT();
  const [fields, setFields] = useState<FieldDefinition[]>(type.customFields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (index: number, patch: Partial<FieldDefinition>) => {
    setSaved(false);
    setFields((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const move = (index: number, by: -1 | 1) => {
    const next = index + by;
    if (next < 0 || next >= fields.length) return;
    setSaved(false);
    setFields((list) => {
      const copy = [...list];
      // Order matters: it is the order the fields appear in the entry editor
      // and in the details list on the public page.
      const [moved] = copy.splice(index, 1);
      copy.splice(next, 0, moved!);
      return copy;
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      /*
       * The PATCH schema requires the type's other properties, so they are
       * resent unchanged. Sending only `customFields` would fail validation —
       * and a PATCH that silently defaulted the missing ones would turn
       * "edit the fields" into "reset this type's settings".
       */
      const response = await fetch(`/api/content-types/${type.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: type.name,
          description: type.description ?? undefined,
          routePrefix: type.routePrefix,
          hasArchive: type.hasArchive,
          hasCategories: type.hasCategories,
          hasTags: type.hasTags,
          hasFeaturedImage: type.hasFeaturedImage,
          isActive: type.isActive,
          sortOrder: type.sortOrder,
          customFields: fields,
        }),
      });
      const json = (await response.json()) as {
        success: boolean;
        error?: { message?: string };
      };
      if (!response.ok || !json.success) {
        // The server's message names the offending field — "Duplicate field key
        // videoLink" is worth showing verbatim.
        setError(json.error?.message ?? t('fields.saveFailed'));
        return;
      }
      setSaved(true);
      onClose();
    } catch {
      setError(t('fields.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-card space-y-4" data-test-id={`fields-editor-${type.slug}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-[var(--admin-text)]">
            {t('fields.title')} — <span dir="ltr">{type.slug}</span>
          </h3>
          <p className="mt-1 text-xs text-[var(--admin-text-muted)]">{t('fields.intro')}</p>
        </div>
        {saved && <span className="text-xs text-[var(--admin-success)]">{t('common.saved')}</span>}
      </div>

      {error && (
        <p className="text-sm text-[var(--admin-danger)]" data-test-id="fields-error">
          {error}
        </p>
      )}

      {fields.length === 0 && (
        <p className="py-6 text-center text-sm text-[var(--admin-text-muted)]">
          {t('fields.empty')}
        </p>
      )}

      <ul className="space-y-3">
        {fields.map((field, index) => (
          <li
            key={index}
            className="rounded-lg border border-[var(--admin-line)] p-3"
            data-test-id={`field-row-${index}`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-[var(--admin-text-muted)]" dir="ltr">
                {field.key || t('fields.unnamed')}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={t('fields.moveUp')}
                  className="rounded p-1 text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] disabled:opacity-30"
                >
                  <ChevronUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === fields.length - 1}
                  aria-label={t('fields.moveDown')}
                  className="rounded p-1 text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] disabled:opacity-30"
                >
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaved(false);
                    setFields((list) => list.filter((_, i) => i !== index));
                  }}
                  aria-label={t('common.delete')}
                  className="rounded p-1 text-[var(--admin-text-muted)] hover:text-[var(--admin-danger)]"
                  data-test-id={`field-delete-${index}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                {t('fields.key')}
                <input
                  className="admin-input"
                  dir="ltr"
                  value={field.key}
                  placeholder="videoLink"
                  onChange={(e) => update(index, { key: e.target.value })}
                  data-test-id={`field-key-${index}`}
                />
                <span className="text-[var(--admin-text-muted)]">{t('fields.keyHint')}</span>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                {t('fields.kind')}
                <select
                  className="admin-input"
                  value={field.kind}
                  onChange={(e) => {
                    const kind = e.target.value as FieldKind;
                    update(index, {
                      kind,
                      // A dropdown needs options, and the server refuses one
                      // without them. Seeding a blank option here means
                      // switching to `select` does not immediately fail to save.
                      ...(kind === 'select' && !field.options?.length
                        ? { options: [{ value: '', label: { en: '', ar: '' } }] }
                        : {}),
                    });
                  }}
                  data-test-id={`field-kind-${index}`}
                >
                  {FIELD_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(KIND_LABEL[kind])}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                {t('fields.labelEn')}
                <input
                  className="admin-input"
                  dir="ltr"
                  value={field.label.en}
                  onChange={(e) =>
                    update(index, { label: { ...field.label, en: e.target.value } })
                  }
                  data-test-id={`field-label-en-${index}`}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                {t('fields.labelAr')}
                <input
                  className="admin-input"
                  dir="rtl"
                  value={field.label.ar}
                  onChange={(e) =>
                    update(index, { label: { ...field.label, ar: e.target.value } })
                  }
                  data-test-id={`field-label-ar-${index}`}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                {t('fields.display')}
                <select
                  className="admin-input"
                  value={field.display}
                  onChange={(e) => update(index, { display: e.target.value as FieldDisplay })}
                  data-test-id={`field-display-${index}`}
                >
                  {FIELD_DISPLAYS.map((display) => (
                    <option key={display} value={display}>
                      {t(DISPLAY_LABEL[display])}
                    </option>
                  ))}
                </select>
                <span className="text-[var(--admin-text-muted)]">
                  {t(DISPLAY_LABEL[field.display])}
                </span>
              </label>

              <label className="flex items-center gap-2 pt-5 text-xs">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => update(index, { required: e.target.checked })}
                />
                {t('fields.required')}
              </label>
            </div>

            {field.kind === 'select' && (
              <div className="mt-3 space-y-2 border-t border-[var(--admin-line)] pt-3">
                <span className="text-xs text-[var(--admin-text-secondary)]">
                  {t('fields.options')}
                </span>
                {(field.options ?? []).map((option, optionIndex) => (
                  <div key={optionIndex} className="grid gap-2 sm:grid-cols-4">
                    <input
                      className="admin-input text-xs"
                      dir="ltr"
                      placeholder={t('fields.optionValue')}
                      value={option.value}
                      onChange={(e) => {
                        const options = [...(field.options ?? [])];
                        options[optionIndex] = { ...option, value: e.target.value };
                        update(index, { options });
                      }}
                    />
                    <input
                      className="admin-input text-xs"
                      dir="ltr"
                      placeholder="Label (EN)"
                      value={option.label.en}
                      onChange={(e) => {
                        const options = [...(field.options ?? [])];
                        options[optionIndex] = {
                          ...option,
                          label: { ...option.label, en: e.target.value },
                        };
                        update(index, { options });
                      }}
                    />
                    <input
                      className="admin-input text-xs"
                      dir="rtl"
                      placeholder="التسمية"
                      value={option.label.ar}
                      onChange={(e) => {
                        const options = [...(field.options ?? [])];
                        options[optionIndex] = {
                          ...option,
                          label: { ...option.label, ar: e.target.value },
                        };
                        update(index, { options });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        update(index, {
                          options: (field.options ?? []).filter((_, i) => i !== optionIndex),
                        })
                      }
                      className="justify-self-start rounded p-1.5 text-[var(--admin-text-muted)] hover:text-[var(--admin-danger)]"
                      aria-label={t('common.delete')}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    update(index, {
                      options: [
                        ...(field.options ?? []),
                        { value: '', label: { en: '', ar: '' } },
                      ],
                    })
                  }
                  className="admin-btn-ghost text-xs"
                >
                  <Plus size={13} aria-hidden="true" />
                  {t('fields.addOption')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setFields((list) => [...list, blankField()]);
          }}
          // 24 is the cap the server enforces; offering a 25th only to have it
          // rejected on save is worse than not offering it.
          disabled={fields.length >= 24}
          className="admin-btn-ghost"
          data-test-id="field-add"
        >
          <Plus size={14} aria-hidden="true" />
          {t('fields.add')}
        </button>

        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="admin-btn"
          data-test-id="fields-save"
        >
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {t('common.save')}
        </button>

        <button type="button" onClick={onClose} className="admin-btn-ghost">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
