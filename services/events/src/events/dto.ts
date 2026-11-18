import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MAX_PRICE_CENTS = 10_000_000; // Bs 100.000
export const MAX_CAPACITY = 100_000;

export class SectorInputDto {
  @Transform(trim)
  @IsString()
  @Length(1, 50, { message: 'El nombre del sector debe tener entre 1 y 50 caracteres' })
  name!: string;

  @IsInt({ message: 'priceCents debe ser un entero (centavos)' })
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  priceCents!: number;

  @IsInt()
  @Min(1, { message: 'El cupo debe ser al menos 1' })
  @Max(MAX_CAPACITY)
  capacity!: number;
}

export class SectorUpdateDto extends SectorInputDto {
  /** Si viene, se actualiza ese sector; si no, se crea uno nuevo. */
  @IsOptional()
  @IsUUID('4')
  id?: string;
}

export class CreateEventDto {
  @Transform(trim)
  @IsString()
  @Length(3, 150, { message: 'El nombre debe tener entre 3 y 150 caracteres' })
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Transform(trim)
  @IsString()
  @Length(2, 150, { message: 'El lugar debe tener entre 2 y 150 caracteres' })
  venue!: string;

  @IsISO8601({ strict: true }, { message: 'startsAt debe ser una fecha ISO 8601' })
  startsAt!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }, { message: 'imageUrl debe ser una URL http(s)' })
  @MaxLength(500)
  imageUrl?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El evento necesita al menos un sector' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SectorInputDto)
  sectors!: SectorInputDto[];
}

export class UpdateEventDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 150)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 150)
  venue?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  imageUrl?: string;

  /** Lista completa de sectores: los que no vengan se eliminan (solo si no tienen reservas). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SectorUpdateDto)
  sectors?: SectorUpdateDto[];
}

export class ListEventsQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;
}

export class ReserveDto {
  @IsUUID('4')
  orderId!: string;

  @IsUUID('4')
  eventId!: string;

  @IsUUID('4')
  sectorId!: string;

  @IsInt()
  @Min(1)
  @Max(6, { message: 'Máximo 6 entradas por compra' })
  quantity!: number;
}
