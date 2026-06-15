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
import { PagosAbonosService } from './pagos-abonos.service';
import { CreateFacturaDesdeRemisionesDto } from './dto/create-factura-desde-remisiones.dto';
import { CreateAbonoDto } from './dto/create-abono.dto';
import { JwtAuthGuard } from 'src/modules/auth/login/jwt/jwt-auth.guard';

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

@UseGuards(JwtAuthGuard)
@Controller('pagos-abonos')
export class PagosAbonosController {
  constructor(private readonly pagosAbonosService: PagosAbonosService) { }

  @Get('catalogos')
  findCatalogos() {
    return this.pagosAbonosService.findCatalogos();
  }

  @Get('clientes-con-remisiones-pendientes')
  findClientesConRemisionesPendientes(
    @Query('id_bodega') idBodegaRaw?: string,
  ) {
    const idBodega = parseOptionalPositiveInt(idBodegaRaw);

    return this.pagosAbonosService.findClientesConRemisionesPendientes(idBodega);
  }

  @Get('clientes/:idCliente/remisiones-pendientes')
  findRemisionesPendientesPorCliente(
    @Param('idCliente', ParseIntPipe) idCliente: number,
    @Query('id_bodega') idBodegaRaw?: string,
  ) {
    const idBodega = parseOptionalPositiveInt(idBodegaRaw);
    return this.pagosAbonosService.findRemisionesPendientesPorCliente(
      idCliente,
      idBodega,
    );
  }

  @Get('clientes/:idCliente/facturas')
  findFacturasPorCliente(
    @Param('idCliente', ParseIntPipe) idCliente: number,
    @Query('id_bodega') idBodegaRaw?: string,
  ) {
    const idBodega = parseOptionalPositiveInt(idBodegaRaw);
    return this.pagosAbonosService.findFacturasPorCliente(idCliente, idBodega);
  }

  @Post('facturas')
  createFacturaDesdeRemisiones(
    @Body() dto: CreateFacturaDesdeRemisionesDto,
    @Req() req: AuthRequest,
  ) {
    return this.pagosAbonosService.createFacturaDesdeRemisiones(
      dto,
      getAuthUserId(req),
    );
  }

  @Get('facturas')
  findAllFacturas(@Query('id_bodega') idBodegaRaw?: string) {
    const idBodega = parseOptionalPositiveInt(idBodegaRaw);
    return this.pagosAbonosService.findAllFacturas(idBodega);
  }

  @Get('facturas/:id')
  findFactura(@Param('id', ParseIntPipe) id: number) {
    return this.pagosAbonosService.findFactura(id);
  }

  @Post('facturas/:idFactura/abonos')
  addAbono(
    @Param('idFactura', ParseIntPipe) idFactura: number,
    @Body() dto: CreateAbonoDto,
    @Req() req: AuthRequest,
  ) {
    return this.pagosAbonosService.addAbono(
      idFactura,
      dto,
      getAuthUserId(req),
    );
  }


  @Patch('abonos/:id/anular')
  anularAbono(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.pagosAbonosService.anularAbono(id, getAuthUserId(req));
  }

  @Patch('facturas/:id/anular')
  anularFactura(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.pagosAbonosService.anularFactura(id, getAuthUserId(req));
  }
}