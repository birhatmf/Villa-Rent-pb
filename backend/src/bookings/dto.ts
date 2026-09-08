import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class StayDto {
  @IsString() @Matches(DATE_RE) from!: string;
  @IsString() @Matches(DATE_RE) to!: string;
  @IsInt() @Min(1) @Max(20) adults!: number;
  @IsOptional() @IsInt() @Min(0) @Max(12) children?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) infants?: number;
}

export class CreateHoldDto extends StayDto {
  @IsString() villaId!: string;
  // Boş bırakılırsa üyenin hesap bilgileri kullanılır (bkz. BookingsService.createHold).
  @IsOptional() @IsString() @Length(2, 100) customerName?: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsOptional() @IsString() @Length(5, 30) customerPhone?: string;
}

export class AdminCreateBookingDto extends StayDto {
  @IsString() villaId!: string;
  @IsOptional() @IsString() guestId?: string;
  @IsOptional() @IsString() @Length(2, 100) customerName?: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsOptional() @IsString() @Length(5, 30) customerPhone?: string;
}

export class ChangeBookingDto extends StayDto {
  @IsInt() @Min(0) version!: number;
}

export class BookingVersionDto {
  @IsInt() @Min(0) version!: number;
}

export class CancelBookingDto extends BookingVersionDto {
  @IsString() @Length(2, 300) note!: string;
}

const BOOKING_STATUSES = ['HOLD', 'CONFIRMED', 'EXPIRED', 'CANCELLED'] as const;
const BOOKING_PAYMENT_STATUSES = ['NONE', 'PENDING', 'DECLARED', 'PAID'] as const;
const BOOKING_CHANNELS = ['WEBSITE', 'ADMIN'] as const;
const OWN_BOOKING_SCOPES = ['all', 'action-required', 'upcoming', 'past', 'cancelled'] as const;

export class OwnBookingListDto {
  @IsOptional() @IsIn(OWN_BOOKING_SCOPES) scope?: (typeof OWN_BOOKING_SCOPES)[number];
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(50) pageSize?: number;
}

export class BookingListDto {
  @IsOptional() @IsIn(BOOKING_STATUSES) status?: (typeof BOOKING_STATUSES)[number];
  @IsOptional() @IsIn(BOOKING_PAYMENT_STATUSES) paymentStatus?: (typeof BOOKING_PAYMENT_STATUSES)[number];
  @IsOptional() @IsIn(BOOKING_CHANNELS) channel?: (typeof BOOKING_CHANNELS)[number];
  @IsOptional() @IsString() villaId?: string;
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() @Matches(DATE_RE) from?: string;
  @IsOptional() @IsString() @Matches(DATE_RE) to?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
