'use client';

import { useEffect, useRef, useState } from 'react';

export default function RegionField({
  regions,
  className = '',
}: {
  regions: { id: string; slug: string; name: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = regions.find((r) => r.slug === slug);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full flex-col gap-1.5 bg-surface px-6 py-4 text-left transition-colors hover:bg-sand/40 ${className}`}
      >
        <span className="eyebrow text-muted">Nereye</span>
        <span className={`truncate text-[0.95rem] ${selected ? 'text-ink' : 'text-muted'}`}>
          {selected ? selected.name : 'Bölge seçin'}
        </span>
      </button>

      <input type="hidden" name="bolge" value={slug} />

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 max-h-[min(60vh,22rem)] w-[min(90vw,19rem)] overflow-y-auto rounded-2xl border border-line bg-canvas p-2 text-ink shadow-[0_24px_60px_-16px_rgba(0,0,0,0.35)]">
          {regions.length ? (
            regions.map((r) => {
              const active = slug === r.slug;
              return (
                <button
                  type="button"
                  key={r.id}
                  aria-pressed={active}
                  onClick={() => {
                    setSlug(active ? '' : r.slug);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left text-[0.92rem] transition-colors hover:bg-sand ${
                    active ? 'text-olive' : 'text-ink'
                  }`}
                >
                  <span className="truncate">{r.name}</span>
                  {active && <span aria-hidden="true">✓</span>}
                </button>
              );
            })
          ) : (
            <p className="px-3 py-4 text-sm text-muted">Bölge bulunamadı</p>
          )}
        </div>
      )}
    </div>
  );
}
