// import {
//     Body,
//     Controller,
//     Get,
//     Param,
//     ParseIntPipe,
//     Patch,
//     Post,
//   } from '@nestjs/common';
//   import { PagosAbonosService } from './pagos-abonos.service';
//   import { CreateFacturaDesdeRemisionesDto } from './dto/create-factura-desde-remisiones.dto';
//   import { CreateAbonoDto } from './dto/create-abono.dto';
  
//   @Controller('pagos-abonos')
//   export class PagosAbonosController {
//     constructor(private readonly pagosAbonosService: PagosAbonosService) {}
  
//     @Get('catalogos')
//     findCatalogos() {
//       return this.pagosAbonosService.findCatalogos();
//     }
  
//     @Get('clientes/:idCliente/remisiones-pendientes')
//     findRemisionesPendientesPorCliente(
//       @Param('idCliente', ParseIntPipe) idCliente: number,
//     ) {
//       return this.pagosAbonosService.findRemisionesPendientesPorCliente(idCliente);
//     }
  
//     @Get('clientes/:idCliente/facturas')
//     findFacturasPorCliente(
//       @Param('idCliente', ParseIntPipe) idCliente: number,
//     ) {
//       return this.pagosAbonosService.findFacturasPorCliente(idCliente);
//     }
  
//     @Post('facturas')
//     createFacturaDesdeRemisiones(
//       @Body() dto: CreateFacturaDesdeRemisionesDto,
//     ) {
//       return this.pagosAbonosService.createFacturaDesdeRemisiones(dto);
//     }
  
//     @Get('facturas')
//     findAllFacturas() {
//       return this.pagosAbonosService.findAllFacturas();
//     }
  
//     @Get('facturas/:id')
//     findFactura(@Param('id', ParseIntPipe) id: number) {
//       return this.pagosAbonosService.findFactura(id);
//     }
  
//     @Post('facturas/:idFactura/abonos')
//     addAbono(
//       @Param('idFactura', ParseIntPipe) idFactura: number,
//       @Body() dto: CreateAbonoDto,
//     ) {
//       return this.pagosAbonosService.addAbono(idFactura, dto);
//     }
  
//     @Patch('abonos/:id/anular')
//     anularAbono(@Param('id', ParseIntPipe) id: number) {
//       return this.pagosAbonosService.anularAbono(id);
//     }
//   }

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

@UseGuards(JwtAuthGuard)
@Controller('pagos-abonos')
export class PagosAbonosController {
  constructor(private readonly pagosAbonosService: PagosAbonosService) {}

  @Get('catalogos')
  findCatalogos() {
    return this.pagosAbonosService.findCatalogos();
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
  ) {
    return this.pagosAbonosService.createFacturaDesdeRemisiones(dto);
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
  ) {
    return this.pagosAbonosService.addAbono(idFactura, dto);
  }

  @Patch('abonos/:id/anular')
  anularAbono(@Param('id', ParseIntPipe) id: number) {
    return this.pagosAbonosService.anularAbono(id);
  }
}