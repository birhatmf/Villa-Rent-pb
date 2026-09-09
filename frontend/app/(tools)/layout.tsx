'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/admin/Sidebar';
import { OWNER_NAV } from '@/lib/adminNav';

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const items = OWNER_NAV.flatMap((group) => group.items).filter((item) => item.label !== 'Yeni villa ekle');
  return (
    <div className="flex h-screen flex-col bg-canvas md:flex-row">
      <div className="hidden h-full md:block"><Sidebar scope="owner" /></div>
      <nav aria-label="Ev sahibi menüsü" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface px-4 py-2.5 md:hidden">
        <Link href="/" className="mr-2 shrink-0 font-display text-base text-ink">villa<span className="text-gold">sepeti</span></Link>
        {items.map((item) => {
          const active = item.href === '/hesabim/ev-sahibi' ? pathname === item.href : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`shrink-0 rounded-full px-3 py-1.5 text-[0.75rem] ${active ? 'bg-ink text-canvas' : 'text-muted'}`}>{item.label}</Link>;
        })}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
