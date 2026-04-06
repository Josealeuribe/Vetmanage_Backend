import { Module } from '@nestjs/common';
import { ClientesController } from './clientes/clientes.controller';
import { ClientesService } from './clientes/clientes.service';
import { CotizacionesController } from './cotizaciones/cotizaciones.controller';
import { CotizacionesService } from './cotizaciones/cotizaciones.service';
import { OrdenesVentaController } from './ordenes-venta/ordenes-venta.controller';
import { OrdenesVentaService } from './ordenes-venta/ordenes-venta.service';
import { RemisionesVentaController } from './remisiones-venta/remisiones-venta.controller';
import { RemisionesVentaService } from './remisiones-venta/remisiones-venta.service';
import { PagosAbonosController } from './pagos-abonos/pagos-abonos.controller';
import { PagosAbonosService } from './pagos-abonos/pagos-abonos.service';

@Module({
  controllers: [
    ClientesController,
    CotizacionesController,
    OrdenesVentaController,
    RemisionesVentaController,
    PagosAbonosController,
  ],
  providers: [
    ClientesService,
    CotizacionesService,
    OrdenesVentaService,
    RemisionesVentaService,
    PagosAbonosService,
  ],
})
export class VentasModule {}