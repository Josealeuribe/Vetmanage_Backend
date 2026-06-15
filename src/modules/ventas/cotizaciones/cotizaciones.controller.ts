import {
  BadRequestException,
  Body,
  Controller,
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
import { CotizacionesService } from './cotizaciones.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateEstadoCotizacionDto } from './dto/update-estado-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';

type AuthRequest = {
  user?: {
    sub?: number | string;
    id?: number | string;
    id_usuario?: number | string;
  };
};

const getAuthUserId = (req: AuthRequest) => {
  const idUsuario = Number(
    req.user?.sub ?? req.user?.id_usuario ?? req.user?.id,
  );

  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    throw new BadRequestException('Usuario autenticado inválido');
  }

  return idUsuario;
};

@UseGuards(AuthGuard('jwt'))
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) { }

  @Post()
  create(@Body() dto: CreateCotizacionDto) {
    return this.cotizacionesService.create(dto);
  }

  @Get()
  findAll(@Query('id_bodega') idBodegaRaw?: string) {
    if (idBodegaRaw === undefined || idBodegaRaw === '') {
      return this.cotizacionesService.findAll();
    }

    const idBodega = Number(idBodegaRaw);

    if (!Number.isFinite(idBodega) || idBodega <= 0) {
      throw new BadRequestException('id_bodega inválido');
    }

    return this.cotizacionesService.findAll({ idBodega });
  }

  @Get('costo-referencia')
  getCostoReferencia(
    @Query('id_cliente') idClienteRaw: string,
    @Query('id_producto') idProductoRaw: string,
  ) {
    const idCliente = Number(idClienteRaw);
    const idProducto = Number(idProductoRaw);

    if (!Number.isFinite(idCliente) || idCliente <= 0) {
      throw new BadRequestException('id_cliente inválido');
    }

    if (!Number.isFinite(idProducto) || idProducto <= 0) {
      throw new BadRequestException('id_producto inválido');
    }

    return this.cotizacionesService.getCostoReferencia(idCliente, idProducto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cotizacionesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCotizacionDto,
  ) {
    return this.cotizacionesService.update(id, dto);
  }

  @Patch(':id/estado')
  updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoCotizacionDto,
    @Req() req: AuthRequest,
  ) {
    return this.cotizacionesService.updateEstado(id, dto, getAuthUserId(req));
  }
}