import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateExistenciaDto } from './dto/create-existencia.dto';
import { UpdateExistenciaDto } from './dto/update-existencia.dto';
import { ExistenciasService } from './existencias.service';

interface RequestWithUser extends Request {
  user: {
    id_bodega_activa: number;
    bodegasPermitidas?: number[];
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('existencias')
export class ExistenciasController {
  constructor(private readonly existenciasService: ExistenciasService) { }

  @Post()
  create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateExistenciaDto,
    @Query('id_bodega') idBodegaRaw?: string,
  ) {
    const { id_bodega_activa, bodegasPermitidas } = req.user;
    const idBodegaActiva = idBodegaRaw ? Number(idBodegaRaw) : id_bodega_activa;

    return this.existenciasService.create(dto, {
      idBodegaActiva,
      bodegasPermitidas,
    });
  }

  @Get('productos-vista')
  findProductosVista(
    @Req() req: RequestWithUser,
    @Query('scope') scope?: 'active' | 'all',
    @Query('id_bodega') idBodegaRaw?: string,
  ) {
    const { id_bodega_activa, bodegasPermitidas } = req.user;
    const idBodegaActiva = idBodegaRaw ? Number(idBodegaRaw) : id_bodega_activa;

    return this.existenciasService.findProductosVista({
      idBodegaActiva,
      bodegasPermitidas,
      scope: scope === 'all' ? 'all' : 'active',
    });
  }

  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('id_bodega') idBodegaRaw?: string,
  ) {
    const { id_bodega_activa, bodegasPermitidas } = req.user;
    const idBodegaActiva =
      idBodegaRaw !== undefined
        ? Number(idBodegaRaw)
        : id_bodega_activa ?? undefined;

    return this.existenciasService.findAll({
      idBodegaActiva,
      bodegasPermitidas,
    });
  }

  @Get(':id')
  findOne(@Req() req: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    const { bodegasPermitidas } = req.user;
    return this.existenciasService.findOne(id, { bodegasPermitidas });
  }

  @Patch(':id')
  update(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExistenciaDto,
    @Query('id_bodega') idBodegaRaw?: string,
  ) {
    const { id_bodega_activa, bodegasPermitidas } = req.user;
    const idBodegaActiva = idBodegaRaw ? Number(idBodegaRaw) : id_bodega_activa;

    return this.existenciasService.update(id, dto, {
      idBodegaActiva,
      bodegasPermitidas,
    });
  }

  @Delete(':id')
  remove(@Req() req: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    const { bodegasPermitidas } = req.user;
    return this.existenciasService.remove(id, { bodegasPermitidas });
  }
}