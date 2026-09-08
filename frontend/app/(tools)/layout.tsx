'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Header/Footer'sız araç kabuğu — admin panelindeki gibi tam ekran, host'un
 * "Villalarım" ve gelen rezervasyon alanları için. app/admin/layout.tsx ile aynı fikir. */
const TABS = [
  { href: '/hesabim/ev-sahibi', label: 'Özet', exact: true },
  { href: '/hesabim/villalarim', label: 'Villalarım' },
  { href: '/hesabim/ev-sahibi/rezervasyonlar', label: 'Gelen rezervasyonlar' },
  { href: '/hesabim/ev-sahibi/takvim', label: 'Takvim' },
  { href: '/hesabim/ev-sahibi/yorumlar', label: 'Yorumlar' },
];

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex h-screen flex-col bg-canvas">
      <nav className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-6 py-2.5">
        <Link href="/hesabim" className="mr-3 text-[0.8rem] text-muted transition-colors hover:text-ink">
          ← Hesabım
        </Link>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-3.5 py-1.5 text-[0.82rem] transition-colors ${
              (tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)) ? 'bg-ink text-canvas' : 'text-ink-soft hover:bg-sand'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
