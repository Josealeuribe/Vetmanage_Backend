import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { RemisionesCompraService } from './remisiones-compra.service';
import { CreateRemisionCompraDto } from './dto/create-remision-compra.dto';
import { UpdateRemisionCompraDto } from './dto/update-remision-compra.dto';
import { CambiarEstadoRemisionCompraDto } from './dto/estado-remision-compra.dto';

export interface AuthUserPayload {
  idUsuario?: number | string;
  id_usuario?: number | string;
  sub?: number | string;
  idBodegaActiva?: number | string;
  id_bodega_activa?: number | string;
  id_bodega?: number | string;
  bodegasPermitidas?: (number | string)[];
  bodegas_permitidas?: (number | string)[];
}

export interface AuthData {
  idUsuario: number;
  idBodegaActiva: number | null;
  bodegasPermitidas: number[];
}

interface RequestWithUser extends Request {
  user: AuthUserPayload;
}

export const GetAuthData = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthData => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    const rawIdUsuario = user.idUsuario ?? user.id_usuario ?? user.sub ?? null;
    const rawIdBodega =
      user.idBodegaActiva ?? user.id_bodega_activa ?? user.id_bodega ?? null;
    const rawBodegas = user.bodegasPermitidas ?? user.bodegas_permitidas ?? [];

    if (rawIdUsuario === null) {
      throw new UnauthorizedException('No se pudo identificar el usuario');
    }

    return {
      idUsuario: Number(rawIdUsuario),
      idBodegaActiva: rawIdBodega !== null ? Number(rawIdBodega) : null,
      bodegasPermitidas: Array.isArray(rawBodegas)
        ? rawBodegas.map(Number)
        : [],
    };
  },
);

@UseGuards(AuthGuard('jwt'))
@Controller('remisiones-compra')
export class RemisionesCompraController {
  constructor(private readonly service: RemisionesCompraService) {}

  @Post()
  create(@Body() dto: CreateRemisionCompraDto, @GetAuthData() auth: AuthData) {
    return this.service.create(dto, {
      idUsuario: auth.idUsuario,
      idBodegaActiva: auth.idBodegaActiva,
      bodegasPermitidas: auth.bodegasPermitidas,
    });
  }

  @Get('siguiente-codigo')
  getSiguienteCodigo(@GetAuthData() auth: AuthData) {
    return this.service.getSiguienteCodigo({
      idUsuario: auth.idUsuario,
      idBodegaActiva: auth.idBodegaActiva,
      bodegasPermitidas: auth.bodegasPermitidas,
    });
  }

  @Get('contexto-compra/:idCompra')
  getContextoCompra(
    @Param('idCompra', ParseIntPipe) idCompra: number,
    @GetAuthData() auth: AuthData,
  ) {
    return this.service.getContextoCompraParaRemision(idCompra, {
      idUsuario: auth.idUsuario,
      idBodegaActiva: auth.idBodegaActiva,
      bodegasPermitidas: auth.bodegasPermitidas,
    });
  }

  @Get()
  findAll(
    @GetAuthData() auth: AuthData,
    @Query('idCompra') idCompra?: string,
    @Query('idBodega') idBodega?: string,
    @Query('id_bodega') idBodegaSnake?: string,
  ) {
    const rawIdBodega = idBodega ?? idBodegaSnake;

    return this.service.findAll({
      idUsuario: auth.idUsuario,
      idBodegaActiva: auth.idBodegaActiva,
      bodegasPermitidas: auth.bodegasPermitidas,
      idCompra: idCompra ? Number(idCompra) : undefined,
      idBodega: rawIdBodega ? Number(rawIdBodega) : undefined,
    });
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetAuthData() auth: AuthData,
  ) {
    return this.service.findOne(id, {
      idUsuario: auth.idUsuario,
      bodegasPermitidas: auth.bodegasPermitidas,
    });
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRemisionCompraDto,
    @GetAuthData() auth: AuthData,
  ) {
    return this.service.update(id, dto, {
      idUsuario: auth.idUsuario,
      bodegasPermitidas: auth.bodegasPermitidas,
    });
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoRemisionCompraDto,
    @GetAuthData() auth: AuthData,
  ) {
    return this.service.cambiarEstado(id, dto, {
      idUsuario: auth.idUsuario,
      bodegasPermitidas: auth.bodegasPermitidas,
    });
  }
}
