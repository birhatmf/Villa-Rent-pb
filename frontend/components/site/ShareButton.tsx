'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Cihazda yerel paylaşım sayfası varsa (çoğu mobil tarayıcı — Instagram dahil)
 * doğrudan onu açar. Yoksa (masaüstü) WhatsApp/Facebook bağlantıları ve
 * Instagram için "bağlantıyı kopyala" seçeneği sunan bir menü açılır —
 * Instagram gönderi/hikayeye bağlantı yapıştırmayı kendisi istiyor, web'den
 * doğrudan paylaşım bağlantısı yok.
 */
export default function ShareButton({ title, className = '' }: { title: string; className?: string }) {
  const t = useTranslations('Gallery');
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function close() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closing]);

  async function onClick() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url: window.location.href });
      } catch {
        // Kullanıcı paylaşım sayfasını kapattı — sessizce geç.
      }
      return;
    }
    if (open) {
      close();
      return;
    }
    setOpen(true);
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
        aria-label={t('share')}
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
        <div
          className={`absolute right-0 top-11 z-20 w-56 rounded-xl border border-line bg-surface p-1.5 text-left shadow-[0_10px_30px_-8px_rgba(0,0,0,0.25)] transition-[opacity,transform] duration-150 ease-out ${
            closing ? 'pointer-events-none translate-y-1 opacity-0' : 'translate-y-0 opacity-100'
          }`}
        >
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="block rounded-md px-3.5 py-2.5 text-[0.85rem] text-ink hover:bg-sand"
          >
            {t('shareWhatsApp')}
          </a>
          <a
            href={facebookHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="block rounded-md px-3.5 py-2.5 text-[0.85rem] text-ink hover:bg-sand"
          >
            {t('shareFacebook')}
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="block w-full rounded-md px-3.5 py-2.5 text-left text-[0.85rem] text-ink hover:bg-sand"
          >
            {copied ? t('copied') : t('copyInstagram')}
          </button>
        </div>
      )}
    </div>
  );
}
