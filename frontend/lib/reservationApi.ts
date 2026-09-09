'use client';

import { req } from './http';

export type BookingPaymentStatus = 'NONE' | 'PENDING' | 'DECLARED' | 'PAID';
export type GuestBookingStatus = 'REQUESTED' | 'HOLD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED' | 'DECLINED' | 'WITHDRAWN';

export type BookingServiceRequest = {
  id: string;
  requestedBy: string;
  bookingId: string;
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
};

/** Misafirin kendi rezervasyonuna verilen havale bilgisi — halka açık uçta yoktur. */
export type PaymentInstructions = {
  reference: string;
  amount: number;
  currency: string;
  accountHolder: string;
  iban: string;
  bankName: string;
  note: string;
  deadlineHours: number;
};

export type GuestBooking = {
  id: string;
  villaId: string;
  guestId: string | null;
  status: GuestBookingStatus;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  currency: string;
  accommodationAmount: number;
  cleaningFeeAmount: number;
  depositAmount: number;
  totalAmount: number;
  priceSnapshot: unknown;
  paymentStatus: BookingPaymentStatus;
  prepaymentAmount: number;
  paymentDeclaredAt: string | null;
  holdExpiresAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationNote: string | null;
  createdAt: string;
  version: number;
  villa: { title: string; slug: string };
  payment?: PaymentInstructions;
  serviceRequests?: BookingServiceRequest[];
};

export type CreateHoldInput = {
  villaId: string;
  from: string;
  to: string;
  adults: number;
  children: number;
  infants: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
};

export const createHold = (input: CreateHoldInput) =>
  req<GuestBooking>('/bookings/holds', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(input),
  });

export const createBookingRequest = (input: CreateHoldInput) =>
  req<GuestBooking>('/bookings/requests', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(input),
  });

export const createGuestHold = (input: CreateHoldInput) =>
  req<GuestBooking>('/guest-bookings/holds', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(input),
  });

export const createGuestBookingRequest = (input: CreateHoldInput) =>
  req<GuestBooking>('/guest-bookings/requests', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(input),
  });

export const getBooking = (id: string) => req<GuestBooking>(`/bookings/${id}`);
export const getGuestBooking = (id: string) => req<GuestBooking>(`/guest-bookings/${id}`);

export type OwnBookingScope = 'all' | 'action-required' | 'upcoming' | 'past' | 'cancelled';

export const listMyBookings = (input: { scope?: OwnBookingScope; page?: number; pageSize?: number } = {}) => {
  const query = new URLSearchParams();
  if (input.scope && input.scope !== 'all') query.set('scope', input.scope);
  if (input.page) query.set('page', String(input.page));
  if (input.pageSize) query.set('pageSize', String(input.pageSize));
  const suffix = query.size ? `?${query}` : '';
  return req<{ items: GuestBooking[]; total: number; page: number; pageSize: number }>(`/bookings${suffix}`);
};

export const declarePayment = (id: string) =>
  req<GuestBooking>(`/bookings/${id}/payment-declared`, { method: 'POST' });

export const declareGuestPayment = (id: string) =>
  req<GuestBooking>(`/guest-bookings/${id}/payment-declared`, { method: 'POST' });

export const releaseHold = (id: string) =>
  req<GuestBooking>(`/bookings/${id}/hold`, { method: 'DELETE' });

export const releaseGuestHold = (id: string) =>
  req<GuestBooking>(`/guest-bookings/${id}/hold`, { method: 'DELETE' });

export const withdrawBookingRequest = (id: string) =>
  req<GuestBooking>(`/bookings/${id}/withdraw`, { method: 'POST' });

export const requestBookingChange = (id: string, input: { from: string; to: string; adults: number; children: number; infants: number; customerNote?: string }) =>
  req<BookingServiceRequest>(`/bookings/${id}/change-request`, { method: 'POST', body: JSON.stringify(input) });

export const previewBookingChange = (id: string, input: { from: string; to: string; adults: number; children: number; infants: number }) =>
  req<import('./api').AvailabilityResult>(`/bookings/${id}/change-preview`, { method: 'POST', body: JSON.stringify(input) });

export const requestBookingCancellation = (id: string, reason: string) =>
  req<BookingServiceRequest>(`/bookings/${id}/cancellation-request`, { method: 'POST', body: JSON.stringify({ reason }) });

export const withdrawServiceRequest = (requestId: string) =>
  req<BookingServiceRequest>(`/bookings/service-requests/${requestId}/withdraw`, { method: 'POST' });

// Halka açık uçlar da aynı `req` üzerinden okunur; oturum çerezi zararsız gider.
export const getPublicVilla = (slug: string) =>
  req<import('./api').VillaPublicDetail>(`/villas/${encodeURIComponent(slug)}`);

export const checkAvailability = (
  slug: string,
  params: { from: string; to: string; adults: number; children: number; infants: number },
) =>
  req<import('./api').AvailabilityResult>(
    `/villas/${encodeURIComponent(slug)}/availability?${new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    )}`,
  );

/** Footer & iletişim ayarları — WhatsApp/telefon/e‑posta ile "bizimle iletişime geç" için. */
export const getContactSettings = () => req<Record<string, any>>('/settings/footer');
