import { BadRequestException } from '@nestjs/common';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type SupportedUploadMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export function hasValidUploadSignature(buffer: Buffer, mimeType: SupportedUploadMime) {
  if (mimeType === 'image/jpeg') {
    return (
      buffer.length >= 5 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff &&
      buffer[buffer.length - 2] === 0xff &&
      buffer[buffer.length - 1] === 0xd9
    );
  }
  if (mimeType === 'image/png') {
    return (
      buffer.length >= 20 &&
      buffer.subarray(0, 8).equals(PNG_SIGNATURE) &&
      buffer.subarray(buffer.length - 8, buffer.length - 4).toString('ascii') === 'IEND'
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mimeType === 'application/pdf') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 7).toString('ascii').startsWith('%PDF-1.') &&
      buffer.subarray(Math.max(0, buffer.length - 2048)).includes(Buffer.from('%%EOF'))
    );
  }
  return false;
}

export function assertUploadSignature(buffer: Buffer, mimeType: string, allowed: readonly SupportedUploadMime[]) {
  if (!allowed.includes(mimeType as SupportedUploadMime) || !hasValidUploadSignature(buffer, mimeType as SupportedUploadMime)) {
    throw new BadRequestException('Dosya içeriği bildirilen dosya türüyle eşleşmiyor.');
  }
}
