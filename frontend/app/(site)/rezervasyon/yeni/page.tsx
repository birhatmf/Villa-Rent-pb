'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import ReservationSteps from '@/components/site/ReservationSteps';
import { formatPrice, type AvailabilityResult, type VillaPublicDetail } from '@/lib/api';
import { me, type AccountUser } from '@/lib/authApi';
import { ApiError } from '@/lib/http';
import { checkAvailability, createHold, getPublicVilla } from '@/lib/reservationApi';

const REASON: Record<string, string> = {
  SALES_PAUSED: 'Bu villa şu anda rezervasyona kapalı.',
  DATES_UNAVAILABLE: 'Seçilen aralıkta dolu geceler var.',
  MIN_STAY: 'Seçilen tarihler minimum konaklama süresini karşılamıyor.',
  CHECKIN_DAY: 'Bu tarihte giriş yapılamıyor.',
  CAPACITY_EXCEEDED: 'Misafir sayısı villa kapasitesini aşıyor.',
  SYNC_UNHEALTHY: 'Dış takvim henüz güncel doğrulanamadı. Bu villa için rezervasyon talebi bırakın.',
};

const dayLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function NewReservationPage() {
  return (
    <Suspense fallback={<Centered>Yükleniyor…</Centered>}>
      <NewReservationForm />
    </Suspense>
  );
}

function NewReservationForm() {
  const router = useRouter();
  const params = useSearchParams();

  const slug = params.get('villa') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const stay = {
    from,
    to,
    adults: Number(params.get('adults') ?? 2),
    children: Number(params.get('children') ?? 0),
    infants: Number(params.get('infants') ?? 0),
  };

  const [user, setUser] = useState<AccountUser | null>(null);
  const [villa, setVilla] = useState<VillaPublicDetail | null>(null);
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [contact, setContact] = useState({ customerName: '', customerEmail: '', customerPhone: '' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slug || !from || !to) {
      setLoadError('Rezervasyon bilgileri eksik. Villa sayfasından tarih seçerek tekrar deneyin.');
      return;
    }
    let cancelled = false;
    // Oturum zorunlu: bekletme kaydı üyeye bağlanır.
    me()
      .then((account) => {
        if (cancelled) return;
        setUser(account);
        setContact({
          customerName: account.name,
          customerEmail: account.email,
          customerPhone: account.phone ?? '',
        });
        return Promise.all([getPublicVilla(slug), checkAvailability(slug, stay)]);
      })
      .then((loaded) => {
        if (cancelled || !loaded) return;
        setVilla(loaded[0]);
        setAvailability(loaded[1]);
      })
      .catch((cause) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          const next = `/rezervasyon/yeni?${params.toString()}`;
          router.replace(`/giris?next=${encodeURIComponent(next)}`);
          return;
        }
        setLoadError(cause instanceof Error ? cause.message : 'Rezervasyon hazırlanamadı.');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, from, to, stay.adults, stay.children, stay.infants]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!villa) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await createHold({
        villaId: villa.id,
        ...stay,
        customerName: contact.customerName.trim() || undefined,
        customerEmail: contact.customerEmail.trim() || undefined,
        customerPhone: contact.customerPhone.trim() || undefined,
      });
      router.replace(`/hesabim/seyahatlerim/${booking.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Rezervasyon oluşturulamadı.');
      setBusy(false);
    }
  }

  if (loadError) return <Centered>{loadError}</Centered>;
  if (!user || !villa || !availability) return <Centered>Yükleniyor…</Centered>;

  const quote = availability.quote;
  const blocked = !availability.available || availability.bookingMode !== 'INSTANT';

  return (
    <div className="mx-auto max-w-4xl px-6 pb-28 pt-36 lg:px-10">
      <ReservationSteps current={2} />

      <h1 className="mt-8 font-display text-[clamp(1.9rem,3.6vw,2.8rem)] font-light leading-tight tracking-[-0.02em] text-ink">
        Rezervasyon detayları
      </h1>
      <p className="mt-3 text-[0.95rem] text-muted">
        <Link href={`/villalar/${villa.slug}`} className="text-ink underline underline-offset-4">{villa.title}</Link>
        {' · '}{villa.region.name}
      </p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_340px]">
        <form onSubmit={submit} className="space-y-8">
          <section>
            <h2 className="border-b border-line pb-3 font-display text-xl font-light text-ink">Konaklama</h2>
            <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 text-[0.9rem]">
              <Field label="Giriş" value={dayLabel(quote.nights[0]?.date ?? from)} />
              <Field label="Çıkış" value={dayLabel(to)} />
              <Field label="Gece" value={String(availability.nights)} />
              <Field
                label="Misafir"
                value={`${stay.adults} yetişkin${stay.children ? `, ${stay.children} çocuk` : ''}${stay.infants ? `, ${stay.infants} bebek` : ''}`}
              />
            </dl>
            <Link href={`/villalar/${villa.slug}`} className="mt-4 inline-block text-[0.85rem] text-muted underline underline-offset-4 hover:text-ink">
              Tarihleri değiştir
            </Link>
          </section>

          <section>
            <h2 className="border-b border-line pb-3 font-display text-xl font-light text-ink">İletişim</h2>
            <p className="mt-3 text-[0.85rem] text-muted">
              Rezervasyon yazışmaları bu bilgilere gider. Hesabınızdaki bilgiler dolduruldu, gerekirse değiştirin.
            </p>
            <div className="mt-5 space-y-5">
              <Input label="Ad soyad" value={contact.customerName} required minLength={2}
                onChange={(customerName) => setContact({ ...contact, customerName })} />
              <Input label="E‑posta" type="email" value={contact.customerEmail} required
                onChange={(customerEmail) => setContact({ ...contact, customerEmail })} />
              <Input label="Telefon" value={contact.customerPhone} required minLength={5}
                onChange={(customerPhone) => setContact({ ...contact, customerPhone })} />
            </div>
          </section>

          {blocked && (
            <p role="alert" className="border-l-2 border-red-400 pl-3 text-[0.88rem] text-red-700">
              {availability.bookingMode !== 'INSTANT'
                ? 'Bu villa talep üzerine kiralanıyor. Rezervasyon talebi bırakın.'
                : availability.reasons.map((reason) => REASON[reason] ?? reason).join(' ')}
            </p>
          )}
          {error && <p role="alert" className="border-l-2 border-red-400 pl-3 text-[0.88rem] text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={busy || blocked}
            className="w-full rounded-full bg-ink py-3.5 text-[0.92rem] text-canvas transition-colors hover:bg-olive disabled:opacity-40 sm:w-auto sm:px-10"
          >
            {busy ? 'Tarihler bekletiliyor…' : 'Ödeme adımına geç'}
          </button>
          <p className="text-[0.8rem] text-muted">
            Devam ettiğinizde tarihler 10 dakika size ayrılır. Ödeme adımında kaporayı havaleyle gönderirsiniz.
          </p>
        </form>

        <aside className="h-fit space-y-3 rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-28">
          <p className="eyebrow text-muted">Ücret özeti</p>
          <dl className="space-y-2 text-[0.88rem]">
            <Line label={`${availability.nights} gece konaklama`} value={formatPrice(quote.accommodationAmount, quote.currency)} />
            {quote.cleaningFeeAmount > 0 && (
              <Line label="Temizlik ücreti" value={formatPrice(quote.cleaningFeeAmount, quote.currency)} />
            )}
            <Line label="Toplam" value={formatPrice(quote.totalAmount, quote.currency)} strong />
            <Line label="Şimdi ödenecek kapora" value={formatPrice(quote.prepaymentAmount, quote.currency)} />
            <Line
              label="Kalan (girişte)"
              value={formatPrice(quote.totalAmount - quote.prepaymentAmount, quote.currency)}
            />
          </dl>
          <p className="border-t border-line pt-3 text-[0.8rem] leading-relaxed text-muted">
            Hasar depozitosu {formatPrice(quote.depositAmount, quote.currency)} girişte ayrıca alınır ve çıkışta iade edilir.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="eyebrow text-muted">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        minLength={minLength}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full border-b border-ink/25 bg-transparent pb-2 text-[0.98rem] text-ink outline-none focus:border-ink"
      />
    </label>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'border-t border-line pt-2' : 'text-muted'}`}>
      <dt>{label}</dt>
      <dd className={strong ? 'font-display text-[1.05rem] text-ink' : 'text-ink'}>{value}</dd>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-6 pb-28 pt-40 text-center text-[0.95rem] text-muted">{children}</div>;
}
