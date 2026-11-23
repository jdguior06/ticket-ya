import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { OptionalJwtGuard } from '../common/auth/optional-jwt.guard.js';
import { Roles, RolesGuard } from '../common/auth/roles.guard.js';
import type { AuthUser } from '../common/auth/auth.types.js';
import { uuidParam } from '../common/uuid-param.js';
import { CreateEventDto, ListEventsQuery, UpdateEventDto } from './dto.js';
import { EventsService } from './events.service.js';
import { MAX_IMAGE_BYTES } from './images.service.js';

/** Lo único que usamos del archivo que entrega multer (en memoria, nunca toca el disco sin validar). */
interface UploadedImage {
  buffer: Buffer;
  size: number;
}

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Cartelera pública: solo publicados y futuros. */
  @Get()
  list(@Query() query: ListEventsQuery) {
    return this.events.listPublished(query);
  }

  // Declarada antes de ':id' para que "mine" no se tome como id.
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  mine(@CurrentUser() user: AuthUser) {
    return this.events.listMine(user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  detail(@Param('id', uuidParam('Evento')) id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.events.getPublic(id, req.user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.events.create(user, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  update(@CurrentUser() user: AuthUser, @Param('id', uuidParam('Evento')) id: string, @Body() dto: UpdateEventDto) {
    return this.events.update(user, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  publish(@CurrentUser() user: AuthUser, @Param('id', uuidParam('Evento')) id: string) {
    return this.events.publish(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  cancel(@CurrentUser() user: AuthUser, @Param('id', uuidParam('Evento')) id: string) {
    return this.events.cancel(user, id);
  }

  /** Foto del evento: multipart/form-data con el campo "image" (JPG, PNG o WebP, máx. 2 MB). */
  @Put(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 } }))
  setImage(
    @CurrentUser() user: AuthUser,
    @Param('id', uuidParam('Evento')) id: string,
    @UploadedFile() file: UploadedImage | undefined,
  ) {
    return this.events.setImage(user, id, file?.buffer ?? Buffer.alloc(0));
  }

  @Delete(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  removeImage(@CurrentUser() user: AuthUser, @Param('id', uuidParam('Evento')) id: string) {
    return this.events.removeImage(user, id);
  }

  @Get(':id/image')
  async image(@Param('id', uuidParam('Evento')) id: string, @Res() res: Response) {
    const file = await this.events.imageFile(id);
    res.sendFile(file.path, {
      headers: {
        'Content-Type': file.contentType,
        'X-Content-Type-Options': 'nosniff',
        // La URL cambia (?v=) cada vez que se sube otra foto, así que se puede cachear.
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }
}
