import assert from 'node:assert/strict';
import { FavoritesService } from '../src/favorites/favorites.service';

let listArgs: any;
let villaArgs: any;
const prisma = {
  favorite: {
    findMany: async (args: any) => {
      listArgs = args;
      return [{
        villa: {
          id: 'villa-1',
          slug: 'villa-1',
          title: 'Test villa',
          currency: 'TRY',
          pricePerNight: 100,
          region: { name: 'Kalkan', slug: 'kalkan' },
          images: [{ url: '/cover.jpg' }],
          priceRules: [{ pricePerNight: 200 }],
        },
      }];
    },
    upsert: async () => ({ ok: true }),
  },
  villa: {
    findFirst: async (args: any) => {
      villaArgs = args;
      return { id: 'villa-1' };
    },
  },
} as any;

async function main() {
  const service = new FavoritesService(prisma);
  const result = await service.list('guest-1');
  assert.deepEqual(listArgs.where, { userId: 'guest-1', villa: { status: 'PUBLISHED', salesStatus: 'OPEN' } });
  assert.equal(result[0].priceRange.max, 200);
  assert.equal('hostId' in result[0], false);
  assert.equal('commissionRate' in result[0], false);
  assert.equal('reviewNote' in result[0], false);

  await service.add('guest-1', 'villa-1');
  assert.deepEqual(villaArgs.where, { id: 'villa-1', status: 'PUBLISHED', salesStatus: 'OPEN' });
  console.log('favorites-security: publication filter and public response allowlist passed');
}

void main();
