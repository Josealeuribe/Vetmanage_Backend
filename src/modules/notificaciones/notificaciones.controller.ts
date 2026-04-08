import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificacionesQueryDto } from './dto/notificaciones-query.dto';
import { NotificacionesService } from './notificaciones.service';

interface AuthUser {
  id_usuario: number;
  email: string;
  id_rol: number;
  id_bodega_activa?: number | null;
  rol: string;
  permisos: string[];
}

@Controller('notificaciones')
@UseGuards(AuthGuard('jwt'))
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  async getNotificaciones(
    @Query() query: NotificacionesQueryDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.notificacionesService.getNotificaciones(query, req.user);
  }

  @Get('contador')
  async getContador(
    @Query() query: NotificacionesQueryDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.notificacionesService.getContador(query, req.user);
  }

  @Post('sincronizar')
  async sincronizar(
    @Query() query: NotificacionesQueryDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.notificacionesService.sincronizar(query, req.user);
  }

  @Patch('marcar-todas-leidas')
  async marcarTodasLeidas(
    @Query() query: NotificacionesQueryDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.notificacionesService.marcarTodasLeidas(query, req.user);
  }

  @Patch(':id/leida')
  async marcarLeida(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthUser },
  ) {
    return this.notificacionesService.marcarLeida(id, req.user);
  }

  @Delete(':id')
  async eliminar(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthUser },
  ) {
    return this.notificacionesService.eliminar(id, req.user);
  }
}