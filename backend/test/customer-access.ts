import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { UsersService } from '../src/admin/users.service';

const prisma = new PrismaClient();
const users = new UsersService(prisma as any);
const api = process.env.API_URL ?? 'http://localhost:4000/api';
const email = `customer-access-${Date.now()}@example.invalid`;
const firstPassword = 'Test-pass-123';
const nextPassword = 'Test-pass-456';

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
    const registration = {
      method: 'POST',
      body: JSON.stringify({
        name: 'Customer Access Test', email, password: firstPassword, kvkkAccepted: true,
      }),
    } satisfies RequestInit;
    const attempts = await Promise.all([call('/auth/register', registration), call('/auth/register', registration)]);
    assert.deepEqual(attempts.map(({ response }) => response.status).sort(), [201, 409]);
    const registered = attempts.find(({ response }) => response.status === 201)!;
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.role, 'GUEST');
    const oldCookie = registered.cookies;

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

    await users.update(changed.body.id, { role: 'HOST' }, 'admin-smoke');
    assert.equal((await call('/auth/me', {}, changed.cookies)).response.status, 401);
    const hostLogin = await call('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: nextPassword }),
    });
    assert.equal(hostLogin.body.role, 'HOST');
    assert.equal((await call('/host/bookings', {}, hostLogin.cookies)).response.status, 200);

    await users.update(changed.body.id, { role: 'GUEST' }, 'admin-smoke');
    assert.equal((await call('/auth/me', {}, hostLogin.cookies)).response.status, 401);
    const guestLogin = await call('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: nextPassword }),
    });
    await users.update(changed.body.id, { active: false }, 'admin-smoke');
    assert.equal((await call('/auth/me', {}, guestLogin.cookies)).response.status, 401);
    console.log('customer access smoke: ok');
  } finally {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
