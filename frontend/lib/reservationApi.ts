'use client';

import { req } from './http';

export type BookingPaymentStatus = 'NONE' | 'PENDING' | 'DECLARED' | 'PAID';

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
  status: 'HOLD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
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

export const getBooking = (id: string) => req<GuestBooking>(`/bookings/${id}`);

export const listMyBookings = () => req<{ items: GuestBooking[] }>('/bookings');

export const declarePayment = (id: string) =>
  req<GuestBooking>(`/bookings/${id}/payment-declared`, { method: 'POST' });

export const releaseHold = (id: string) =>
  req<GuestBooking>(`/bookings/${id}/hold`, { method: 'DELETE' });

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
