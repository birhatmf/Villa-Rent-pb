import Sidebar from '@/components/admin/Sidebar';
import { getSetting } from '@/lib/api';
import { normalizeBranding } from '@/lib/branding';

export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const branding = normalizeBranding(await getSetting('branding'));
  return (
    <div className="flex h-screen">
      <Sidebar branding={branding} />
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
