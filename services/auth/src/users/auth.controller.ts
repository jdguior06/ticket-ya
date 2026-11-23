import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../common/auth/roles.guard.js';
import type { AuthUser } from '../common/auth/auth.types.js';
import { CreateStaffDto, ListUsersQuery, LoginDto, RegisterDto } from './dto.js';
import { UsersService } from './users.service.js';
import { WelcomeNotifier } from './welcome.notifier.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly welcome: WelcomeNotifier,
  ) {}

  /** Registro público: siempre crea un CUSTOMER. */
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request & { requestId?: string }) {
    const user = await this.users.create({ name: dto.name, email: dto.email, password: dto.password, role: 'CUSTOMER' });
    this.welcome.send(user, req.requestId);
    return user;
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
