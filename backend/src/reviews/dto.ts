import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ReviewListDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(50) pageSize?: number;
}

export class AdminReviewListDto extends ReviewListDto {
  @IsOptional() @IsIn(['PUBLISHED', 'HIDDEN']) status?: 'PUBLISHED' | 'HIDDEN';
}

export class ReviewBodyDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsString() @Length(10, 2000) body!: string;
}

export class ReviewResponseDto {
  @IsString() @Length(2, 1000) body!: string;
}

export class ModerateReviewDto {
  @IsIn(['PUBLISHED', 'HIDDEN']) status!: 'PUBLISHED' | 'HIDDEN';
  @IsOptional() @IsString() @Length(2, 300) reason?: string;
}
