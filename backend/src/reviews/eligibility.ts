import { formatCalendarDate } from '../villas/availability';

export const REVIEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function reviewCheckOutAt(date: Date, time: string, timeZone: string) {
  const [year, month, day] = formatCalendarDate(date).split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wanted;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    instant += wanted - observed;
  }
  return new Date(instant);
}

export function reviewEligibility(
  booking: { status: string; paymentStatus: string; checkOut: Date; villa: { timezone: string; checkOutTime: string } },
  now: Date,
) {
  if (booking.status !== 'CONFIRMED') return 'NOT_CONFIRMED' as const;
  if (booking.paymentStatus !== 'PAID' && booking.paymentStatus !== 'NONE') return 'NOT_PAID' as const;
  const checkOutAt = reviewCheckOutAt(booking.checkOut, booking.villa.checkOutTime, booking.villa.timezone);
  if (now < checkOutAt) return 'TOO_EARLY' as const;
  if (now.getTime() > checkOutAt.getTime() + REVIEW_WINDOW_MS) return 'TOO_LATE' as const;
  return 'ELIGIBLE' as const;
}
