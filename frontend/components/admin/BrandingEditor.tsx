'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import BrandMark from '@/components/site/BrandMark';
import { BRANDING_DEFAULTS, normalizeBranding, type Branding } from '@/lib/branding';
import { getSetting, saveSetting } from '@/lib/adminApi';
import { ImageUploadField } from './ImageUploadField';

export default function BrandingEditor() {
  const [draft, setDraft] = useState<Branding | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSetting('branding')
      .then((value) => setDraft(normalizeBranding(value)))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Marka ayarları yüklenemedi.'));
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function set<K extends keyof Branding>(key: K, value: Branding[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
    setSaved(false);
  }

  function setCompanyName(companyName: string) {
    setDraft((current) => current
      ? {
          ...current,
          companyName,
          shortName: current.shortName === current.companyName ? companyName : current.shortName,
        }
      : current);
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    if (!draft || !draft.companyName.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const value = normalizeBranding(draft);
      await saveSetting('branding', value);
      setDraft(value);
      setDirty(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Marka ayarları kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  if (error && !draft) {
    return <div className="flex h-full items-center justify-center text-sm text-red-700">{error}</div>;
  }
  if (!draft) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">Yükleniyor…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-6 border-b border-line bg-surface px-5 py-3">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-[0.85rem] text-muted transition-colors hover:text-ink">
            ← Genel bakış
          </Link>
          <span className="h-4 w-px bg-line" />
          <h1 className="font-display text-lg font-light text-ink">Marka &amp; logo</h1>
          {dirty && <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[0.72rem] text-gold">kaydedilmemiş değişiklik</span>}
          {saved && !dirty && <span className="rounded-full bg-olive/15 px-2.5 py-1 text-[0.72rem] text-olive">kaydedildi</span>}
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-[0.8rem] text-red-700">{error}</span>}
          <Link href="/" target="_blank" className="text-[0.85rem] text-muted transition-colors hover:text-ink">
            Sitede aç ↗
          </Link>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving || !draft.companyName.trim()}
            className="rounded-full bg-ink px-5 py-2 text-[0.85rem] text-canvas transition-colors hover:bg-olive disabled:opacity-35"
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas px-6 py-8 lg:px-10">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
          <section className="space-y-7 rounded-2xl border border-line bg-surface p-6">
            <div>
              <p className="eyebrow text-gold">Kurumsal kimlik</p>
              <h2 className="mt-2 font-display text-3xl font-light text-ink">Temel marka bilgileri</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Bu bilgiler site başlığında, tarayıcı sekmesinde ve yönetim panellerinde kullanılır.
              </p>
            </div>

            <label className="block">
              <span className="eyebrow text-muted">Firma adı</span>
              <input
                value={draft.companyName}
                maxLength={80}
                required
                onChange={(event) => setCompanyName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-line bg-canvas px-3.5 py-3 text-sm text-ink outline-none transition-colors focus:border-olive-soft"
              />
            </label>

            <label className="block">
              <span className="eyebrow text-muted">Kısa ad</span>
              <input
                value={draft.shortName}
                maxLength={32}
                placeholder={draft.companyName || BRANDING_DEFAULTS.shortName}
                onChange={(event) => set('shortName', event.target.value)}
                className="mt-2 w-full rounded-lg border border-line bg-canvas px-3.5 py-3 text-sm text-ink outline-none transition-colors focus:border-olive-soft"
              />
              <span className="mt-1.5 block text-[0.72rem] text-muted">Dar alanlarda ve tarayıcı başlıklarında gösterilir.</span>
            </label>

            <ImageUploadField
              label="Logo"
              value={draft.logo}
              onChange={(url) => set('logo', url)}
              hint="Açık zemin için şeffaf PNG veya WebP önerilir · en fazla 15 MB"
              contain
            />
            <ImageUploadField
              label="Koyu zeminde logo"
              value={draft.logoOnDark}
              onChange={(url) => set('logoOnDark', url)}
              hint="Ana sayfa görselinin üzerinde kullanılacak açık renkli logo · boşsa normal logo kullanılır"
              contain
            />
            <ImageUploadField
              label="Favicon"
              value={draft.favicon}
              onChange={(url) => set('favicon', url)}
              hint="Kare PNG veya WebP önerilir · en az 64 × 64 px"
              contain
            />
          </section>

          <aside className="space-y-5 lg:sticky lg:top-8 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="border-b border-line px-5 py-4">
                <p className="eyebrow text-muted">Önizleme</p>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex h-24 items-center rounded-xl border border-line bg-canvas px-6">
                  <BrandMark branding={draft} className="max-h-10 max-w-[220px] font-display text-2xl text-ink" />
                </div>
                <div className="flex h-24 items-center rounded-xl bg-ink px-6">
                  <BrandMark branding={draft} onDark className="max-h-10 max-w-[220px] font-display text-2xl text-white" />
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-3">
                  {draft.favicon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.favicon} alt="" className="h-8 w-8 rounded object-contain" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded bg-sand font-display text-ink">
                      {draft.shortName.charAt(0)}
                    </span>
                  )}
                  <span className="min-w-0 truncate text-sm text-ink">Ana Sayfa · {draft.shortName}</span>
                </div>
              </div>
            </div>
            <p className="px-1 text-xs leading-relaxed text-muted">
              Logo yüklemezseniz firma adı metin olarak gösterilir. Değişiklikler kaydettikten sonra yeni sayfa açılışlarında görünür.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
