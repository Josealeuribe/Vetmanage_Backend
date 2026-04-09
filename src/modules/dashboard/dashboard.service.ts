import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardResumenQueryDto } from './dto/dashboard-resumen-query.dto';
import { DashboardResumenResponseDto } from './dto/dashboard-resumen-response.dto';

interface DashboardAuthUser {
  id_usuario: number;
  email: string;
  id_rol: number;
  id_bodega_activa?: number | null;
  rol: string;
  permisos: string[];
}

const ESTADOS = {
  COMPRA: {
    PENDIENTE: 1,
    APROBADA: 2,
    ANULADA: 3,
  },
  COTIZACION: {
    PENDIENTE: 1,
    APROBADA: 2,
    RECHAZADA: 3,
    VENCIDA: 4,
    ANULADA: 5,
  },
  FACTURA: {
    PENDIENTE: 1,
    ABONADA: 2,
    PAGADA: 3,
    ANULADA: 4,
  },
  ORDEN_VENTA: {
    PENDIENTE: 1,
    APROBADA: 2,
    ANULADA: 3,
  },
  REMISION_COMPRA: {
    PENDIENTE: 1,
    APROBADA: 2,
    ANULADA: 3,
  },
  REMISION_VENTA: {
    PENDIENTE: 5,
    DESPACHADO: 6,
    ENTREGADO: 7,
    FACTURADA: 8,
    ANULADA: 9,
  },
  TRASLADO: {
    PENDIENTE: 1,
    ENVIADO: 2,
    RECIBIDO: 3,
    ANULADO: 4,
  },
} as const;

const UMBRAL_STOCK_BAJO = 10;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getResumen(
    query: DashboardResumenQueryDto,
    user: DashboardAuthUser,
  ): Promise<DashboardResumenResponseDto> {
    const scope = await this.resolveBodegaScope(user, query.id_bodega);
    const fechas = this.getDateRanges();

    const [
      bodegasConsultadas,
      ventasMesActualAgg,
      cotizacionesPendientes,
      ordenesVentaPendientes,
      remisionesVentaPendientesFacturar,
      facturasPendientes,
      comprasMesActualAgg,
      ordenesCompraPendientes,
      remisionesCompraPendientes,
      existenciasScope,
      lotesPorVencerRows,
      clientesDesdeCotizaciones,
      clientesDesdeOrdenes,
      clientesDesdeRemisiones,
      proveedoresDesdeCompras,
      trasladosPendientes,
    ] = await Promise.all([
      this.prisma.bodega.findMany({
        where: {
          id_bodega: {
            in: scope.ids_bodegas,
          },
        },
        select: {
          id_bodega: true,
          nombre_bodega: true,
        },
        orderBy: {
          nombre_bodega: 'asc',
        },
      }),

      this.prisma.factura.aggregate({
        where: {
          id_estado_factura: {
            not: ESTADOS.FACTURA.ANULADA,
          },
          fecha_factura: {
            gte: fechas.inicioMes,
            lt: fechas.manana,
          },
          remision_venta: {
            some: {
              orden_venta: {
                is: {
                  id_bodega: {
                    in: scope.ids_bodegas,
                  },
                },
              },
            },
          },
        },
        _sum: {
          total: true,
        },
      }),

      this.prisma.cotizacion.count({
        where: {
          id_bodega: {
            in: scope.ids_bodegas,
          },
          id_estado_cotizacion: ESTADOS.COTIZACION.PENDIENTE,
        },
      }),

      this.prisma.orden_venta.count({
        where: {
          id_bodega: {
            in: scope.ids_bodegas,
          },
          id_estado_orden_venta: ESTADOS.ORDEN_VENTA.PENDIENTE,
        },
      }),

      this.prisma.remision_venta.count({
        where: {
          id_factura: null,
          id_estado_remision_venta: {
            in: [
              ESTADOS.REMISION_VENTA.PENDIENTE,
              ESTADOS.REMISION_VENTA.DESPACHADO,
              ESTADOS.REMISION_VENTA.ENTREGADO,
            ],
          },
          orden_venta: {
            is: {
              id_bodega: {
                in: scope.ids_bodegas,
              },
            },
          },
        },
      }),

      this.prisma.factura.findMany({
        where: {
          id_estado_factura: {
            in: [ESTADOS.FACTURA.PENDIENTE, ESTADOS.FACTURA.ABONADA],
          },
          remision_venta: {
            some: {
              orden_venta: {
                is: {
                  id_bodega: {
                    in: scope.ids_bodegas,
                  },
                },
              },
            },
          },
        },
        select: {
          id_factura: true,
          total: true,
          pagos_abonos: {
            where: {
              estado: true,
            },
            select: {
              valor: true,
            },
          },
        },
      }),

      this.prisma.compras.aggregate({
        where: {
          id_bodega: {
            in: scope.ids_bodegas,
          },
          id_estado_compra: {
            not: ESTADOS.COMPRA.ANULADA,
          },
          fecha_solicitud: {
            gte: fechas.inicioMes,
            lt: fechas.manana,
          },
        },
        _sum: {
          total: true,
        },
      }),

      this.prisma.compras.count({
        where: {
          id_bodega: {
            in: scope.ids_bodegas,
          },
          id_estado_compra: ESTADOS.COMPRA.PENDIENTE,
        },
      }),

      this.prisma.remision_compra.count({
        where: {
          id_estado_remision_compra: ESTADOS.REMISION_COMPRA.PENDIENTE,
          OR: [
            {
              id_bodega: {
                in: scope.ids_bodegas,
              },
            },
            {
              compras: {
                is: {
                  id_bodega: {
                    in: scope.ids_bodegas,
                  },
                },
              },
            },
          ],
        },
      }),

      this.prisma.existencias.findMany({
        where: {
          id_bodega: {
            in: scope.ids_bodegas,
          },
        },
        select: {
          id_producto: true,
          cantidad: true,
          cantidad_reservada: true,
          producto: {
            select: {
              estado: true,
            },
          },
        },
      }),

      this.prisma.existencias.findMany({
        where: {
          id_bodega: {
            in: scope.ids_bodegas,
          },
          fecha_vencimiento: {
            gte: fechas.hoy,
            lte: fechas.proximos30Dias,
          },
        },
        select: {
          id_existencia: true,
          cantidad: true,
          cantidad_reservada: true,
        },
      }),

      this.prisma.cotizacion.findMany({
        where: {
          id_bodega: {
            in: scope.ids_bodegas,
          },
          cliente: {
            is: {
              estado: true,
            },
          },
        },
        distinct: ['id_cliente'],
        select: {
          id_cliente: true,
        },
      }),

      this.prisma.orden_venta.findMany({
        where: {
          id_bodega: {
            in: scope.ids_bodegas,
          },
          cliente: {
            is: {
              estado: true,
            },
          },
        },
        distinct: ['id_cliente'],
        select: {
          id_cliente: true,
        },
      }),

      this.prisma.remision_venta.findMany({
        where: {
          orden_venta: {
            is: {
              id_bodega: {
                in: scope.ids_bodegas,
              },
            },
          },
          cliente: {
            is: {
              estado: true,
            },
          },
        },
        distinct: ['id_cliente'],
        select: {
          id_cliente: true,
        },
      }),

      this.prisma.compras.findMany({
        where: {
          id_bodega: {
            in: scope.ids_bodegas,
          },
          proveedor: {
            is: {
              estado: true,
            },
          },
        },
        distinct: ['id_proveedor'],
        select: {
          id_proveedor: true,
        },
      }),

      this.prisma.traslado.count({
        where: {
          id_estado_traslado: {
            in: [ESTADOS.TRASLADO.PENDIENTE, ESTADOS.TRASLADO.ENVIADO],
          },
          OR: [
            {
              id_bodega_origen: {
                in: scope.ids_bodegas,
              },
            },
            {
              id_bodega_destino: {
                in: scope.ids_bodegas,
              },
            },
          ],
        },
      }),
    ]);

    const saldoPendienteCobro = facturasPendientes.reduce((acc, factura) => {
      const totalFactura = this.toNumber(factura.total);
      const totalAbonado = factura.pagos_abonos.reduce(
        (sum, pago) => sum + this.toNumber(pago.valor),
        0,
      );

      const saldo = Math.max(totalFactura - totalAbonado, 0);
      return acc + saldo;
    }, 0);

    const facturasPendientesCobro = facturasPendientes.filter((factura) => {
      const totalFactura = this.toNumber(factura.total);
      const totalAbonado = factura.pagos_abonos.reduce(
        (sum, pago) => sum + this.toNumber(pago.valor),
        0,
      );

      return totalFactura - totalAbonado > 0;
    }).length;

    const stockPorProducto = new Map<number, number>();

    for (const row of existenciasScope) {
      if (!row.producto?.estado) continue;

      const disponible = Math.max(
        this.toNumber(row.cantidad) - this.toNumber(row.cantidad_reservada),
        0,
      );

      const acumulado = stockPorProducto.get(row.id_producto) ?? 0;
      stockPorProducto.set(row.id_producto, acumulado + disponible);
    }

    let productosConStock = 0;
    let productosStockBajo = 0;

    for (const [, stockDisponible] of stockPorProducto.entries()) {
      if (stockDisponible > 0) {
        productosConStock += 1;
      }

      if (stockDisponible > 0 && stockDisponible < UMBRAL_STOCK_BAJO) {
        productosStockBajo += 1;
      }
    }

    const lotesPorVencer = lotesPorVencerRows.filter((row) => {
      const disponible = Math.max(
        this.toNumber(row.cantidad) - this.toNumber(row.cantidad_reservada),
        0,
      );

      return disponible > 0;
    }).length;

    const clientesActivosSet = new Set<number>([
      ...clientesDesdeCotizaciones.map((x) => x.id_cliente),
      ...clientesDesdeOrdenes.map((x) => x.id_cliente),
      ...clientesDesdeRemisiones.map((x) => x.id_cliente),
    ]);

    const proveedoresActivosSet = new Set<number>(
      proveedoresDesdeCompras.map((x) => x.id_proveedor),
    );

    const nombreBodega =
      scope.ids_bodegas.length === 1
        ? bodegasConsultadas[0]?.nombre_bodega ?? 'Bodega no encontrada'
        : 'Todas las bodegas permitidas';

    return {
      bodega: {
        id_bodega: scope.ids_bodegas.length === 1 ? scope.ids_bodegas[0] : null,
        nombre_bodega: nombreBodega,
        ids_bodegas: scope.ids_bodegas,
        total_bodegas: scope.ids_bodegas.length,
      },
      periodo: {
        etiqueta: this.getPeriodoLabel(fechas.hoy),
        fecha_inicio: this.formatDateOnly(fechas.inicioMes),
        fecha_fin: this.formatDateOnly(fechas.hoy),
      },
      ventas: {
        total_mes_actual: this.toNumber(ventasMesActualAgg._sum.total),
        cotizaciones_pendientes: cotizacionesPendientes,
        ordenes_pendientes: ordenesVentaPendientes,
        remisiones_pendientes_facturar: remisionesVentaPendientesFacturar,
        facturas_pendientes_cobro: facturasPendientesCobro,
        saldo_pendiente_cobro: saldoPendienteCobro,
      },
      compras: {
        total_mes_actual: this.toNumber(comprasMesActualAgg._sum.total),
        ordenes_pendientes: ordenesCompraPendientes,
        remisiones_pendientes: remisionesCompraPendientes,
      },
      inventario: {
        productos_con_stock: productosConStock,
        productos_stock_bajo: productosStockBajo,
        lotes_por_vencer: lotesPorVencer,
        umbral_stock_bajo: UMBRAL_STOCK_BAJO,
      },
      terceros: {
        clientes_activos: clientesActivosSet.size,
        proveedores_activos: proveedoresActivosSet.size,
      },
      logistica: {
        traslados_pendientes: trasladosPendientes,
      },
    };
  }

  private async resolveBodegaScope(
    user: DashboardAuthUser,
    requestedBodegaId?: number,
  ): Promise<{ ids_bodegas: number[] }> {
    const rows = await this.prisma.bodegas_por_usuario.findMany({
      where: {
        id_usuario: user.id_usuario,
        estado: true,
      },
      select: {
        id_bodega: true,
      },
    });

    let idsPermitidas = Array.from(
      new Set(
        rows
          .map((row) => Number(row.id_bodega))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );

    if (idsPermitidas.length === 0 && user.id_bodega_activa) {
      idsPermitidas = [Number(user.id_bodega_activa)];
    }

    if (idsPermitidas.length === 0) {
      throw new ForbiddenException(
        'El usuario no tiene bodegas permitidas para consultar el dashboard',
      );
    }

    if (requestedBodegaId !== undefined && requestedBodegaId > 0) {
      if (!idsPermitidas.includes(requestedBodegaId)) {
        throw new ForbiddenException(
          'No tienes acceso a la bodega seleccionada',
        );
      }

      return {
        ids_bodegas: [requestedBodegaId],
      };
    }

    if (requestedBodegaId === 0) {
      return {
        ids_bodegas: idsPermitidas,
      };
    }

    if (
      user.id_bodega_activa &&
      idsPermitidas.includes(Number(user.id_bodega_activa))
    ) {
      return {
        ids_bodegas: [Number(user.id_bodega_activa)],
      };
    }

    return {
      ids_bodegas: idsPermitidas,
    };
  }

  private getDateRanges() {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const manana = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate() + 1,
    );
    const proximos30Dias = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate() + 30,
    );

    const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    return {
      hoy: hoySinHora,
      inicioMes,
      manana,
      proximos30Dias,
    };
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private getPeriodoLabel(date: Date): string {
    const meses = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];

    return `${meses[date.getMonth()]} ${date.getFullYear()}`;
  }
}