import assert from 'node:assert/strict';
import { PayloadTooLargeException } from '@nestjs/common';
import {
  assertUploadQuota,
  MAX_IMAGE_BYTES_PER_VILLA,
  MAX_IMAGES_PER_VILLA,
} from '../src/villas/villa-images.service';

assert.doesNotThrow(() =>
  assertUploadQuota(59, MAX_IMAGE_BYTES_PER_VILLA - 1, 1, MAX_IMAGES_PER_VILLA, MAX_IMAGE_BYTES_PER_VILLA, 'quota'),
);
assert.throws(
  () => assertUploadQuota(60, 0, 1, MAX_IMAGES_PER_VILLA, MAX_IMAGE_BYTES_PER_VILLA, 'quota'),
  PayloadTooLargeException,
);
assert.throws(
  () => assertUploadQuota(1, MAX_IMAGE_BYTES_PER_VILLA, 1, MAX_IMAGES_PER_VILLA, MAX_IMAGE_BYTES_PER_VILLA, 'quota'),
  PayloadTooLargeException,
);

console.log('upload-quota-security: count and cumulative byte limits passed');
