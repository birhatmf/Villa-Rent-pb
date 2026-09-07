'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Cihazda yerel paylaşım sayfası varsa (çoğu mobil tarayıcı — Instagram dahil)
 * doğrudan onu açar. Yoksa (masaüstü) WhatsApp/Facebook bağlantıları ve
 * Instagram için "bağlantıyı kopyala" seçeneği sunan bir menü açılır —
 * Instagram gönderi/hikayeye bağlantı yapıştırmayı kendisi istiyor, web'den
 * doğrudan paylaşım bağlantısı yok.
 */
export default function ShareButton({ title, className = '' }: { title: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function onClick() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url: window.location.href });
      } catch {
        // Kullanıcı paylaşım sayfasını kapattı — sessizce geç.
      }
      return;
    }
    setOpen((value) => !value);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label="Paylaş"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas/90 text-ink backdrop-blur-sm transition-transform hover:scale-105"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className="h-[1.05rem] w-[1.05rem]">
          <circle cx="18" cy="5" r="2.4" />
          <circle cx="6" cy="12" r="2.4" />
          <circle cx="18" cy="19" r="2.4" />
          <path d="M8.1 10.6l7.5-4.3M8.1 13.4l7.5 4.3" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-line bg-surface p-1.5 text-left shadow-[0_10px_30px_-8px_rgba(0,0,0,0.25)]">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3.5 py-2.5 text-[0.85rem] text-ink hover:bg-sand"
          >
            WhatsApp&apos;ta paylaş
          </a>
          <a
            href={facebookHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3.5 py-2.5 text-[0.85rem] text-ink hover:bg-sand"
          >
            Facebook&apos;ta paylaş
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="block w-full rounded-lg px-3.5 py-2.5 text-left text-[0.85rem] text-ink hover:bg-sand"
          >
            {copied ? 'Bağlantı kopyalandı' : 'Instagram için bağlantıyı kopyala'}
          </button>
        </div>
      )}
    </div>
  );
}
