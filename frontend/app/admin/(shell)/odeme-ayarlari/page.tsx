'use client';

import { useEffect, useState } from 'react';
import { getSetting, saveSetting } from '@/lib/adminApi';

type PaymentSettings = {
  defaultCommissionRate: number;
  accountHolder: string;
  iban: string;
  bankName: string;
  depositRate: number;
  depositFixedAmount: number;
  deadlineHours: number;
  note: string;
};

const DEFAULTS: PaymentSettings = {
  defaultCommissionRate: 20,
  accountHolder: '',
  iban: '',
  bankName: '',
  depositRate: 30,
  depositFixedAmount: 0,
  deadlineHours: 24,
  note: '',
};

const num = (value: unknown, fallback: number) => (typeof value === 'number' ? value : fallback);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export default function PaymentSettingsPage() {
  const [form, setForm] = useState<PaymentSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSetting('payments')
      .then((value) =>
        setForm({
          defaultCommissionRate: num(value.defaultCommissionRate, DEFAULTS.defaultCommissionRate),
          accountHolder: text(value.accountHolder),
          iban: text(value.iban),
          bankName: text(value.bankName),
          depositRate: num(value.depositRate, DEFAULTS.depositRate),
          depositFixedAmount: num(value.depositFixedAmount, DEFAULTS.depositFixedAmount),
          deadlineHours: num(value.deadlineHours, DEFAULTS.deadlineHours),
          note: text(value.note),
        }),
      )
      .catch((cause) => setError(cause.message));
  }, []);

  const set = <K extends keyof PaymentSettings>(key: K, value: PaymentSettings[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      await saveSetting('payments', { ...form, iban: form.iban.replace(/\s+/g, '').toUpperCase() });
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return <div className="px-8 py-14 text-[0.9rem] text-muted">{error ?? 'Yükleniyor…'}</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-8 py-14">
        <p className="eyebrow text-gold">Operasyon</p>
        <h1 className="mt-3 font-display text-3xl font-light tracking-[-0.02em] text-ink">Ödeme ayarları</h1>
        <p className="mt-4 text-[0.9rem] leading-relaxed text-muted">
          Sitede POS yok: misafir kaporayı buradaki hesaba havale eder, rezervasyonu onayladığınızda ödeme alınmış
          sayılır. Bu bilgiler halka açık uçtan yayınlanmaz; yalnızca kendi rezervasyonunu görüntüleyen misafire gösterilir.
        </p>

        <h2 className="mt-12 border-b border-line pb-3 font-display text-xl font-light text-ink">Havale hesabı</h2>
        <div className="mt-6 space-y-7">
          <Text label="Alıcı ad soyad / ünvan" value={form.accountHolder} onChange={(v) => set('accountHolder', v)} />
          <Text label="IBAN" value={form.iban} onChange={(v) => set('iban', v)} placeholder="TR00 0000 0000 0000 0000 0000 00" />
          <Text label="Banka" value={form.bankName} onChange={(v) => set('bankName', v)} />
        </div>

        <h2 className="mt-12 border-b border-line pb-3 font-display text-xl font-light text-ink">Kapora</h2>
        <div className="mt-6 space-y-7">
          <Number
            label="Kapora oranı (%)"
            value={form.depositRate}
            min={0}
            max={100}
            step={1}
            hint="Toplam tutarın yüzdesi. Aşağıdaki sabit tutar 0'dan büyükse bu oran kullanılmaz."
            onChange={(v) => set('depositRate', v)}
          />
          <Number
            label="Sabit kapora tutarı"
            value={form.depositFixedAmount}
            min={0}
            step={100}
            hint="0 bırakılırsa oran uygulanır. Dolu ise her rezervasyonda bu tutar istenir."
            onChange={(v) => set('depositFixedAmount', v)}
          />
          <Number
            label="Ödeme süresi (saat)"
            value={form.deadlineHours}
            min={1}
            max={168}
            step={1}
            hint="Misafir havale bildirimi yaptıktan sonra tarihlerin ayrılı kalacağı süre."
            onChange={(v) => set('deadlineHours', v)}
          />
          <label className="block">
            <span className="eyebrow text-muted">Misafire gösterilecek not</span>
            <textarea
              rows={3}
              value={form.note}
              onChange={(event) => set('note', event.target.value)}
              className="mt-1.5 w-full border-b border-ink/25 bg-transparent pb-2 text-[0.98rem] text-ink outline-none focus:border-ink"
            />
          </label>
        </div>

        <h2 className="mt-12 border-b border-line pb-3 font-display text-xl font-light text-ink">Komisyon</h2>
        <div className="mt-6">
          <Number
            label="Genel varsayılan komisyon oranı (%)"
            value={form.defaultCommissionRate}
            min={0}
            max={100}
            step={0.5}
            hint="Villa bazlı oran boş bırakıldığında bu kullanılır."
            onChange={(v) => set('defaultCommissionRate', v)}
          />
        </div>

        {error && <p className="mt-8 text-[0.88rem] text-red-700">{error}</p>}

        <button
          onClick={save}
          disabled={!dirty || saving}
          className="mt-10 rounded-full bg-ink px-6 py-2.5 text-[0.85rem] text-canvas transition-colors hover:bg-olive disabled:opacity-35"
        >
          {saving ? 'Kaydediliyor…' : saved ? 'Kaydedildi' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}

const FIELD =
  'mt-1.5 w-full border-b border-ink/25 bg-transparent pb-2 text-[0.98rem] text-ink outline-none focus:border-ink';

function Text({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="eyebrow text-muted">{label}</span>
      <input type="text" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={FIELD} />
    </label>
  );
}

function Number({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block max-w-xs">
      <span className="eyebrow text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value === '' ? 0 : globalThis.Number(event.target.value))}
        className={FIELD}
      />
      {hint && <span className="mt-1.5 block text-[0.78rem] leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}
