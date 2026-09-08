'use client';

import { req } from './http';

export type ReviewResponse = { body: string; createdAt: string; updatedAt: string } | null;
export type ReviewItem = {
  id: string;
  bookingId?: string;
  rating: number;
  body: string;
  guestName?: string;
  verifiedStay?: boolean;
  status?: 'PUBLISHED' | 'HIDDEN';
  moderationReason?: string | null;
  canEdit?: boolean;
  createdAt: string;
  updatedAt?: string;
  villa: { title: string; slug: string };
  response: ReviewResponse;
};

export type ReviewPage = { items: ReviewItem[]; total: number; page: number; pageSize: number };
export type EligibleReview = {
  bookingId: string;
  checkIn: string;
  checkOut: string;
  villa: { title: string; slug: string };
};

export const listEligibleReviews = () => req<EligibleReview[]>('/reviews/eligible');
export const listMyReviews = () => req<ReviewPage>('/reviews/mine?pageSize=50');
export const createReview = (bookingId: string, input: { rating: number; body: string }) =>
  req<ReviewItem>(`/bookings/${bookingId}/review`, { method: 'POST', body: JSON.stringify(input) });
export const updateReview = (id: string, input: { rating: number; body: string }) =>
  req<ReviewItem>(`/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(input) });

export const listHostReviews = () => req<ReviewPage>('/host/reviews?pageSize=50');
export const respondToReview = (id: string, body: string) =>
  req<NonNullable<ReviewResponse>>(`/host/reviews/${id}/response`, { method: 'POST', body: JSON.stringify({ body }) });

export const listAdminReviews = (status?: 'PUBLISHED' | 'HIDDEN') =>
  req<ReviewPage>(`/admin/reviews?pageSize=50${status ? `&status=${status}` : ''}`);
export const moderateReview = (id: string, status: 'PUBLISHED' | 'HIDDEN', reason?: string) =>
  req<ReviewItem>(`/admin/reviews/${id}/moderation`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
