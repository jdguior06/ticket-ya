import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AppException } from '../common/errors/app-exception.js';
import type { JwtPayload, Role } from '../common/auth/auth.types.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const BCRYPT_ROUNDS = 10;
// Hash de relleno: se compara aunque el correo no exista, para que la respuesta tarde lo mismo.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}

function toPublic(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger('Users');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async create(data: { name: string; email: string; password: string; role: Role }): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    try {
      const user = await this.prisma.user.create({
        data: { name: data.name, email: data.email, passwordHash, role: data.role },
      });
      this.logger.log(`Usuario creado id=${user.id} role=${user.role}`);
      return toPublic(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(409, 'EMAIL_TAKEN', 'El correo ya está registrado');
      }
      throw err;
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      this.logger.warn(`Login fallido email=${email}`);
      throw new AppException(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
    }

    const payload: JwtPayload = { sub: user.id, role: user.role, name: user.name, email: user.email };
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN') ?? '8h';
    const accessToken = await this.jwt.signAsync(payload, {
      // El tipo de expiresIn en @nestjs/jwt es un template literal ('8h', '30m', ...).
      expiresIn: expiresIn as unknown as number,
    });
    this.logger.log(`Login correcto id=${user.id} role=${user.role}`);
    return { accessToken, expiresIn, user: toPublic(user) };
  }

  async findById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppException(404, 'NOT_FOUND', 'Usuario no encontrado');
    return toPublic(user);
  }

  async list(role?: Role): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({
      where: role ? { role } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return users.map(toPublic);
  }
}
