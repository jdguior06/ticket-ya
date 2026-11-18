import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../common/auth/roles.guard.js';
import type { AuthUser } from '../common/auth/auth.types.js';
import { CreateStaffDto, ListUsersQuery, LoginDto, RegisterDto } from './dto.js';
import { UsersService } from './users.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

  /** Registro público: siempre crea un CUSTOMER. */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.users.create({ name: dto.name, email: dto.email, password: dto.password, role: 'CUSTOMER' });
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.users.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.id);
  }

  /** El organizador crea porteros u otros organizadores. */
  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  createStaff(@Body() dto: CreateStaffDto) {
    return this.users.create(dto);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query.role);
  }
}
