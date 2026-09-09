'use client';

import { useRef, useState } from 'react';
import { uploadContentImage } from '@/lib/adminApi';

const MAX_SIZE = 15 * 1024 * 1024;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function ImageUploadField({
  label,
  value,
  onChange,
  hint,
  contain = false,
}: {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  hint?: string;
  contain?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file?: File) {
    if (!file) return;
    setError(null);
    if (!ACCEPTED.has(file.type)) {
      setError('JPG, PNG veya WebP dosyası seçin.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('Dosya boyutu 15 MB’ı aşamaz.');
      return;
    }

    setBusy(true);
    try {
      const uploaded = await uploadContentImage(file);
      onChange(uploaded.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Görsel yüklenemedi.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <span className="eyebrow text-muted">{label}</span>
      <div className="mt-1.5 overflow-hidden rounded-lg border border-line bg-surface">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className={`h-36 w-full bg-sand ${contain ? 'object-contain p-4' : 'object-cover'}`}
          />
        ) : (
          <div className="flex h-28 items-center justify-center bg-sand/50 text-[0.8rem] text-muted">
            Görsel seçilmedi
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
          <label className="cursor-pointer rounded-full border border-line px-3.5 py-1.5 text-[0.78rem] text-ink transition-colors hover:border-olive-soft">
            {busy ? 'Yükleniyor…' : value ? 'Görseli değiştir' : 'Görsel yükle'}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              className="hidden"
              onChange={(event) => void pick(event.target.files?.[0])}
            />
          </label>
          {value && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange('')}
              className="text-[0.76rem] text-muted transition-colors hover:text-red-700 disabled:opacity-40"
            >
              Kaldır
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[0.72rem] text-muted/80">{hint ?? 'JPG, PNG veya WebP · en fazla 15 MB'}</p>
      {error && <p className="mt-1 text-[0.78rem] text-red-700">{error}</p>}
    </div>
  );
}
