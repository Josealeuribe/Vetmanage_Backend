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
} from '@nestjs/common';
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

@Controller('ordenes-venta')
export class OrdenesVentaController {
  constructor(private readonly ordenesVentaService: OrdenesVentaService) {}

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
  ) {
    return this.ordenesVentaService.updateEstado(id, dto);
  }
}