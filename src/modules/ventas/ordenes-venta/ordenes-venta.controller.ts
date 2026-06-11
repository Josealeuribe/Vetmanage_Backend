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
import { OrdenesVentaService } from './ordenes-venta.service';
import { CreateOrdenVentaDto } from './dto/create-orden-venta.dto';
import { UpdateEstadoOrdenVentaDto } from './dto/update-estado-orden-venta.dto';
import { UpdateOrdenVentaDto } from './dto/update-orden-venta.dto';

function parseOptionalPositiveInt(value?: string) {
  if (value === undefined || value === null || value === '') return undefined;

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException('Parámetro inválido');
  }

  return parsed;
}

type AuthRequest = {
  user?: {
    sub?: number | string;
    id?: number | string;
    id_usuario?: number | string;
  };
};

function getAuthUserId(req: AuthRequest) {
  const idUsuario = Number(req.user?.sub ?? req.user?.id_usuario ?? req.user?.id);

  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    throw new BadRequestException('Usuario autenticado inválido');
  }

  return idUsuario;
}

@UseGuards(AuthGuard('jwt'))
@Controller('ordenes-venta')
export class OrdenesVentaController {
  constructor(private readonly ordenesVentaService: OrdenesVentaService) { }

  @Get('catalogos')
  findCatalogos(@Query('id_bodega') idBodegaRaw?: string) {
    const idBodega = parseOptionalPositiveInt(idBodegaRaw);
    return this.ordenesVentaService.findCatalogos({ idBodega });
  }

  @Post()
  create(@Body() dto: CreateOrdenVentaDto) {
    return this.ordenesVentaService.create(dto);
  }

  @Get()
  findAll(@Query('id_bodega') idBodegaRaw?: string) {
    const idBodega = parseOptionalPositiveInt(idBodegaRaw);
    return this.ordenesVentaService.findAll({ idBodega });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordenesVentaService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrdenVentaDto,
  ) {
    return this.ordenesVentaService.update(id, dto);
  }

  @Patch(':id/estado')
  updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoOrdenVentaDto,
    @Req() req: AuthRequest,
  ) {
    return this.ordenesVentaService.updateEstado(id, dto, getAuthUserId(req));
  }
}