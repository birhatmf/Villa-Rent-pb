'use client';

import { req } from './http';

export type BookingStatus = 'REQUESTED' | 'HOLD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED' | 'DECLINED' | 'WITHDRAWN';
export type BlockKind = 'MANUAL' | 'MAINTENANCE' | 'OWNER_USE' | 'ICAL';

export type CalendarEvent = {
  id: string;
  villaId: string;
  source: 'BOOKING' | 'BLOCK';
  kind: BookingStatus | BlockKind;
  startDate: string;
  endDate: string;
  title: string;
  version: number;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
  adults?: number;
  children?: number;
  infants?: number;
  holdExpiresAt?: string | null;
  totalAmount?: number;
  currency?: string;
  paymentStatus?: 'NONE' | 'PENDING' | 'DECLARED' | 'PAID';
  prepaymentAmount?: number;
  sourceId?: string | null;
  syncStatus?: string | null;
  lastSyncAt?: string | null;
  syncError?: string | null;
};

export type CalendarData = {
  from: string;
  to: string;
  villas: {
    id: string;
    title: string;
    status: string;
    region: { id: string; name: string };
  }[];
  events: CalendarEvent[];
};

export type CalendarAudit = {
  id: string;
  villaId: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  villa: { title: string };
  actor: { name: string; role: string } | null;
};

export type BookingPaymentStatus = 'NONE' | 'PENDING' | 'DECLARED' | 'PAID';
export type BookingChannel = 'WEBSITE' | 'ADMIN';

export type Booking = {
  id: string;
  villaId: string;
  guestId: string | null;
  status: BookingStatus;
  channel: BookingChannel;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  accommodationAmount: number;
  cleaningFeeAmount: number;
  depositAmount: number;
  totalAmount: number;
  currency: string;
  paymentStatus: BookingPaymentStatus;
  prepaymentAmount: number;
  paymentDeclaredAt: string | null;
  holdExpiresAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationNote: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  priceSnapshot: unknown;
  villa: { title: string; slug: string };
};

export type ServiceRequest = {
  id: string;
  requestedBy: string;
  type: 'CHANGE' | 'CANCELLATION';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  payload: { from: string; to: string; adults: number; children: number; infants: number; preview?: { totalAmount: number; currency: string } } | null;
  customerNote: string | null;
  resolutionNote: string | null;
  refundStatus: 'NONE' | 'PENDING' | 'COMPLETED' | 'REJECTED';
  refundAmount: number;
  refundNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  requester?: { name: string; role: string };
};

export type BookingDetail = Booking & { audits: CalendarAudit[]; serviceRequests: ServiceRequest[] };

const query = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => value !== undefined && value !== '' && params.set(key, String(value)));
  return params.toString();
};

export type BookingListParams = {
  status?: string;
  paymentStatus?: string;
  channel?: string;
  villaId?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};
export type BookingListResult = { items: Booking[]; total: number; page: number; pageSize: number };

/**
 * Ayrı bir rezervasyon listesi/detay sayfası hem admin hem host tarafında bu ortak
 * şekli kullanır. `confirm` host için yok: kapora platformun parası, host onu
 * doğrulayamaz — onay yalnızca admin ucundan yapılır (bkz. bookings.service.ts).
 * `requestCancellation` admin için yok: admin CONFIRMED rezervasyonu doğrudan
 * `cancel` ile iptal eder, talep açması gerekmez.
 */
export type BookingApiClient = {
  list: (params?: BookingListParams) => Promise<BookingListResult>;
  get: (id: string) => Promise<BookingDetail>;
  change: (id: string, data: { from: string; to: string; adults: number; children: number; infants: number; version: number }) => Promise<Booking>;
  confirm?: (id: string, version: number) => Promise<Booking>;
  accept: (id: string) => Promise<Booking>;
  decline: (id: string, note: string) => Promise<Booking>;
  cancel: (id: string, version: number, note: string) => Promise<Booking>;
  requestCancellation?: (id: string, reason: string) => Promise<ServiceRequest>;
  withdrawRequest?: (id: string) => Promise<ServiceRequest>;
  resolveRequest: (id: string, input: { decision: 'APPROVED' | 'REJECTED'; resolutionNote?: string; refundStatus?: 'PENDING' | 'COMPLETED' | 'REJECTED'; refundAmount?: number; refundNote?: string }) => Promise<ServiceRequest>;
};

/** Host kendi villalarının rezervasyonlarını görür/onaylar — misafir iletişimi CONFIRMED olana kadar backend'de gizlenir. */
export const hostBookingApi: BookingApiClient = {
  list: (params = {}) => req<BookingListResult>(`/host/bookings?${query({ pageSize: 20, ...params })}`),
  get: (id: string) => req<BookingDetail>(`/host/bookings/${id}`),
  change: (id: string, data) => req<Booking>(`/host/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  accept: (id: string) => req<Booking>(`/host/bookings/${id}/accept`, { method: 'POST' }),
  decline: (id: string, note: string) => req<Booking>(`/host/bookings/${id}/decline`, { method: 'POST', body: JSON.stringify({ note }) }),
  cancel: (id: string, version: number, note: string) =>
    req<Booking>(`/host/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ version, note }) }),
  requestCancellation: (id: string, reason: string) =>
    req<ServiceRequest>(`/host/bookings/${id}/cancellation-request`, { method: 'POST', body: JSON.stringify({ reason }) }),
  withdrawRequest: (id: string) =>
    req<ServiceRequest>(`/bookings/service-requests/${id}/withdraw`, { method: 'POST' }),
  resolveRequest: (id, input) => req<ServiceRequest>(`/host/service-requests/${id}/resolve`, { method: 'POST', body: JSON.stringify(input) }),
};

/** Host'un kendi villalarının çok-villalı takvim görünümü — GET /host/calendar zaten scope'lu döner. */
export const hostCalendarApi = {
  range: (from: string, to: string) => req<CalendarData>(`/host/calendar?${query({ from, to })}`),
  audit: (villaId?: string) => req<CalendarAudit[]>(`/host/calendar/audit?${query({ villaId, limit: 30 })}`),
};

export const bookingApi = {
  calendar: (from: string, to: string) =>
    req<CalendarData>(`/admin/calendar?${query({ from, to })}`),
  audit: (villaId?: string) =>
    req<CalendarAudit[]>(`/admin/calendar/audit?${query({ villaId, limit: 30 })}`),
  list: (params: BookingListParams = {}) => req<BookingListResult>(`/admin/bookings?${query({ pageSize: 20, ...params })}`),
  get: (id: string) => req<BookingDetail>(`/admin/bookings/${id}`),
  create: (data: {
    villaId: string;
    from: string;
    to: string;
    adults: number;
    children: number;
    infants: number;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
  }) => req<Booking>('/admin/bookings', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(data),
  }),
  change: (id: string, data: { from: string; to: string; adults: number; children: number; infants: number; version: number }) =>
    req<Booking>(`/admin/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  confirm: (id: string, version: number) =>
    req<Booking>(`/admin/bookings/${id}/confirm`, { method: 'POST', body: JSON.stringify({ version }) }),
  accept: (id: string) => req<Booking>(`/admin/bookings/${id}/accept`, { method: 'POST' }),
  decline: (id: string, note: string) => req<Booking>(`/admin/bookings/${id}/decline`, { method: 'POST', body: JSON.stringify({ note }) }),
  cancel: (id: string, version: number, note: string) =>
    req<Booking>(`/admin/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ version, note }) }),
  resolveRequest: (id: string, input: { decision: 'APPROVED' | 'REJECTED'; resolutionNote?: string; refundStatus?: 'PENDING' | 'COMPLETED' | 'REJECTED'; refundAmount?: number; refundNote?: string }) =>
    req<ServiceRequest>(`/admin/service-requests/${id}/resolve`, { method: 'POST', body: JSON.stringify(input) }),
  updateRefund: (id: string, input: { status: 'PENDING' | 'COMPLETED' | 'REJECTED'; amount: number; note?: string }) =>
    req<ServiceRequest>(`/admin/service-requests/${id}/refund`, { method: 'POST', body: JSON.stringify(input) }),
  addBlock: (villaId: string, data: { startDate: string; endDate: string; kind: BlockKind; note?: string }) =>
    req<CalendarEvent>(`/admin/villas/${villaId}/blocked-dates`, { method: 'POST', body: JSON.stringify(data) }),
  removeBlock: (villaId: string, id: string, version: number) =>
    req<{ ok: true }>(`/admin/villas/${villaId}/blocked-dates/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ version }),
    }),
};
