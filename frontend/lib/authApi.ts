'use client';

import { req } from './http';

export type AccountUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: 'GUEST' | 'HOST' | 'ADMIN';
  active: boolean;
  createdAt: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  kvkkAccepted: boolean;
  marketingOptIn?: boolean;
};

export const register = (input: RegisterInput) =>
  req<AccountUser>('/auth/register', { method: 'POST', body: JSON.stringify(input) });

export const login = (email: string, password: string) =>
  req<AccountUser>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const logout = () => req<{ ok: true }>('/auth/logout', { method: 'POST' });

export const me = () => req<AccountUser>('/auth/me');

export const updateProfile = (input: { name?: string; phone?: string }) =>
  req<AccountUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(input) });

export const changePassword = (currentPassword: string, newPassword: string) =>
  req<AccountUser>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
