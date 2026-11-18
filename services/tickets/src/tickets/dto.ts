import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class IssueEventDto {
  @IsUUID('4')
  id!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 150)
  name!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 150)
  venue!: string;

  @IsISO8601({ strict: true })
  startsAt!: string;
}

class IssueSectorDto {
  @IsUUID('4')
  id!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 50)
  name!: string;
}

export class IssueTicketsDto {
  @IsUUID('4')
  orderId!: string;

  @IsUUID('4')
  userId!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  holderName!: string;

  @IsEmail()
  @MaxLength(150)
  holderEmail!: string;

  @ValidateNested()
  @Type(() => IssueEventDto)
  event!: IssueEventDto;

  @ValidateNested()
  @Type(() => IssueSectorDto)
  sector!: IssueSectorDto;

  @IsInt()
  @Min(1)
  @Max(6)
  quantity!: number;
}

export class ValidateQuery {
  /**
   * Se normaliza (mayúsculas, sin espacios) porque el portero puede escribirlo a mano.
   * Un código con formato raro no es error 400: responde valid=false / INVALID_CODE.
   */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value))
  @IsString()
  @Length(1, 100)
  code!: string;

  @IsUUID('4')
  eventId!: string;
}

/** Formato de los códigos emitidos: EY-XXXX-XXXX-XXXX (sin 0, O, 1, I). */
export const CODE_PATTERN = /^EY-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
