import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class RegisterDto {
  @Transform(trim)
  @IsString()
  @Length(2, 100, { message: 'El nombre debe tener entre 2 y 100 caracteres' })
  name!: string;

  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(150)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede tener más de 72 caracteres' })
  password!: string;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Correo inválido' })
  email!: string;

  @IsString()
  @MaxLength(72)
  password!: string;
}

export const STAFF_ROLES = ['ORGANIZER', 'DOORMAN'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export class CreateStaffDto extends RegisterDto {
  @IsIn(STAFF_ROLES, { message: 'role debe ser ORGANIZER o DOORMAN' })
  role!: StaffRole;
}

export class ListUsersQuery {
  @IsOptional()
  @IsIn(['CUSTOMER', 'ORGANIZER', 'DOORMAN'])
  role?: 'CUSTOMER' | 'ORGANIZER' | 'DOORMAN';
}
