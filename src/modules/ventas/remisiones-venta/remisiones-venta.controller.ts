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
import { RemisionesVentaService } from './remisiones-venta.service';
import { CreateRemisionVentaDto } from './dto/create-remision-venta.dto';
import { UpdateEstadoRemisionVentaDto } from './dto/update-estado-remision-venta.dto';
import { UpdateRemisionVentaDto } from './dto/update-remision-venta.dto';

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
@Controller('remisiones-venta')
export class RemisionesVentaController {
  constructor(
    private readonly remisionesVentaService: RemisionesVentaService,
  ) { }

  @Get('catalogos')
  findCatalogos(
    @Query('id_bodega') idBodegaRaw?: string,
    @Query('id_remision_edicion') idRemisionEdicionRaw?: string,
  ) {
    const idBodega = parseOptionalPositiveInt(idBodegaRaw);
    const idRemisionEdicion = parseOptionalPositiveInt(idRemisionEdicionRaw);

    return this.remisionesVentaService.findCatalogos({
      idBodega,
      idRemisionEdicion,
    });
  }

  @Post()
  create(@Body() dto: CreateRemisionVentaDto) {
    return this.remisionesVentaService.create(dto);
  }

  @Get()
  findAll(@Query('id_bodega') idBodegaRaw?: string) {
    const idBodega = parseOptionalPositiveInt(idBodegaRaw);
    return this.remisionesVentaService.findAll({ idBodega });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.remisionesVentaService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRemisionVentaDto,
  ) {
    return this.remisionesVentaService.update(id, dto);
  }

  @Patch(':id/estado')
  updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoRemisionVentaDto,
    @Req() req: AuthRequest,
  ) {
    return this.remisionesVentaService.updateEstado(
      id,
      dto,
      getAuthUserId(req),
    );
  }
}