import { Transform, Type } from 'class-transformer';
import { IsDefined, IsInt, IsString, IsUUID, Length, Matches, Max, Min, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Datos de tarjeta: se validan aquí y se reenvían a payments. NUNCA se guardan ni se loguean. */
export class CardDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value))
  @Matches(/^\d{12,19}$/, { message: 'Número de tarjeta inválido' })
  number!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 100, { message: 'Nombre del titular inválido' })
  holder!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expMonth!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  expYear!: number;

  @Matches(/^\d{3,4}$/, { message: 'CVV inválido' })
  cvv!: string;
}

export class CreateOrderDto {
  @IsUUID('4')
  eventId!: string;

  @IsUUID('4')
  sectorId!: string;

  @IsInt()
  @Min(1, { message: 'La cantidad mínima es 1' })
  @Max(6, { message: 'Máximo 6 entradas por compra' })
  quantity!: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => CardDto)
  card!: CardDto;
}
