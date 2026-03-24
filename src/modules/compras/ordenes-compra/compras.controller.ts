import {
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
import { ComprasService } from './compras.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('compras')
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateCompraDto) {
    return this.comprasService.create(dto, {
      idUsuario: req.user.id_usuario,
    });
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('id_bodega') id_bodega?: string,
    @Query('solo_aprobadas') solo_aprobadas?: string,
  ) {
    return this.comprasService.findAll({
      idUsuario: req.user.id_usuario,
      idBodegaScope: id_bodega ? Number(id_bodega) : undefined,
      soloAprobadas: solo_aprobadas === 'true' || solo_aprobadas === '1',
    });
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.comprasService.findOne(id, {
      idUsuario: req.user.id_usuario,
    });
  }

  @Patch(':id/aprobar')
  aprobar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.comprasService.aprobar(id, {
      idUsuario: req.user.id_usuario,
    });
  }

  @Patch(':id/anular')
  anular(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.comprasService.anular(id, {
      idUsuario: req.user.id_usuario,
    });
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompraDto,
  ) {
    return this.comprasService.update(id, dto, {
      idUsuario: req.user.id_usuario,
    });
  }
}
