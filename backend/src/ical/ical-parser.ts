import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import ICAL from 'ical.js';
import { parseCalendarDate } from '../villas/availability';

export type IcalEventRange = {
  uid: string;
  recurrenceId: string;
  startDate: Date;
  endDate: Date;
  fingerprint: string;
};

export type IcalSnapshot = {
  events: IcalEventRange[];
  cancelled: { uid: string; recurrenceId: string }[];
  coverageStart: Date;
  coverageEnd: Date;
};

const MAX_ICS_BYTES = 1_000_000;
const MAX_OCCURRENCES = 2_000;
const MAX_ITERATIONS = 20_000;

export function parseIcal(text: string, from: string, to: string): IcalSnapshot {
  if (Buffer.byteLength(text, 'utf8') > MAX_ICS_BYTES) throw invalid('ICAL_TOO_LARGE');

  const coverageStart = parseCalendarDate(from);
  const coverageEnd = parseCalendarDate(to);
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw invalid('ICAL_PARSE_ERROR');
  }
  if (root.name !== 'vcalendar') throw invalid('ICAL_NOT_CALENDAR');

  const events = new Map<string, IcalEventRange>();
  const cancelled = new Map<string, { uid: string; recurrenceId: string }>();
  const components = root.getAllSubcomponents('vevent');

  for (const component of components) {
    const event = new ICAL.Event(component);
    if (!event.uid?.trim()) throw invalid('ICAL_UID_MISSING');
    if (event.isRecurrenceException()) continue;

    if (!event.isRecurring()) {
      addOccurrence(event, event.startDate, event.startDate, event.endDate);
      continue;
    }

    const iterator = event.iterator();
    for (let iterations = 0; iterations < MAX_ITERATIONS; iterations += 1) {
      const occurrence = iterator.next();
      if (!occurrence) break;
      if (icalDate(occurrence) >= to) break;
      const details = event.getOccurrenceDetails(occurrence);
      if (icalDate(details.endDate) <= from) continue;
      addOccurrence(details.item, details.recurrenceId, details.startDate, details.endDate);
      if (events.size + cancelled.size > MAX_OCCURRENCES) throw invalid('ICAL_TOO_MANY_EVENTS');
      if (iterations === MAX_ITERATIONS - 1) throw invalid('ICAL_RECURRENCE_LIMIT');
    }
  }

  return { events: [...events.values()], cancelled: [...cancelled.values()], coverageStart, coverageEnd };

  function addOccurrence(event: ICAL.Event, recurrence: ICAL.Time, start: ICAL.Time, end: ICAL.Time) {
    const recurrenceId = event.isRecurring() || event.isRecurrenceException() ? recurrence.toString() : '';
    const identity = `${event.uid}\u0000${recurrenceId}`;
    const state = String(event.component.getFirstPropertyValue('status') ?? '').toUpperCase();
    const transparency = String(event.component.getFirstPropertyValue('transp') ?? '').toUpperCase();
    if (state === 'CANCELLED' || transparency === 'TRANSPARENT') {
      cancelled.set(identity, { uid: event.uid, recurrenceId });
      events.delete(identity);
      return;
    }
    if (!start.isDate || !end.isDate) throw invalid('ICAL_TIMED_EVENT_UNSUPPORTED');
    const startText = icalDate(start);
    const endText = icalDate(end);
    if (endText <= startText) throw invalid('ICAL_INVALID_RANGE');
    if (endText <= from || startText >= to) return;
    const range = {
      uid: event.uid,
      recurrenceId,
      startDate: parseCalendarDate(startText),
      endDate: parseCalendarDate(endText),
      fingerprint: createHash('sha256').update(`${startText}|${endText}`).digest('hex'),
    };
    const previous = events.get(identity);
    if (previous && previous.fingerprint !== range.fingerprint) throw invalid('ICAL_DUPLICATE_IDENTITY');
    events.set(identity, range);
  }
}

export function maxIcalBytes() {
  return MAX_ICS_BYTES;
}

function icalDate(value: ICAL.Time) {
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function invalid(code: string) {
  return new BadRequestException({ message: 'iCal dosyası güvenle işlenemedi.', code });
}
