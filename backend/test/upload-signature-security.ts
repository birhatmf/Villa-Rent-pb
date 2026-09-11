import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { assertUploadSignature, hasValidUploadSignature } from '../src/security/upload-signature';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
]);
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

assert.equal(hasValidUploadSignature(jpeg, 'image/jpeg'), true);
assert.equal(hasValidUploadSignature(png, 'image/png'), true);
assert.equal(hasValidUploadSignature(pdf, 'application/pdf'), true);
assert.equal(hasValidUploadSignature(Buffer.from('<script>alert(1)</script>'), 'image/jpeg'), false);
assert.equal(hasValidUploadSignature(Buffer.from('%PDF-1.7\nno trailer'), 'application/pdf'), false);
assert.throws(
  () => assertUploadSignature(pdf, 'image/jpeg', ['image/jpeg']),
  (error) => error instanceof BadRequestException,
);

console.log('upload signature security tests passed');
