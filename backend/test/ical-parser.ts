import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { formatCalendarDate } from '../src/villas/availability';
import { parseIcal } from '../src/ical/ical-parser';

const calendar = `BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//My Villa Test//TR\r
BEGIN:VEVENT\r
UID:single@example.test\r
DTSTART;VALUE=DATE:20360110\r
DTEND;VALUE=DATE:20360115\r
SUMMARY:Private guest name\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:repeat@example.test\r
DTSTART;VALUE=DATE:20360201\r
DTEND;VALUE=DATE:20360203\r
RRULE:FREQ=WEEKLY;COUNT=3\r
EXDATE;VALUE=DATE:20360208\r
RDATE;VALUE=DATE:20360222\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:repeat@example.test\r
RECURRENCE-ID;VALUE=DATE:20360215\r
DTSTART;VALUE=DATE:20360216\r
DTEND;VALUE=DATE:20360218\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:cancelled@example.test\r
DTSTART;VALUE=DATE:20360301\r
DTEND;VALUE=DATE:20360303\r
STATUS:CANCELLED\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:transparent@example.test\r
DTSTART;VALUE=DATE:20360305\r
DTEND;VALUE=DATE:20360306\r
TRANSP:TRANSPARENT\r
END:VEVENT\r
END:VCALENDAR\r
`;

const snapshot = parseIcal(calendar, '2036-01-01', '2036-04-01');
assert.equal(snapshot.events.length, 4);
assert.deepEqual(
  snapshot.events.map((event) => [event.uid, formatCalendarDate(event.startDate), formatCalendarDate(event.endDate)]),
  [
    ['single@example.test', '2036-01-10', '2036-01-15'],
    ['repeat@example.test', '2036-02-01', '2036-02-03'],
    ['repeat@example.test', '2036-02-16', '2036-02-18'],
    ['repeat@example.test', '2036-02-22', '2036-02-24'],
  ],
);
assert.deepEqual(snapshot.cancelled.map((item) => item.uid).sort(), ['cancelled@example.test', 'transparent@example.test']);

assert.throws(
  () => parseIcal(`BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:timed@example.test\r
DTSTART:20360110T120000Z\r
DTEND:20360110T140000Z\r
END:VEVENT\r
END:VCALENDAR\r
`, '2036-01-01', '2036-02-01'),
  (error: unknown) => error instanceof BadRequestException && JSON.stringify(error.getResponse()).includes('ICAL_TIMED_EVENT_UNSUPPORTED'),
);

console.log('ical-parser: tekil, RRULE, RDATE, EXDATE, RECURRENCE-ID, iptal, şeffaf ve saatli olay kontrolleri geçti');
