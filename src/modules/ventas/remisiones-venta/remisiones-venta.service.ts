import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateRemisionVentaDto } from './dto/create-remision-venta.dto';
import { UpdateEstadoRemisionVentaDto } from './dto/update-estado-remision-venta.dto';
import { UpdateRemisionVentaDto } from './dto/update-remision-venta.dto';

type FindArgs = {
  idBodega?: number;
  idRemisionEdicion?: number;
};

type DetalleNormalizado = Array<{
  id_producto: number;
  precio_unitario: number;
  lotes: Array<{
    id_existencia: number;
    cantidad: number;
    iva: number;
  }>;
}>;

@Injectable()
export class RemisionesVentaService {
  constructor(private readonly prisma: PrismaService) { }

  private readonly remisionInclude =
    Prisma.validator<Prisma.remision_ventaInclude>()({
      orden_venta: {
        include: {
          cliente: true,
          bodega: true,
          estado_orden_venta: true,
          termino_pago: true,
          detalle_orden_venta: {
            include: {
              producto: {
                include: {
                  iva: true,
                  categoria_producto: true,
                },
              },
            },
          },
        },
      },
      cliente: true,
      estado_remision_venta: true,
      usuario: true,
      usuario_despacho: {
        select: {
          id_usuario: true,
          nombre: true,
          apellido: true,
        },
      },
      usuario_anulo: {
        select: {
          id_usuario: true,
          nombre: true,
          apellido: true,
        },
      },
      factura: true,
      detalle_remision_venta: {
        include: {
          existencias: {
            include: {
              producto: {
                include: {
                  iva: true,
                  categoria_producto: true,
                },
              },
              bodega: true,
            },
          },
        },
      },
    });

  private normalizeText(value?: string | null) {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private isEstadoAprobado(nombre?: string | null) {
    return this.normalizeText(nombre).includes('aprob');
  }

  private isEstadoPendiente(nombre?: string | null) {
    return this.normalizeText(nombre).includes('pend');
  }

  private isEstadoDespachado(nombre?: string | null) {
    const estado = this.normalizeText(nombre);
    return estado.includes('despach') || estado.includes('aprob');
  }

  private isEstadoEntregado(nombre?: string | null) {
    return this.normalizeText(nombre).includes('entreg');
  }

  private isEstadoAnulado(nombre?: string | null) {
    return this.normalizeText(nombre).includes('anulad');
  }

  private isEstadoFacturado(nombre?: string | null) {
    return this.normalizeText(nombre).includes('factur');
  }

  private decodeFirmaDigital(dataUrl?: string | null) {
    const value = String(dataUrl ?? '').trim();

    if (!value) {
      throw new BadRequestException(
        'Debes capturar la firma del cliente para marcar la remisión como entregada',
      );
    }

    const match = value.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);

    if (!match?.[1]) {
      throw new BadRequestException('La firma digital enviada no tiene un formato válido');
    }

    const buffer = Buffer.from(match[1], 'base64');

    if (!buffer.length) {
      throw new BadRequestException('La firma digital enviada está vacía');
    }

    return buffer;
  }

  private async assertBodegaExists(
    db: Prisma.TransactionClient | PrismaService,
    idBodega?: number,
  ) {
    if (idBodega === undefined) return;

    const bodega = await db.bodega.findUnique({
      where: { id_bodega: idBodega },
      select: { id_bodega: true },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega no existe');
    }
  }

  private async assertEstadoRemisionExists(
    db: Prisma.TransactionClient | PrismaService,
    idEstado: number,
  ) {
    const estado = await db.estado_remision_venta.findUnique({
      where: { id_estado_remision_venta: idEstado },
      select: {
        id_estado_remision_venta: true,
        nombre_estado: true,
      },
    });

    if (!estado) {
      throw new NotFoundException('Estado de remisión de venta no existe');
    }

    return estado;
  }

  private async assertUsuarioExists(
    db: Prisma.TransactionClient | PrismaService,
    idUsuario: number,
  ) {
    const usuario = await db.usuario.findUnique({
      where: { id_usuario: idUsuario },
      select: { id_usuario: true },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no existe');
    }
  }

  private firmaBufferToDataUrl(
    firma?: Buffer | Uint8Array | number[] | null,
  ) {
    if (!firma) return null;

    const buffer = Buffer.isBuffer(firma)
      ? firma
      : Buffer.from(firma);

    if (!buffer.length) return null;

    return `data:image/png;base64,${buffer.toString('base64')}`;
  }

  private serializarRemision(remision: any) {
    if (!remision) return remision;

    return {
      ...remision,
      firma_digital: this.firmaBufferToDataUrl(remision.firma_digital),
    };
  }

  private decimalToNumber(value: unknown) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private getDisponibleExistencia(existencia: {
    cantidad?: unknown;
    cantidad_reservada?: unknown;
  }) {
    return Math.max(
      this.decimalToNumber(existencia.cantidad) -
      this.decimalToNumber(existencia.cantidad_reservada),
      0,
    );
  }

  private async reservarExistencia(
    tx: Prisma.TransactionClient,
    idExistencia: number,
    cantidad: number,
  ) {
    const rows = await tx.$queryRaw<
      Array<{
        id_existencia: number;
        cantidad: any;
        cantidad_reservada: any;
        lote: string | null;
      }>
    >`
    SELECT 
      id_existencia,
      cantidad,
      cantidad_reservada,
      lote
    FROM existencias
    WHERE id_existencia = ${idExistencia}
    FOR UPDATE
  `;

    const existencia = rows[0];

    if (!existencia) {
      throw new NotFoundException(`Existencia ${idExistencia} no existe`);
    }

    const disponible = this.getDisponibleExistencia(existencia);

    if (cantidad > disponible) {
      throw new BadRequestException(
        `La existencia ${idExistencia} no tiene cantidad suficiente. Disponible: ${disponible}`,
      );
    }

    await tx.existencias.update({
      where: { id_existencia: idExistencia },
      data: {
        cantidad_reservada: {
          increment: cantidad,
        },
      },
    });
  }

  private async liberarReservasRemision(
    tx: Prisma.TransactionClient,
    idRemisionVenta: number,
  ) {
    const detalles = await tx.detalle_remision_venta.findMany({
      where: { id_remision_venta: idRemisionVenta },
      select: {
        id_existencia: true,
        cantidad: true,
      },
    });

    for (const detalle of detalles) {
      const cantidad = this.decimalToNumber(detalle.cantidad);

      if (cantidad <= 0) continue;

      await tx.existencias.update({
        where: { id_existencia: detalle.id_existencia },
        data: {
          cantidad_reservada: {
            decrement: cantidad,
          },
        },
      });
    }
  }

  private async confirmarEntregaRemision(
    tx: Prisma.TransactionClient,
    idRemisionVenta: number,
  ) {
    const detalles = await tx.detalle_remision_venta.findMany({
      where: { id_remision_venta: idRemisionVenta },
      select: {
        id_existencia: true,
        cantidad: true,
      },
    });

    for (const detalle of detalles) {
      const cantidad = this.decimalToNumber(detalle.cantidad);

      if (cantidad <= 0) continue;

      const rows = await tx.$queryRaw<
        Array<{
          id_existencia: number;
          cantidad: any;
          cantidad_reservada: any;
        }>
      >`
      SELECT 
        id_existencia,
        cantidad,
        cantidad_reservada
      FROM existencias
      WHERE id_existencia = ${detalle.id_existencia}
      FOR UPDATE
    `;

      const existencia = rows[0];

      if (!existencia) {
        throw new NotFoundException(
          `Existencia ${detalle.id_existencia} no existe`,
        );
      }

      const cantidadActual = this.decimalToNumber(existencia.cantidad);
      const cantidadReservada = this.decimalToNumber(
        existencia.cantidad_reservada,
      );

      if (cantidad > cantidadActual) {
        throw new BadRequestException(
          `La existencia ${detalle.id_existencia} no tiene cantidad suficiente para entregar`,
        );
      }

      if (cantidad > cantidadReservada) {
        throw new BadRequestException(
          `La existencia ${detalle.id_existencia} no tiene reserva suficiente para entregar`,
        );
      }

      await tx.existencias.update({
        where: { id_existencia: detalle.id_existencia },
        data: {
          cantidad: {
            decrement: cantidad,
          },
          cantidad_reservada: {
            decrement: cantidad,
          },
        },
      });
    }
  }

  private async getOrdenAprobada(
    db: Prisma.TransactionClient | PrismaService,
    idOrdenVenta: number,
  ) {
    const orden = await db.orden_venta.findUnique({
      where: { id_orden_venta: idOrdenVenta },
      include: {
        cliente: true,
        bodega: true,
        estado_orden_venta: true,
        detalle_orden_venta: {
          include: {
            producto: {
              include: {
                iva: true,
                categoria_producto: true,
              },
            },
          },
        },
        remision_venta: {
          include: {
            estado_remision_venta: true,
            detalle_remision_venta: {
              include: {
                existencias: true,
              },
            },
          },
        },
      },
    });

    if (!orden) {
      throw new NotFoundException('Orden de venta no existe');
    }

    if (!this.isEstadoAprobado(orden.estado_orden_venta?.nombre_estado)) {
      throw new BadRequestException(
        'Solo se pueden crear o editar remisiones desde órdenes aprobadas',
      );
    }

    return orden;
  }

  private async getPrecioMinimoVentaProducto(
    db: Prisma.TransactionClient | PrismaService,
    idProducto: number,
    idBodega: number,
  ) {
    const ultimaRemisionCompra = await db.remision_compra.findFirst({
      where: {
        id_bodega: idBodega,
        detalle_remision_compra: {
          some: {
            id_producto: idProducto,
          },
        },
        NOT: {
          estado_remision_compra: {
            nombre_estado: {
              contains: 'anulad',
            },
          },
        },
      },
      orderBy: [{ fecha_creacion: 'desc' }, { id_remision_compra: 'desc' }],
      select: {
        detalle_remision_compra: {
          where: {
            id_producto: idProducto,
          },
          orderBy: {
            id_detalle_remision_compra: 'desc',
          },
          take: 1,
          select: {
            precio_unitario: true,
          },
        },
      },
    });

    const precio = Number(
      ultimaRemisionCompra?.detalle_remision_compra?.[0]?.precio_unitario ?? 0,
    );

    return precio > 0 ? precio : null;
  }

  private buildCantidadesRemitidasPorProducto(
    orden: Awaited<ReturnType<RemisionesVentaService['getOrdenAprobada']>>,
    ignoreRemisionId?: number,
  ) {
    const remitidoPorProducto = new Map<number, number>();

    for (const remision of orden.remision_venta ?? []) {
      if (
        ignoreRemisionId &&
        Number(remision.id_remision_venta) === Number(ignoreRemisionId)
      ) {
        continue;
      }

      if (this.isEstadoAnulado(remision.estado_remision_venta?.nombre_estado)) {
        continue;
      }

      for (const detalle of remision.detalle_remision_venta ?? []) {
        const idProducto = Number(detalle.existencias?.id_producto);
        const cantidad = Number(detalle.cantidad ?? 0);

        remitidoPorProducto.set(
          idProducto,
          Number(remitidoPorProducto.get(idProducto) ?? 0) + cantidad,
        );
      }
    }

    return remitidoPorProducto;
  }

  private async validarDetalleYExistencias(
    db: Prisma.TransactionClient | PrismaService,
    orden: Awaited<ReturnType<RemisionesVentaService['getOrdenAprobada']>>,
    detalle: CreateRemisionVentaDto['detalle'],
    ignoreRemisionId?: number,
  ): Promise<DetalleNormalizado> {
    if (!Array.isArray(detalle) || detalle.length === 0) {
      throw new BadRequestException(
        'Debes enviar al menos un producto en la remisión',
      );
    }

    const detalleOrdenMap = new Map(
      orden.detalle_orden_venta.map((item) => [
        Number(item.id_producto),
        {
          id_producto: Number(item.id_producto),
          cantidad: Number(item.cantidad ?? 0),
          precio_unitario: Number(item.precio_unitario ?? 0),
        },
      ]),
    );

    const remitidoPorProducto = this.buildCantidadesRemitidasPorProducto(
      orden,
      ignoreRemisionId,
    );

    const productosYaEnRequest = new Set<number>();
    const normalizado: DetalleNormalizado = [];

    for (const item of detalle) {
      const idProducto = Number(item.id_producto);

      if (productosYaEnRequest.has(idProducto)) {
        throw new BadRequestException(
          `El producto ${idProducto} está repetido en la remisión`,
        );
      }

      productosYaEnRequest.add(idProducto);

      const detalleOrden = detalleOrdenMap.get(idProducto);

      if (!detalleOrden) {
        throw new BadRequestException(
          `El producto ${idProducto} no pertenece a la orden de venta`,
        );
      }

      if (!Array.isArray(item.lotes) || item.lotes.length === 0) {
        throw new BadRequestException(
          `Debes seleccionar al menos un lote para el producto ${idProducto}`,
        );
      }

      const cantidadSolicitadaProducto = item.lotes.reduce(
        (acc, lote) => acc + Number(lote.cantidad ?? 0),
        0,
      );

      const cantidadYaRemitida = Number(remitidoPorProducto.get(idProducto) ?? 0);
      const cantidadPendiente =
        Number(detalleOrden.cantidad) - cantidadYaRemitida;

      if (cantidadSolicitadaProducto <= 0) {
        throw new BadRequestException(
          `La cantidad del producto ${idProducto} debe ser mayor a cero`,
        );
      }

      if (cantidadSolicitadaProducto > cantidadPendiente) {
        throw new BadRequestException(
          `La cantidad remitida del producto ${idProducto} supera la cantidad pendiente de la orden`,
        );
      }

      const lotesYaUsados = new Set<number>();
      const lotesNormalizados: DetalleNormalizado[number]['lotes'] = [];

      for (const lote of item.lotes) {
        const idExistencia = Number(lote.id_existencia);
        const cantidadSolicitada = Number(lote.cantidad ?? 0);

        if (lotesYaUsados.has(idExistencia)) {
          throw new BadRequestException(
            `La existencia ${idExistencia} está repetida para el producto ${idProducto}`,
          );
        }

        lotesYaUsados.add(idExistencia);

        const existencia = await db.existencias.findUnique({
          where: { id_existencia: idExistencia },
          include: {
            producto: {
              include: {
                iva: true,
              },
            },
            bodega: true,
          },
        });

        if (!existencia) {
          throw new NotFoundException(`Existencia ${idExistencia} no existe`);
        }

        if (existencia.id_producto !== idProducto) {
          throw new BadRequestException(
            `La existencia ${idExistencia} no corresponde al producto ${idProducto}`,
          );
        }

        if (existencia.id_bodega !== orden.id_bodega) {
          throw new BadRequestException(
            `La existencia ${idExistencia} no pertenece a la bodega de la orden`,
          );
        }

        if (cantidadSolicitada <= 0) {
          throw new BadRequestException(
            `La cantidad para la existencia ${idExistencia} debe ser mayor a cero`,
          );
        }

        const disponible = this.getDisponibleExistencia(existencia);

        if (cantidadSolicitada > disponible) {
          throw new BadRequestException(
            `La existencia ${idExistencia} no tiene cantidad suficiente. Disponible: ${disponible}`,
          );
        }

        lotesNormalizados.push({
          id_existencia: idExistencia,
          cantidad: cantidadSolicitada,
          iva: Number(existencia.producto?.iva?.porcentaje ?? 0),
        });
      }

      normalizado.push({
        id_producto: idProducto,
        precio_unitario: Number(detalleOrden.precio_unitario),
        lotes: lotesNormalizados,
      });
    }

    return normalizado;
  }

  private async aplicarDetalleRemision(
    tx: Prisma.TransactionClient,
    idRemisionVenta: number,
    detalle: DetalleNormalizado,
  ) {
    for (const item of detalle) {
      for (const lote of item.lotes) {
        await tx.detalle_remision_venta.create({
          data: {
            id_remision_venta: idRemisionVenta,
            id_existencia: lote.id_existencia,
            cantidad: lote.cantidad,
            precio_unitario: item.precio_unitario,
            iva: lote.iva,
          },
        });

        await this.reservarExistencia(
          tx,
          lote.id_existencia,
          lote.cantidad,
        );
      }
    }
  }

  private async restaurarInventarioDeRemision(
    db: Prisma.TransactionClient | PrismaService,
    idRemisionVenta: number,
  ) {
    const detalleActual = await db.detalle_remision_venta.findMany({
      where: { id_remision_venta: idRemisionVenta },
      select: {
        id_existencia: true,
        cantidad: true,
      },
    });

    for (const detalle of detalleActual) {
      const cantidad = this.decimalToNumber(detalle.cantidad);

      if (cantidad <= 0) continue;

      await db.existencias.update({
        where: { id_existencia: detalle.id_existencia },
        data: {
          cantidad_reservada: {
            decrement: cantidad,
          },
        },
      });
    }
  }

  private async mapOrdenesCatalogo(args?: FindArgs) {
    await this.assertBodegaExists(this.prisma, args?.idBodega);

    const ordenes = await this.prisma.orden_venta.findMany({
      where:
        args?.idBodega !== undefined
          ? { id_bodega: args.idBodega }
          : undefined,
      orderBy: { id_orden_venta: 'desc' },
      include: {
        cliente: true,
        bodega: true,
        estado_orden_venta: true,
        detalle_orden_venta: {
          include: {
            producto: {
              include: {
                iva: true,
                categoria_producto: true,
              },
            },
          },
        },
        remision_venta: {
          include: {
            estado_remision_venta: true,
            detalle_remision_venta: {
              include: {
                existencias: true,
              },
            },
          },
        },
      },
    });

    const ordenesAprobadas = ordenes.filter((orden) =>
      this.isEstadoAprobado(orden.estado_orden_venta?.nombre_estado),
    );

    const productoIds = [
      ...new Set(
        ordenesAprobadas.flatMap((orden) =>
          orden.detalle_orden_venta.map((item) => item.id_producto),
        ),
      ),
    ];

    const bodegaIds = [
      ...new Set(ordenesAprobadas.map((orden) => Number(orden.id_bodega))),
    ];

    const existencias = await this.prisma.existencias.findMany({
      where: {
        id_producto: { in: productoIds.length ? productoIds : [0] },
        id_bodega: { in: bodegaIds.length ? bodegaIds : [0] },
      },
      include: {
        producto: {
          include: {
            iva: true,
            categoria_producto: true,
          },
        },
        bodega: true,
      },
      orderBy: [{ id_producto: 'asc' }, { id_existencia: 'asc' }],
    });

    return ordenesAprobadas
      .map((orden) => {
        const remitidoPorProducto = this.buildCantidadesRemitidasPorProducto(
          orden as any,
          args?.idRemisionEdicion,
        );

        const detalle = orden.detalle_orden_venta
          .map((item) => {
            const cantidadOrden = Number(item.cantidad ?? 0);
            const cantidadRemitida = Number(
              remitidoPorProducto.get(item.id_producto) ?? 0,
            );
            const cantidadPendiente = Math.max(
              0,
              cantidadOrden - cantidadRemitida,
            );

            const existenciasProducto = existencias
              .map((ex) => {
                const cantidadReservadaActual =
                  orden.remision_venta
                    ?.filter((rv) =>
                      args?.idRemisionEdicion
                        ? Number(rv.id_remision_venta) === Number(args.idRemisionEdicion)
                        : false,
                    )
                    .flatMap((rv) => rv.detalle_remision_venta ?? [])
                    .filter(
                      (detalle) =>
                        Number(detalle.id_existencia) === Number(ex.id_existencia),
                    )
                    .reduce(
                      (acc, detalle) => acc + Number(detalle.cantidad ?? 0),
                      0,
                    ) ?? 0;

                const disponible =
                  this.getDisponibleExistencia(ex) + cantidadReservadaActual;

                return {
                  ex,
                  disponible,
                };
              })
              .filter(
                ({ ex, disponible }) =>
                  ex.id_bodega === orden.id_bodega &&
                  ex.id_producto === item.id_producto &&
                  disponible > 0,
              )
              .map(({ ex, disponible }) => ({
                id_existencia: ex.id_existencia,
                id_producto: ex.id_producto,
                lote: ex.lote ?? '',
                codigo_barras: ex.codigo_barras ?? '',
                fecha_vencimiento: ex.fecha_vencimiento,
                cantidad_disponible: disponible,
                bodega: ex.bodega,
                producto: ex.producto,
              }));

            return {
              id_producto: item.id_producto,
              cantidad_orden: cantidadOrden,
              cantidad_remitida: cantidadRemitida,
              cantidad_pendiente: cantidadPendiente,
              precio_unitario: Number(item.precio_unitario ?? 0),
              producto: item.producto,
              existencias_disponibles: existenciasProducto,
            };
          })
          .filter((item) => item.cantidad_pendiente > 0);

        const cantidadPendienteTotal = detalle.reduce(
          (acc, item) => acc + item.cantidad_pendiente,
          0,
        );

        return {
          id_orden_venta: orden.id_orden_venta,
          codigo_orden_venta:
            orden.codigo_orden_venta ||
            `OV-${String(orden.id_orden_venta).padStart(4, '0')}`,
          fecha_creacion: orden.fecha_creacion,
          fecha_vencimiento: orden.fecha_vencimiento,
          cliente: orden.cliente,
          bodega: orden.bodega,
          estado_orden_venta: orden.estado_orden_venta,
          detalle,
          cantidad_pendiente_total: cantidadPendienteTotal,
        };
      })
      .filter((orden) => orden.detalle.length > 0);
  }

  async findCatalogos(args?: FindArgs) {
    const [estados, ordenes] = await Promise.all([
      this.prisma.estado_remision_venta.findMany({
        orderBy: { id_estado_remision_venta: 'asc' },
      }),
      this.mapOrdenesCatalogo(args),
    ]);

    return {
      estados,
      ordenes,
    };
  }


  async create(dto: CreateRemisionVentaDto) {
    return this.prisma.$transaction(async (tx) => {
      const orden = await this.getOrdenAprobada(tx, dto.id_orden_venta);

      const estadoRemision = await this.assertEstadoRemisionExists(
        tx,
        dto.id_estado_remision_venta,
      );

      await this.assertUsuarioExists(tx, dto.id_usuario_creador);

      const detalleNormalizado = await this.validarDetalleYExistencias(
        tx,
        orden,
        dto.detalle,
      );

      const remision = await tx.remision_venta.create({
        data: {
          fecha_creacion: new Date(dto.fecha_creacion),
          fecha_vencimiento: dto.fecha_vencimiento
            ? new Date(dto.fecha_vencimiento)
            : null,
          observaciones: dto.observaciones ?? null,
          id_orden_venta: dto.id_orden_venta,
          id_cliente: orden.id_cliente,
          id_estado_remision_venta: estadoRemision.id_estado_remision_venta,
          id_usuario_creador: dto.id_usuario_creador,
          id_factura: null,
        },
      });

      await this.aplicarDetalleRemision(
        tx,
        remision.id_remision_venta,
        detalleNormalizado,
      );

      return tx.remision_venta.update({
        where: { id_remision_venta: remision.id_remision_venta },
        data: {
          codigo_remision_venta: `RV-${String(remision.id_remision_venta).padStart(4, '0')}`,
        },
        include: this.remisionInclude,
      });
    });
  }

  async update(id: number, dto: UpdateRemisionVentaDto) {
    return this.prisma.$transaction(async (tx) => {
      const remisionActual = await tx.remision_venta.findUnique({
        where: { id_remision_venta: id },
        include: {
          estado_remision_venta: true,
          detalle_remision_venta: {
            include: {
              existencias: true,
            },
          },
          factura: true,
        },
      });

      if (!remisionActual) {
        throw new NotFoundException('Remisión de venta no existe');
      }

      if (this.isEstadoAnulado(remisionActual.estado_remision_venta?.nombre_estado)) {
        throw new BadRequestException(
          'No se puede editar una remisión anulada',
        );
      }

      if (this.isEstadoEntregado(remisionActual.estado_remision_venta?.nombre_estado)) {
        throw new BadRequestException(
          'No se puede editar una remisión entregada',
        );
      }

      if (
        this.isEstadoFacturado(remisionActual.estado_remision_venta?.nombre_estado) ||
        remisionActual.id_factura
      ) {
        throw new BadRequestException(
          'No se puede editar una remisión facturada',
        );
      }


      const orden = await this.getOrdenAprobada(tx, dto.id_orden_venta);

      const estadoRemision = await this.assertEstadoRemisionExists(
        tx,
        dto.id_estado_remision_venta,
      );
      await this.assertUsuarioExists(tx, dto.id_usuario_creador);

      await this.restaurarInventarioDeRemision(tx, id);

      await tx.detalle_remision_venta.deleteMany({
        where: { id_remision_venta: id },
      });

      const detalleNormalizado = await this.validarDetalleYExistencias(
        tx,
        orden,
        dto.detalle,
        id,
      );

      await tx.remision_venta.update({
        where: { id_remision_venta: id },
        data: {
          fecha_creacion: new Date(dto.fecha_creacion),
          fecha_vencimiento: dto.fecha_vencimiento
            ? new Date(dto.fecha_vencimiento)
            : null,
          observaciones: dto.observaciones ?? null,
          id_orden_venta: dto.id_orden_venta,
          id_cliente: orden.id_cliente,
          id_estado_remision_venta: estadoRemision.id_estado_remision_venta,
          id_usuario_creador: dto.id_usuario_creador,
        },
      });

      await this.aplicarDetalleRemision(tx, id, detalleNormalizado);

      return tx.remision_venta.findUnique({
        where: { id_remision_venta: id },
        include: this.remisionInclude,
      });
    });
  }

  async findAll(args: FindArgs) {
    await this.assertBodegaExists(this.prisma, args?.idBodega);

    const remisiones = await this.prisma.remision_venta.findMany({
      where:
        args?.idBodega !== undefined
          ? {
            orden_venta: {
              id_bodega: args.idBodega,
            },
          }
          : undefined,
      include: this.remisionInclude,
      orderBy: {
        id_remision_venta: 'desc',
      },
    });

    return remisiones.map((remision) => this.serializarRemision(remision));
  }

  async findOne(id: number) {
    const remision = await this.prisma.remision_venta.findUnique({
      where: { id_remision_venta: id },
      include: this.remisionInclude,
    });

    if (!remision) {
      throw new NotFoundException('Remisión de venta no existe');
    }

    return this.serializarRemision(remision);
  }

  async updateEstado(
    id: number,
    dto: UpdateEstadoRemisionVentaDto,
    idUsuarioGestion: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const remision = await tx.remision_venta.findUnique({
        where: { id_remision_venta: id },
        include: {
          cliente: true,
          estado_remision_venta: true,
          detalle_remision_venta: {
            include: {
              existencias: true,
            },
          },
        },
      });

      if (!remision) {
        throw new NotFoundException('Remisión de venta no existe');
      }

      await this.assertUsuarioExists(tx, idUsuarioGestion);

      const nuevoEstado = await this.assertEstadoRemisionExists(
        tx,
        dto.id_estado_remision_venta,
      );

      const estadoActualNombre = remision.estado_remision_venta?.nombre_estado;
      const nuevoEstadoNombre = nuevoEstado.nombre_estado;

      const nuevoEsAnulado = this.isEstadoAnulado(nuevoEstadoNombre);
      const nuevoEsDespachado = this.isEstadoDespachado(nuevoEstadoNombre);
      const nuevoEsEntregado = this.isEstadoEntregado(nuevoEstadoNombre);
      const nuevoEsFacturada = this.isEstadoFacturado(nuevoEstadoNombre);
      if (this.isEstadoAnulado(estadoActualNombre)) {
        throw new BadRequestException(
          'Una remisión anulada no puede cambiar de estado',
        );
      }

      if (remision.id_factura && nuevoEsAnulado) {
        throw new BadRequestException(
          'No puedes anular una remisión que ya está asociada a una factura',
        );
      }

      if (this.isEstadoFacturado(estadoActualNombre)) {
        throw new BadRequestException(
          'Una remisión facturada no puede cambiar de estado',
        );
      }

      if (this.isEstadoEntregado(estadoActualNombre)) {
        if (!nuevoEsFacturada) {
          throw new BadRequestException(
            'Una remisión entregada solo puede pasar a facturada',
          );
        }
      }

      if (this.isEstadoPendiente(estadoActualNombre)) {
        if (!nuevoEsDespachado && !nuevoEsAnulado) {
          throw new BadRequestException(
            'Una remisión pendiente solo puede pasar a despachado o anulado',
          );
        }
      }

      if (this.isEstadoDespachado(estadoActualNombre)) {
        if (!nuevoEsEntregado && !nuevoEsAnulado) {
          throw new BadRequestException(
            'Una remisión despachada solo puede pasar a entregado o anulado',
          );
        }
      }

      if (this.isEstadoEntregado(estadoActualNombre)) {
        if (!nuevoEsFacturada) {
          throw new BadRequestException(
            'Una remisión entregada solo puede pasar a facturada',
          );
        }
      }

      const data: Prisma.remision_ventaUncheckedUpdateInput = {
        id_estado_remision_venta: dto.id_estado_remision_venta,
      };

      if (nuevoEsDespachado) {
        data.fecha_despacho = new Date();
        data.id_usuario_despacho = idUsuarioGestion;
      }

      if (nuevoEsEntregado) {
        const nombreFirmante = String(dto.nombre_firmante ?? '').trim();

        if (!nombreFirmante) {
          throw new BadRequestException(
            'Debes ingresar el nombre de la persona que recibe la remisión',
          );
        }

        data.firma_digital = this.decodeFirmaDigital(dto.firma_digital);
        data.nombre_firmante = nombreFirmante;
        data.fecha_firma = new Date();
        await this.confirmarEntregaRemision(tx, id);
      }

      if (nuevoEsAnulado) {
        data.fecha_anulacion = new Date();
        data.id_usuario_anulo = idUsuarioGestion;

        await this.liberarReservasRemision(tx, id);
      }

      const remisionActualizada = await tx.remision_venta.update({
        where: { id_remision_venta: id },
        data,
        include: this.remisionInclude,
      });

      return this.serializarRemision(remisionActualizada);
    });
  }
}

