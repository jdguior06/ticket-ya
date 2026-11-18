import { IsDateString, IsEmail, IsInt, IsNotEmpty, IsString, IsUrl, IsUUID, Max, Min } from 'class-validator';

export class OrderConfirmedDto {
  @IsEmail()
  to!: string;

  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsUUID('4')
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  eventName!: string;

  @IsString()
  @IsNotEmpty()
  venue!: string;

  @IsDateString({ strict: true })
  eventStartsAt!: string;

  @IsString()
  @IsNotEmpty()
  sectorName!: string;

  @IsInt()
  @Min(1)
  @Max(6)
  quantity!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  totalCents!: number;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  ticketsUrl!: string;
}
