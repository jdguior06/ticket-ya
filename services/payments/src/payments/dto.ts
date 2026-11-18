import { Type } from 'class-transformer';
import { Equals, IsDefined, IsInt, IsNotEmpty, IsObject, IsString, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

class CardDto {
  @Matches(/^\d{12,19}$/)
  number!: string;

  @IsString()
  @IsNotEmpty()
  holder!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expMonth!: number;

  @IsInt()
  @Min(1000)
  @Max(9999)
  expYear!: number;

  @Matches(/^\d{3,4}$/)
  cvv!: string;
}

export class CreatePaymentDto {
  @IsUUID('4')
  orderId!: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  amountCents!: number;

  @Equals('BOB')
  currency!: 'BOB';

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CardDto)
  card!: CardDto;
}
