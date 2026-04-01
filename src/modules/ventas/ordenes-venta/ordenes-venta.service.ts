import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateOrdenVentaDto } from './dto/create-orden-venta.dto';
import { UpdateEstadoOrdenVentaDto } from './dto/update-estado-orden-venta.dto';
import { UpdateOrdenVentaDto } from './dto/update-orden-venta.dto';

type FindOrdenesArgs = {
  idBodega?: number;
};

type DetalleOrdenInput = Array<{
  id_producto: number;
  cantidad: number;
  precio_unitario: number;
}>;

@Injectable()
export class OrdenesVentaService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly ordenInclude = Prisma.validator<Prisma.orden_ventaInclude>()({
    cliente: true,
    bodega: true,
    estado_orden_venta: true,
    termino_pago: true,
    usuario: true,
    cotizacion: {
      include: {
        cliente: true,
        bodega: true,
        estado_cotizacion: true,
        detalle_cotizacion: {
          include: {
            producto: {
              include: {
                iva: true,
                categoria_producto: true,
              },
            },
            iva: true,
          },
        },
      },
    },
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
  });

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

  private async assertClienteExists(
    db: Prisma.TransactionClient | PrismaService,
    idCliente: number,
  ) {
    const cliente = await db.cliente.findUnique({
      where: { id_cliente: idCliente },
      select: { id_cliente: true },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no existe');
    }
  }

  private async assertEstadoExists(
    db: Prisma.TransactionClient | PrismaService,
    idEstado: number,
  ) {
    const estado = await db.estado_orden_venta.findUnique({
      where: { id_estado_orden_venta: idEstado },
      select: { id_estado_orden_venta: true },
    });

    if (!estado) {
      throw new NotFoundException('Estado de orden de venta no existe');
    }
  }

  private async assertTerminoPagoExists(
    db: Prisma.TransactionClient | PrismaService,
    idTerminoPago: number,
  ) {
    const terminoPago = await db.termino_pago.findUnique({
      where: { id_termino_pago: idTerminoPago },
      select: { id_termino_pago: true },
    });

    if (!terminoPago) {
      throw new NotFoundException('Término de pago no existe');
    }
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

  private assertDetalleManualValido(detalle: DetalleOrdenInput) {
    if (!Array.isArray(detalle) || detalle.length === 0) {
      throw new BadRequestException(
        'Debes enviar detalle si la orden no viene desde una cotización',
      );
    }

    const productos = new Set<number>();

    for (const item of detalle) {
      if (!item?.id_producto || Number(item.id_producto) <= 0) {
        throw new BadRequestException('Cada item debe tener un id_producto válido');
      }

      if (!item?.cantidad || Number(item.cantidad) <= 0) {
        throw new BadRequestException('La cantidad debe ser mayor a cero');
      }

      if (!item?.precio_unitario || Number(item.precio_unitario) <= 0) {
        throw new BadRequestException(
          'El precio unitario debe ser mayor a cero',
        );
      }

      if (productos.has(Number(item.id_producto))) {
        throw new BadRequestException(
          `El producto ${item.id_producto} está repetido en el detalle`,
        );
      }

      productos.add(Number(item.id_producto));
    }
  }

  private async assertProductosDetalleExisten(
    db: Prisma.TransactionClient | PrismaService,
    detalle: DetalleOrdenInput,
  ) {
    const ids = [...new Set(detalle.map((item) => Number(item.id_producto)))];

    const productos = await db.producto.findMany({
      where: {
        id_producto: {
          in: ids,
        },
      },
      select: {
        id_producto: true,
      },
    });

    const encontrados = new Set(productos.map((item) => item.id_producto));

    for (const id of ids) {
      if (!encontrados.has(id)) {
        throw new NotFoundException(`Producto ${id} no existe`);
      }
    }
  }

  private async construirDetalleDesdeCotizacion(
    db: Prisma.TransactionClient | PrismaService,
    idCotizacion: number,
    idCliente: number,
    idBodega: number,
    idOrdenActual?: number,
  ): Promise<DetalleOrdenInput> {
    const cotizacion = await db.cotizacion.findUnique({
      where: { id_cotizacion: idCotizacion },
      include: {
        estado_cotizacion: true,
        detalle_cotizacion: {
          include: {
            producto: true,
          },
        },
      },
    });

    if (!cotizacion) {
      throw new NotFoundException('Cotización no existe');
    }

    if (cotizacion.id_cliente !== idCliente) {
      throw new BadRequestException(
        'La cotización no pertenece al cliente enviado',
      );
    }

    if (cotizacion.id_bodega !== idBodega) {
      throw new BadRequestException(
        'La cotización no pertenece a la bodega enviada',
      );
    }

    const estadoNombre = (
      cotizacion.estado_cotizacion?.nombre_estado || ''
    ).toLowerCase();

    if (
      estadoNombre.includes('anulada') ||
      estadoNombre.includes('rechazada') ||
      estadoNombre.includes('vencida')
    ) {
      throw new BadRequestException(
        'La cotización seleccionada no se puede usar para generar la orden',
      );
    }

    const ordenExistente = await db.orden_venta.findFirst({
      where: {
        id_cotizacion: idCotizacion,
        ...(idOrdenActual
          ? {
              NOT: {
                id_orden_venta: idOrdenActual,
              },
            }
          : {}),
      },
      select: {
        id_orden_venta: true,
      },
    });

    if (ordenExistente) {
      throw new BadRequestException(
        'Esa cotización ya está asociada a otra orden de venta',
      );
    }

    if (!cotizacion.detalle_cotizacion.length) {
      throw new BadRequestException(
        'La cotización no tiene detalle para generar la orden',
      );
    }

    return cotizacion.detalle_cotizacion.map((item) => ({
      id_producto: Number(item.id_producto),
      cantidad: Number(item.cantidad),
      precio_unitario: Number(item.precio_unitario),
    }));
  }

  private async reemplazarDetalleOrden(
    db: Prisma.TransactionClient | PrismaService,
    idOrdenVenta: number,
    detalle: DetalleOrdenInput,
  ) {
    await db.detalle_orden_venta.deleteMany({
      where: { id_orden_venta: idOrdenVenta },
    });

    for (const item of detalle) {
      await db.detalle_orden_venta.create({
        data: {
          id_orden_venta: idOrdenVenta,
          id_producto: Number(item.id_producto),
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario),
        },
      });
    }
  }

  async findCatalogos(args?: FindOrdenesArgs) {
    await this.assertBodegaExists(this.prisma, args?.idBodega);

    const [clientes, productos, terminosPago, estados, cotizaciones] =
      await Promise.all([
        this.prisma.cliente.findMany({
          where: { estado: true },
          orderBy: { nombre_cliente: 'asc' },
          include: {
            tipo_documento: true,
            tipo_cliente: true,
            municipios: true,
          },
        }),
        this.prisma.producto.findMany({
          where: { estado: true },
          orderBy: { nombre_producto: 'asc' },
          include: {
            iva: true,
            categoria_producto: true,
          },
        }),
        this.prisma.termino_pago.findMany({
          orderBy: { id_termino_pago: 'asc' },
        }),
        this.prisma.estado_orden_venta.findMany({
          orderBy: { id_estado_orden_venta: 'asc' },
        }),
        this.prisma.cotizacion.findMany({
          where:
            args?.idBodega !== undefined
              ? { id_bodega: args.idBodega }
              : undefined,
          orderBy: { id_cotizacion: 'desc' },
          include: {
            cliente: true,
            bodega: true,
            estado_cotizacion: true,
            detalle_cotizacion: {
              include: {
                producto: {
                  include: {
                    iva: true,
                    categoria_producto: true,
                  },
                },
                iva: true,
              },
            },
            orden_venta: {
              select: {
                id_orden_venta: true,
              },
            },
          },
        }),
      ]);

    return {
      clientes,
      productos,
      terminos_pago: terminosPago,
      estados,
      cotizaciones,
    };
  }

  async create(dto: CreateOrdenVentaDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertClienteExists(tx, dto.id_cliente);
      await this.assertBodegaExists(tx, dto.id_bodega);
      await this.assertEstadoExists(tx, dto.id_estado_orden_venta);
      await this.assertTerminoPagoExists(tx, dto.id_termino_pago);
      await this.assertUsuarioExists(tx, dto.id_usuario);

      let detalleFinal: DetalleOrdenInput;

      if (dto.id_cotizacion) {
        detalleFinal = await this.construirDetalleDesdeCotizacion(
          tx,
          dto.id_cotizacion,
          dto.id_cliente,
          dto.id_bodega,
        );
      } else {
        this.assertDetalleManualValido(dto.detalle ?? []);
        await this.assertProductosDetalleExisten(tx, dto.detalle ?? []);
        detalleFinal = (dto.detalle ?? []).map((item) => ({
          id_producto: Number(item.id_producto),
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario),
        }));
      }

      const orden = await tx.orden_venta.create({
        data: {
          fecha_creacion: new Date(dto.fecha_creacion),
          fecha_vencimiento: dto.fecha_vencimiento
            ? new Date(dto.fecha_vencimiento)
            : null,
          descripcion: dto.descripcion ?? null,
          id_cliente: dto.id_cliente,
          id_bodega: dto.id_bodega,
          id_estado_orden_venta: dto.id_estado_orden_venta,
          id_termino_pago: dto.id_termino_pago,
          id_usuario: dto.id_usuario,
          id_cotizacion: dto.id_cotizacion ?? null,
        },
      });

      await this.reemplazarDetalleOrden(tx, orden.id_orden_venta, detalleFinal);

      return tx.orden_venta.update({
        where: { id_orden_venta: orden.id_orden_venta },
        data: {
          codigo_orden_venta: `OV-${String(orden.id_orden_venta).padStart(4, '0')}`,
        },
        include: this.ordenInclude,
      });
    });
  }

  async findAll(args?: FindOrdenesArgs) {
    await this.assertBodegaExists(this.prisma, args?.idBodega);

    return this.prisma.orden_venta.findMany({
      where:
        args?.idBodega !== undefined
          ? { id_bodega: args.idBodega }
          : undefined,
      include: this.ordenInclude,
      orderBy: {
        id_orden_venta: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const orden = await this.prisma.orden_venta.findUnique({
      where: { id_orden_venta: id },
      include: this.ordenInclude,
    });

    if (!orden) {
      throw new NotFoundException('Orden de venta no existe');
    }

    return orden;
  }

  async update(id: number, dto: UpdateOrdenVentaDto) {
    return this.prisma.$transaction(async (tx) => {
      const ordenActual = await tx.orden_venta.findUnique({
        where: { id_orden_venta: id },
        include: {
          detalle_orden_venta: true,
        },
      });

      if (!ordenActual) {
        throw new NotFoundException('Orden de venta no existe');
      }

      const idClienteFinal = dto.id_cliente ?? ordenActual.id_cliente;
      const idBodegaFinal = dto.id_bodega ?? ordenActual.id_bodega;
      const idEstadoFinal =
        dto.id_estado_orden_venta ?? ordenActual.id_estado_orden_venta;
      const idTerminoPagoFinal =
        dto.id_termino_pago ?? ordenActual.id_termino_pago;
      const idUsuarioFinal = dto.id_usuario ?? ordenActual.id_usuario;
      const idCotizacionFinal = dto.id_cotizacion ?? null;

      await this.assertClienteExists(tx, idClienteFinal);
      await this.assertBodegaExists(tx, idBodegaFinal);
      await this.assertEstadoExists(tx, idEstadoFinal);
      await this.assertTerminoPagoExists(tx, idTerminoPagoFinal);
      await this.assertUsuarioExists(tx, idUsuarioFinal);

      let detalleFinal: DetalleOrdenInput;

      if (idCotizacionFinal) {
        detalleFinal = await this.construirDetalleDesdeCotizacion(
          tx,
          idCotizacionFinal,
          idClienteFinal,
          idBodegaFinal,
          id,
        );
      } else if (dto.detalle && dto.detalle.length > 0) {
        this.assertDetalleManualValido(dto.detalle);
        await this.assertProductosDetalleExisten(tx, dto.detalle);
        detalleFinal = dto.detalle.map((item) => ({
          id_producto: Number(item.id_producto),
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario),
        }));
      } else if (ordenActual.detalle_orden_venta.length > 0) {
        detalleFinal = ordenActual.detalle_orden_venta.map((item) => ({
          id_producto: Number(item.id_producto),
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario),
        }));
      } else {
        throw new BadRequestException(
          'La orden debe tener detalle o una cotización asociada',
        );
      }

      await tx.orden_venta.update({
        where: { id_orden_venta: id },
        data: {
          fecha_creacion: dto.fecha_creacion
            ? new Date(dto.fecha_creacion)
            : undefined,
          fecha_vencimiento:
            dto.fecha_vencimiento === null
              ? null
              : dto.fecha_vencimiento
                ? new Date(dto.fecha_vencimiento)
                : undefined,
          descripcion:
            dto.descripcion !== undefined ? (dto.descripcion ?? null) : undefined,
          id_cliente: idClienteFinal,
          id_bodega: idBodegaFinal,
          id_estado_orden_venta: idEstadoFinal,
          id_termino_pago: idTerminoPagoFinal,
          id_usuario: idUsuarioFinal,
          id_cotizacion: idCotizacionFinal,
        },
      });

      await this.reemplazarDetalleOrden(tx, id, detalleFinal);

      return tx.orden_venta.findUnique({
        where: { id_orden_venta: id },
        include: this.ordenInclude,
      });
    });
  }

  async updateEstado(id: number, dto: UpdateEstadoOrdenVentaDto) {
    const orden = await this.prisma.orden_venta.findUnique({
      where: { id_orden_venta: id },
      select: { id_orden_venta: true },
    });

    if (!orden) {
      throw new NotFoundException('Orden de venta no existe');
    }

    await this.assertEstadoExists(this.prisma, dto.id_estado_orden_venta);

    return this.prisma.orden_venta.update({
      where: { id_orden_venta: id },
      data: {
        id_estado_orden_venta: dto.id_estado_orden_venta,
      },
      include: this.ordenInclude,
    });
  }
}