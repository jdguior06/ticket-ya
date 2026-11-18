import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ScanDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value,
  )
  @IsString()
  @MaxLength(100)
  code!: string;

  @IsUUID('4')
  eventId!: string;
}

export class RecentQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
