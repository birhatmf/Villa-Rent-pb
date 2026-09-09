import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { UsersService } from '../src/admin/users.service';
import { HostApplicationsService } from '../src/host-applications/host-applications.service';

const prisma = new PrismaClient();
const users = new UsersService(prisma as any);
const applications = new HostApplicationsService(prisma as any);
const api = process.env.API_URL ?? 'http://localhost:4000/api';
const email = `customer-access-${Date.now()}@example.invalid`;
const firstPassword = 'Test-pass-123';
const nextPassword = 'Test-pass-456';
const anonymousEmail = `guest-booking-${Date.now()}@example.invalid`;

async function call(path: string, init: RequestInit = {}, cookie?: string) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  });
  const cookies = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  return { response, cookies, body: await response.json().catch(() => ({})) };
}

async function main() {
  try {
    const villa = await prisma.villa.findFirst({
      where: { status: 'PUBLISHED', bookingMode: 'INSTANT' },
      select: { id: true, slug: true, minNights: true },
    });
    assert.ok(villa, 'Anlık rezervasyona açık yayınlanmış villa gerekli.');
    let guestStay: { from: string; to: string } | undefined;
    for (let day = 0; day < 90 && !guestStay; day += 1) {
      const start = new Date(Date.UTC(2042, 0, 1 + day));
      const end = new Date(start.getTime() + Math.max(villa.minNights, 2) * 86_400_000);
      const from = start.toISOString().slice(0, 10);
      const to = end.toISOString().slice(0, 10);
      const availability = await call(`/villas/${villa.slug}/availability?from=${from}&to=${to}&adults=1&children=0&infants=0`);
      if (availability.response.status === 200 && availability.body.available) guestStay = { from, to };
    }
    assert.ok(guestStay, 'Üyesiz rezervasyon testi için müsait tarih bulunmalı.');
    const guestInput = {
      villaId: villa.id,
      ...guestStay,
      adults: 1,
      children: 0,
      infants: 0,
      customerName: 'Üyesiz Misafir',
      customerEmail: anonymousEmail,
      customerPhone: '05550000009',
    };
    const wrongEndpoint = await call('/guest-bookings/requests', {
      method: 'POST',
      headers: { 'Idempotency-Key': `guest-wrong-${Date.now()}` },
      body: JSON.stringify(guestInput),
    });
    assert.equal(wrongEndpoint.response.status, 409);

    const guestHold = await call('/guest-bookings/holds', {
      method: 'POST',
      headers: { 'Idempotency-Key': `guest-hold-${Date.now()}` },
      body: JSON.stringify(guestInput),
    });
    assert.equal(guestHold.response.status, 201);
    assert.equal(guestHold.body.guestId, null);
    assert.equal((await call(`/guest-bookings/${guestHold.body.id}`)).response.status, 404);
    assert.equal((await call(`/guest-bookings/${guestHold.body.id}`, {}, guestHold.cookies)).response.status, 200);
    const declared = await call(`/guest-bookings/${guestHold.body.id}/payment-declared`, { method: 'POST' }, guestHold.cookies);
    assert.equal(declared.response.status, 201);
    assert.equal(declared.body.paymentStatus, 'DECLARED');
    const released = await call(`/guest-bookings/${guestHold.body.id}/hold`, { method: 'DELETE' }, guestHold.cookies);
    assert.equal(released.response.status, 200);
    assert.equal(released.body.status, 'CANCELLED');

    const applicationBody = {
      ownerName: 'Customer Access Test',
      ownerIdNumber: 'TEST-1234',
      iban: 'TR000000000000000000000000',
      address: 'Test address',
      ownershipType: 'SOLE',
      signatureName: 'Customer Access Test',
    };
    assert.equal((await call('/host-applications', { method: 'POST', body: JSON.stringify(applicationBody) })).response.status, 401);

    const registration = {
      method: 'POST',
      body: JSON.stringify({
        name: 'Customer Access Test', email, phone: '+90 555 000 00 00', password: firstPassword, kvkkAccepted: true,
      }),
    } satisfies RequestInit;
    const attempts = await Promise.all([call('/auth/register', registration), call('/auth/register', registration)]);
    assert.deepEqual(attempts.map(({ response }) => response.status).sort(), [201, 409]);
    const registered = attempts.find(({ response }) => response.status === 201)!;
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.role, 'GUEST');
    const oldCookie = registered.cookies;

    const created = await call('/host-applications', {
      method: 'POST', body: JSON.stringify(applicationBody),
    }, oldCookie);
    assert.equal(created.response.status, 201);
    assert.equal(created.body.linkedHostId, registered.body.id);
    assert.equal((await call('/host-applications', {
      method: 'POST', body: JSON.stringify(applicationBody),
    }, oldCookie)).response.status, 409);

    const trips = await call('/bookings?scope=upcoming&page=1&pageSize=5', {}, oldCookie);
    assert.equal(trips.response.status, 200);
    assert.deepEqual(trips.body.items, []);
    assert.equal(trips.body.total, 0);

    assert.equal((await call('/host/bookings', {}, oldCookie)).response.status, 403);
    assert.equal((await call('/admin/bookings', {}, oldCookie)).response.status, 403);

    const profile = await call('/auth/me', {
      method: 'PATCH', body: JSON.stringify({ name: 'Updated Customer', phone: '+90 555 000 00 00' }),
    }, oldCookie);
    assert.equal(profile.response.status, 200);
    assert.equal(profile.body.name, 'Updated Customer');
    assert.equal(profile.body.passwordHash, undefined);

    const changed = await call('/auth/change-password', {
      method: 'POST', body: JSON.stringify({ currentPassword: firstPassword, newPassword: nextPassword }),
    }, profile.cookies);
    assert.equal(changed.response.status, 201);
    assert.equal((await call('/auth/me', {}, oldCookie)).response.status, 401);
    assert.equal((await call('/auth/me', {}, changed.cookies)).response.status, 200);

    await assert.rejects(
      users.update(changed.body.id, { role: 'HOST' }, 'admin-smoke'),
      /yalnızca onaylanan ev sahibi başvurusuyla/,
    );
    await assert.rejects(
      users.update(changed.body.id, { role: 'ADMIN' }, 'admin-smoke'),
      /Aktif ev sahibi başvurusu olan hesap yönetici yapılamaz/,
    );
    const reviews = await Promise.allSettled([
      applications.review(created.body.id, 'APPROVED', undefined, 'admin-smoke-1'),
      applications.review(created.body.id, 'APPROVED', undefined, 'admin-smoke-2'),
    ]);
    assert.deepEqual(reviews.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
    assert.equal((await call('/auth/me', {}, changed.cookies)).response.status, 401);
    const hostLogin = await call('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: nextPassword }),
    });
    assert.equal(hostLogin.body.role, 'HOST');
    assert.equal((await call('/host/bookings', {}, hostLogin.cookies)).response.status, 200);
    assert.equal((await call('/bookings?scope=upcoming&page=1&pageSize=5', {}, hostLogin.cookies)).response.status, 403);
    assert.equal((await call('/favorites', {}, hostLogin.cookies)).response.status, 403);

    await users.update(changed.body.id, { active: false }, 'admin-smoke');
    assert.equal((await call('/auth/me', {}, hostLogin.cookies)).response.status, 401);
    console.log('customer access smoke: ok');
  } finally {
    await prisma.booking.deleteMany({ where: { customerEmail: anonymousEmail } });
    await prisma.hostApplication.deleteMany({ where: { email } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
