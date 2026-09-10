'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt = (d: Date, locale: string) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDefault = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) && isoDate(date) === value ? date : null;
};

export default function DateRangeField({ defaultFrom, defaultTo }: { defaultFrom?: string; defaultTo?: string }) {
  const locale = useLocale() === 'tr' ? 'tr-TR' : 'en-US';
  const t = useTranslations('Search');
  const [open, setOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => parseDefault(defaultFrom) ?? startOfDay(new Date()));
  const [checkIn, setCheckIn] = useState<Date | null>(() => parseDefault(defaultFrom));
  const [checkOut, setCheckOut] = useState<Date | null>(() => parseDefault(defaultTo));
  const [hover, setHover] = useState<Date | null>(null);
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

  function pick(day: Date) {
    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(day);
      setCheckOut(null);
      setHover(null);
      return;
    }
    if (day <= checkIn) {
      setCheckIn(day);
      return;
    }
    setCheckOut(day);
    setOpen(false);
  }

  const rangeEnd = checkOut ?? hover;

  return (
    <div ref={ref} className="relative grid grid-cols-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex flex-col gap-1.5 border-r border-line/60 bg-surface px-6 py-4 text-left transition-colors hover:bg-sand/40"
      >
        <span className="eyebrow text-muted">{t('checkIn')}</span>
        <span className="text-[0.95rem] text-ink">{checkIn ? fmt(checkIn, locale) : t('selectDate')}</span>
      </button>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex flex-col gap-1.5 bg-surface px-6 py-4 text-left transition-colors hover:bg-sand/40"
      >
        <span className="eyebrow text-muted">{t('checkOut')}</span>
        <span className="text-[0.95rem] text-ink">{checkOut ? fmt(checkOut, locale) : t('selectDate')}</span>
      </button>

      <input type="hidden" name="from" value={checkIn ? isoDate(checkIn) : ''} />
      <input type="hidden" name="to" value={checkOut ? isoDate(checkOut) : ''} />

      {open && (
        <div className="absolute left-0 top-[calc(100%+0.75rem)] z-50 w-full max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-canvas p-4 text-ink shadow-[0_24px_60px_-16px_rgba(0,0,0,0.35)] sm:w-[min(80vw,600px)] sm:p-6 lg:left-1/2 lg:-translate-x-1/2">
          <div className="mb-5 flex items-center justify-between">
            <button
              type="button"
              aria-label={t('previousMonth')}
              onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-sand hover:text-ink"
            >
              ‹
            </button>
            {checkIn && (
              <p className="text-[0.85rem] text-muted">
                {fmt(checkIn, locale)}
                {rangeEnd ? ` – ${fmt(rangeEnd, locale)}` : ` – ${t('selectCheckOut')}`}
              </p>
            )}
            <button
              type="button"
              aria-label={t('nextMonth')}
              onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-sand hover:text-ink"
            >
              ›
            </button>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <MonthGrid
              year={monthCursor.getFullYear()}
              month={monthCursor.getMonth()}
              checkIn={checkIn}
              rangeEnd={rangeEnd}
              onPick={pick}
              onHover={setHover}
              locale={locale}
            />
            <div className="hidden sm:block">
              <MonthGrid
                year={monthCursor.getFullYear()}
                month={monthCursor.getMonth() + 1}
                checkIn={checkIn}
                rangeEnd={rangeEnd}
                onPick={pick}
                onHover={setHover}
                locale={locale}
              />
            </div>
          </div>

          {(checkIn || checkOut) && (
            <button
              type="button"
              onClick={() => {
                setCheckIn(null);
                setCheckOut(null);
                setHover(null);
              }}
              className="mt-5 text-[0.85rem] text-muted underline underline-offset-4 transition-colors hover:text-ink"
            >
              {t('clearDates')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MonthGrid({
  year,
  month,
  checkIn,
  rangeEnd,
  onPick,
  onHover,
  locale,
}: {
  year: number;
  month: number;
  checkIn: Date | null;
  rangeEnd: Date | null;
  onPick: (d: Date) => void;
  onHover: (d: Date | null) => void;
  locale: string;
}) {
  const first = new Date(year, month, 1);
  const leadingBlank = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = startOfDay(new Date());
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Date(2024, 0, index + 1).toLocaleDateString(locale, { weekday: 'short' }),
  );

  const cells: (Date | null)[] = [
    ...Array(leadingBlank).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  const rangeLo = checkIn && rangeEnd ? (checkIn < rangeEnd ? checkIn : rangeEnd) : null;
  const rangeHi = checkIn && rangeEnd ? (checkIn < rangeEnd ? rangeEnd : checkIn) : null;

  return (
    <div>
      <p className="text-center font-display text-[1.05rem] font-light text-ink">
        {first.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
      </p>
      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
        {weekdays.map((w) => (
          <span key={w} className="pb-1 text-[0.7rem] text-muted">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const past = d < today;
          const isStart = checkIn && d.getTime() === checkIn.getTime();
          const isEnd = rangeEnd && d.getTime() === rangeEnd.getTime();
          const inRange = rangeLo && rangeHi && d > rangeLo && d < rangeHi;
          return (
            <button
              key={i}
              type="button"
              aria-label={d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
              aria-pressed={!!(isStart || isEnd)}
              disabled={past}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              className={`relative flex h-8 items-center justify-center text-[0.82rem] transition-colors ${
                past
                  ? 'cursor-not-allowed text-muted/25'
                  : isStart || isEnd
                    ? 'rounded-full bg-ink text-canvas'
                    : inRange
                      ? 'bg-sand-deep text-ink'
                      : 'text-ink hover:bg-sand'
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
