'use client';

import { useTranslations } from 'next-intl';

export default function ReservationSteps({ current }: { current: 1 | 2 | 3 }) {
  const t = useTranslations('Booking');
  const steps = [t('date'), t('details'), t('payment')];
  return (
    <ol className="flex items-center gap-3 text-[0.8rem]">
      {steps.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.72rem] ${
                active ? 'bg-ink text-canvas' : done ? 'bg-olive text-white' : 'border border-line text-muted'
              }`}
            >
              {done ? '✓' : step}
            </span>
            <span className={active ? 'text-ink' : 'text-muted'}>{label}</span>
            {step < steps.length && <span className="h-px w-6 bg-line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
