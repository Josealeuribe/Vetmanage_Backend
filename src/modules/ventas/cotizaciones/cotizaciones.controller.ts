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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CotizacionesService } from './cotizaciones.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateEstadoCotizacionDto } from './dto/update-estado-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

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
  ) {
    return this.cotizacionesService.updateEstado(id, dto);
  }
}