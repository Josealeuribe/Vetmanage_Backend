import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRemisionCompraDto } from './dto/create-remision-compra.dto';
import { UpdateRemisionCompraDto } from './dto/update-remision-compra.dto';
import { CambiarEstadoRemisionCompraDto } from './dto/estado-remision-compra.dto';
import {
  remisionCompraDetailSelect,
  remisionCompraListSelect,
} from './selects/remisiones-compra.select';

type CreateOpts = {
  idUsuario: number;
  idBodegaActiva?: number | null;
  bodegasPermitidas?: number[];
};

type ScopeOpts = {
  idUsuario: number;
  bodegasPermitidas?: number[];
};

type UpdateOpts = {
  idUsuario: number;
  bodegasPermitidas?: number[];
};

type FindAllArgs = {
  idUsuario: number;
  idBodegaActiva?: number | null;
  bodegasPermitidas?: number[];
  idCompra?: number;
  idBodega?: number;
};

type CompraContextoOpts = {
  idUsuario: number;
  idBodegaActiva?: number | null;
  bodegasPermitidas?: number[];
};

const compraContextoSelect = Prisma.validator<Prisma.comprasSelect>()({
  id_compra: true,
  codigo_compra: true,
  id_bodega: true,
  id_proveedor: true,
  bodega: {
    select: {
      id_bodega: true,
      nombre_bodega: true,
    },
  },
  proveedor: {
    select: {
      id_proveedor: true,
      nombre_empresa: true,
      num_documento: true,
      id_tipo_doc: true,
      tipo_documento: {
        select: {
          id_tipo_doc: true,
          nombre_doc: true,
        },
      },
    },
  },
  detalle_compra: {
    select: {
      id_producto: true,
      cantidad: true,
      precio_unitario: true,
      id_iva: true,
      producto: {
        select: {
          id_producto: true,
          nombre_producto: true,
        },
      },
      iva: {
        select: {
          id_iva: true,
          porcentaje: true,
        },
      },
    },
  },
});

@Injectable()
export class RemisionesCompraService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================
  // Helpers generales
  // =========================

  private parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);

    if (!year || !month || !day) {
      throw new BadRequestException(`Fecha inválida: ${value}`);
    }

    return new Date(Date.UTC(year, month - 1, day));
  }

  private getHoyDateOnly(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  private async getBodegasPermitidasUsuario(
    idUsuario: number,
    bodegasPermitidas?: number[],
    idBodegaActiva?: number | null,
  ) {
    const desdeToken = Array.isArray(bodegasPermitidas)
      ? bodegasPermitidas
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0)
      : [];

    if (desdeToken.length > 0) {
      return [...new Set(desdeToken)];
    }

    const rows = await this.prisma.bodegas_por_usuario.findMany({
      where: {
        id_usuario: idUsuario,
        estado: true,
      },
      select: {
        id_bodega: true,
      },
    });

    const desdeBd = [...new Set(rows.map((r) => Number(r.id_bodega)))].filter(
      (n) => Number.isInteger(n) && n > 0,
    );

    if (desdeBd.length > 0) {
      return desdeBd;
    }

    if (
      idBodegaActiva !== null &&
      idBodegaActiva !== undefined &&
      Number.isInteger(Number(idBodegaActiva)) &&
      Number(idBodegaActiva) > 0
    ) {
      return [Number(idBodegaActiva)];
    }

    return [];
  }

  private assertBodegaAccess(idBodega: number, bodegasPermitidas: number[]) {
    if (!idBodega || Number.isNaN(idBodega)) {
      throw new BadRequestException('Bodega inválida');
    }

    if (!bodegasPermitidas.length) {
      throw new ForbiddenException('El usuario no tiene bodegas asignadas');
    }

    if (!bodegasPermitidas.includes(idBodega)) {
      throw new ForbiddenException('No tienes acceso a esta bodega');
    }
  }

  private resolveBodegaObjetivo(args: {
    idBodegaBodyOrQuery?: number | null;
    idBodegaActiva?: number | null;
    bodegasPermitidas: number[];
  }) {
    const { idBodegaBodyOrQuery, idBodegaActiva, bodegasPermitidas } = args;

    const idBodega =
      idBodegaBodyOrQuery ??
      idBodegaActiva ??
      (bodegasPermitidas.length === 1 ? bodegasPermitidas[0] : null);

    if (!idBodega) {
      if (bodegasPermitidas.length > 1) {
        throw new BadRequestException(
          'Debes indicar la bodega a consultar o trabajar',
        );
      }

      throw new ForbiddenException('El usuario no tiene bodegas asignadas');
    }

    this.assertBodegaAccess(idBodega, bodegasPermitidas);

    return idBodega;
  }

  private async nextCodigoRemisionCompra(
    tx: Prisma.TransactionClient,
    prefix = 'RC',
    pad = 4,
  ) {
    const last = await tx.remision_compra.findFirst({
      orderBy: { id_remision_compra: 'desc' },
      select: { codigo_remision_compra: true },
    });

    const lastCode =
      last?.codigo_remision_compra ?? `${prefix}-${'0'.repeat(pad)}`;
    const match = lastCode.match(/-(\d+)$/);
    const lastNum = match ? Number(match[1]) : 0;
    const nextNum = lastNum + 1;

    return `${prefix}-${String(nextNum).padStart(pad, '0')}`;
  }

  private async getEstadoIdByNombre(
    tx: Prisma.TransactionClient,
    nombreEstado: string,
  ) {
    const estado = await tx.estado_remision_compra.findFirst({
      where: { nombre_estado: nombreEstado },
      select: { id_estado_remision_compra: true },
    });

    if (!estado) {
      throw new BadRequestException(
        `No existe el estado de remisión de compra "${nombreEstado}"`,
      );
    }

    return estado.id_estado_remision_compra;
  }

  private async getEstadoCompraIdByNombre(
    tx: Prisma.TransactionClient,
    nombreEstado: string,
  ) {
    const estado = await tx.estado_compra.findFirst({
      where: { nombre_estado: nombreEstado },
      select: { id_estado_compra: true },
    });

    if (!estado) {
      throw new BadRequestException(
        `No existe el estado de compra "${nombreEstado}"`,
      );
    }

    return estado.id_estado_compra;
  }

  private async assertCompraAprobada(
    tx: Prisma.TransactionClient,
    idEstadoCompra: number,
  ) {
    const ESTADO_APROBADA = await this.getEstadoCompraIdByNombre(
      tx,
      'Aprobada',
    );

    if (idEstadoCompra !== ESTADO_APROBADA) {
      throw new BadRequestException(
        'Solo se pueden generar remisiones desde compras aprobadas',
      );
    }
  }

  private async getCompraContextoBase(
    tx: Prisma.TransactionClient,
    idCompra: number,
    bodegasPermitidas: number[],
  ) {
    const compra = await tx.compras.findUnique({
      where: { id_compra: idCompra },
      select: {
        id_compra: true,
        codigo_compra: true,
        id_bodega: true,
        id_proveedor: true,
        id_estado_compra: true,
        estado_compra: {
          select: {
            id_estado_compra: true,
            nombre_estado: true,
          },
        },
        bodega: {
          select: {
            id_bodega: true,
            nombre_bodega: true,
          },
        },
        proveedor: {
          select: {
            id_proveedor: true,
            nombre_empresa: true,
            num_documento: true,
            id_tipo_doc: true,
            tipo_documento: {
              select: {
                nombre_doc: true,
              },
            },
          },
        },
        detalle_compra: {
          select: {
            id_producto: true,
            cantidad: true,
            precio_unitario: true,
            id_iva: true,
            producto: {
              select: {
                id_producto: true,
                nombre_producto: true,
              },
            },
            iva: {
              select: {
                id_iva: true,
                porcentaje: true,
              },
            },
          },
        },
      },
    });

    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }

    this.assertBodegaAccess(compra.id_bodega, bodegasPermitidas);

    return compra;
  }

  // =========================
  // Endpoints de apoyo al front
  // =========================

  async getSiguienteCodigo(opts: CompraContextoOpts) {
    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      opts.idUsuario,
      opts.bodegasPermitidas,
      opts.idBodegaActiva,
    );

    if (!bodegasPermitidas.length) {
      throw new ForbiddenException('El usuario no tiene bodegas asignadas');
    }

    const numeroRemision = await this.prisma.$transaction((tx) =>
      this.nextCodigoRemisionCompra(tx, 'RC', 4),
    );

    return {
      numeroRemision,
    };
  }

  async getContextoCompraParaRemision(
    idCompra: number,
    opts: CompraContextoOpts,
  ) {
    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      opts.idUsuario,
      opts.bodegasPermitidas,
      opts.idBodegaActiva,
    );

    if (!bodegasPermitidas.length) {
      throw new ForbiddenException('El usuario no tiene bodegas asignadas');
    }

    return this.prisma.$transaction(async (tx) => {
      const compra = await this.getCompraContextoBase(
        tx,
        idCompra,
        bodegasPermitidas,
      );

      await this.assertCompraAprobada(tx, compra.id_estado_compra);

      const numeroRemisionSugerido = await this.nextCodigoRemisionCompra(
        tx,
        'RC',
        4,
      );

      return {
        numeroRemisionSugerido,
        compra: {
          id: compra.id_compra,
          codigo: compra.codigo_compra,
          proveedorId: compra.id_proveedor,
          proveedorNombre: compra.proveedor?.nombre_empresa ?? '',
          proveedorTipoDocumento:
            compra.proveedor?.tipo_documento?.nombre_doc ??
            String(compra.proveedor?.id_tipo_doc ?? ''),
          proveedorNumeroDocumento: compra.proveedor?.num_documento ?? '',
          idBodega: compra.id_bodega,
          bodegaNombre: compra.bodega?.nombre_bodega ?? '',
          estadoCompraId: compra.id_estado_compra,
          estadoCompraNombre: compra.estado_compra?.nombre_estado ?? '',
          items: compra.detalle_compra.map((item) => {
            const cantidad = Number(item.cantidad);
            const precioUnitario = Number(item.precio_unitario);
            const ivaPorcentaje = Number(item.iva?.porcentaje ?? 0);

            return {
              idProducto: item.id_producto,
              id_producto: item.id_producto,
              productoNombre:
                item.producto?.nombre_producto ?? `Producto ${item.id_producto}`,
              producto_nombre:
                item.producto?.nombre_producto ?? `Producto ${item.id_producto}`,
              cantidad,
              precioUnitario,
              precio_unitario: precioUnitario,
              idIva: item.id_iva,
              id_iva: item.id_iva,
              ivaPorcentaje,
              iva_porcentaje: ivaPorcentaje,
              codigoBarras: '',
              codigo_barras: '',
            };
          }),
        },
      };
    });
  }

  // =========================
  // Validaciones base
  // =========================

  private async validarCompraYAcceso(
    tx: Prisma.TransactionClient,
    idCompra: number,
    bodegasPermitidas: number[],
    idBodegaEsperada?: number,
  ) {
    const compra = await tx.compras.findUnique({
      where: { id_compra: idCompra },
      select: {
        id_compra: true,
        codigo_compra: true,
        id_bodega: true,
        id_proveedor: true,
        id_estado_compra: true,
        detalle_compra: {
          select: {
            id_producto: true,
            cantidad: true,
            precio_unitario: true,
            id_iva: true,
          },
        },
      },
    });

    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }

    this.assertBodegaAccess(compra.id_bodega, bodegasPermitidas);

    if (idBodegaEsperada && compra.id_bodega !== idBodegaEsperada) {
      throw new ForbiddenException(
        'La compra no pertenece a la bodega seleccionada',
      );
    }

    return compra;
  }

  private async validarProveedor(
    tx: Prisma.TransactionClient,
    idProveedor: number,
  ) {
    const proveedor = await tx.proveedor.findUnique({
      where: { id_proveedor: idProveedor },
      select: { id_proveedor: true },
    });

    if (!proveedor) {
      throw new BadRequestException(`Proveedor inválido: ${idProveedor}`);
    }
  }

  private async validarFactura(
    tx: Prisma.TransactionClient,
    idFactura?: number | null,
  ) {
    if (!idFactura) return;

    const factura = await tx.factura.findUnique({
      where: { id_factura: idFactura },
      select: { id_factura: true },
    });

    if (!factura) {
      throw new BadRequestException(`Factura inválida: ${idFactura}`);
    }
  }

  private async validarEstadoRemision(
    tx: Prisma.TransactionClient,
    idEstado: number,
  ) {
    const estado = await tx.estado_remision_compra.findUnique({
      where: { id_estado_remision_compra: idEstado },
      select: { id_estado_remision_compra: true },
    });

    if (!estado) {
      throw new BadRequestException(`Estado de remisión inválido: ${idEstado}`);
    }
  }

  private async validarProductosEIvas(
    tx: Prisma.TransactionClient,
    detalle: CreateRemisionCompraDto['detalle_remision_compra'],
  ) {
    const productoIds = [...new Set(detalle.map((d) => d.id_producto))];
    const ivaIds = [...new Set(detalle.map((d) => d.id_iva))];

    const [productos, ivas] = await Promise.all([
      tx.producto.findMany({
        where: { id_producto: { in: productoIds } },
        select: { id_producto: true },
      }),
      tx.iva.findMany({
        where: { id_iva: { in: ivaIds } },
        select: { id_iva: true },
      }),
    ]);

    const productosSet = new Set(productos.map((p) => p.id_producto));
    const ivasSet = new Set(ivas.map((i) => i.id_iva));

    const productosInvalidos = productoIds.filter(
      (id) => !productosSet.has(id),
    );
    const ivasInvalidos = ivaIds.filter((id) => !ivasSet.has(id));

    if (productosInvalidos.length) {
      throw new BadRequestException(
        `Producto(s) inválido(s): ${productosInvalidos.join(', ')}`,
      );
    }

    if (ivasInvalidos.length) {
      throw new BadRequestException(
        `IVA(s) inválido(s): ${ivasInvalidos.join(', ')}`,
      );
    }
  }

  private validarCantidadesYPrecios(
    detalle: CreateRemisionCompraDto['detalle_remision_compra'],
  ) {
    for (const item of detalle) {
      const cantidad = Number(item.cantidad);
      const precio = Number(item.precio_unitario);

      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw new BadRequestException(
          `La cantidad del producto ${item.id_producto} debe ser mayor a 0`,
        );
      }

      if (!Number.isFinite(precio) || precio < 0) {
        throw new BadRequestException(
          `El precio unitario del producto ${item.id_producto} es inválido`,
        );
      }
    }
  }

  private validarDetalleSinDuplicados(
    detalle: CreateRemisionCompraDto['detalle_remision_compra'],
  ) {
    const claves = new Set<string>();

    for (const item of detalle) {
      const clave = [
        item.id_producto,
        item.lote ?? '',
        item.fecha_vencimiento ?? '',
      ].join('|');

      if (claves.has(clave)) {
        throw new BadRequestException(
          `Detalle duplicado para producto ${item.id_producto} con el mismo lote y fecha de vencimiento`,
        );
      }

      claves.add(clave);
    }
  }

  private validarDetalleContraCompra(
    compra: Awaited<
      ReturnType<RemisionesCompraService['validarCompraYAcceso']>
    >,
    detalle: CreateRemisionCompraDto['detalle_remision_compra'],
  ) {
    const productosCompra = new Map(
      compra.detalle_compra.map((d) => [d.id_producto, d]),
    );

    for (const item of detalle) {
      const detalleCompra = productosCompra.get(item.id_producto);

      if (!detalleCompra) {
        throw new BadRequestException(
          `El producto ${item.id_producto} no pertenece al detalle de la compra`,
        );
      }

      if (item.id_iva !== detalleCompra.id_iva) {
        throw new BadRequestException(
          `El IVA del producto ${item.id_producto} no coincide con la compra`,
        );
      }

      const precioCompra = Number(detalleCompra.precio_unitario);
      const precioRemision = Number(item.precio_unitario);

      if (Math.abs(precioCompra - precioRemision) > 0.0001) {
        throw new BadRequestException(
          `El precio unitario del producto ${item.id_producto} no coincide con la compra`,
        );
      }
    }
  }

  private async obtenerCantidadesYaRemisionadasPorCompra(
    tx: Prisma.TransactionClient,
    idCompra: number,
    excludeRemisionId?: number,
  ) {
    const estadoAnulada = await tx.estado_remision_compra.findFirst({
      where: { nombre_estado: 'Anulada' },
      select: { id_estado_remision_compra: true },
    });

    const detalles = await tx.detalle_remision_compra.findMany({
      where: {
        remision_compra: {
          is: {
            id_compra: idCompra,
            ...(excludeRemisionId
              ? { id_remision_compra: { not: excludeRemisionId } }
              : {}),
            ...(estadoAnulada
              ? {
                  id_estado_remision_compra: {
                    not: estadoAnulada.id_estado_remision_compra,
                  },
                }
              : {}),
          },
        },
      },
      select: {
        id_producto: true,
        cantidad: true,
      },
    });

    const cantidades = new Map<number, number>();

    for (const item of detalles) {
      cantidades.set(
        item.id_producto,
        (cantidades.get(item.id_producto) ?? 0) + Number(item.cantidad),
      );
    }

    return cantidades;
  }

  private validarCantidadesContraCompra(
    compra: Awaited<
      ReturnType<RemisionesCompraService['validarCompraYAcceso']>
    >,
    detalle: CreateRemisionCompraDto['detalle_remision_compra'],
    cantidadesYaRemisionadas: Map<number, number>,
  ) {
    const cantidadNuevaPorProducto = new Map<number, number>();

    for (const item of detalle) {
      cantidadNuevaPorProducto.set(
        item.id_producto,
        (cantidadNuevaPorProducto.get(item.id_producto) ?? 0) +
          Number(item.cantidad),
      );
    }

    const productosCompra = new Map(
      compra.detalle_compra.map((d) => [d.id_producto, Number(d.cantidad)]),
    );

    for (const [idProducto, cantidadNueva] of cantidadNuevaPorProducto) {
      const cantidadComprada = productosCompra.get(idProducto) ?? 0;
      const cantidadYaRemisionada =
        cantidadesYaRemisionadas.get(idProducto) ?? 0;
      const disponible = cantidadComprada - cantidadYaRemisionada;

      if (cantidadNueva > disponible + 0.0001) {
        throw new BadRequestException(
          `La cantidad del producto ${idProducto} excede lo pendiente por recibir. Comprada: ${cantidadComprada}, ya remisionada: ${cantidadYaRemisionada}, disponible: ${Math.max(
            disponible,
            0,
          )}, intentas remitir: ${cantidadNueva}`,
        );
      }
    }
  }

  private async aplicarExistenciasDesdeRemision(
    tx: Prisma.TransactionClient,
    remision: {
      id_bodega: number;
      detalle_remision_compra: Array<{
        id_producto: number;
        cantidad: Prisma.Decimal;
        lote: string;
        fecha_vencimiento: Date | null;
        nota: string | null;
        codigo_barras: string | null;
      }>;
    },
  ) {
    for (const item of remision.detalle_remision_compra) {
      const existencia = await tx.existencias.findFirst({
        where: {
          id_producto: item.id_producto,
          id_bodega: remision.id_bodega,
          lote: item.lote ?? '',
          fecha_vencimiento: item.fecha_vencimiento ?? null,
        },
      });

      if (existencia) {
        await tx.existencias.update({
          where: { id_existencia: existencia.id_existencia },
          data: {
            cantidad: {
              increment: item.cantidad,
            },
            nota: item.nota ?? existencia.nota,
            codigo_barras:
              item.codigo_barras ?? existencia.codigo_barras ?? null,
          },
        });
      } else {
        await tx.existencias.create({
          data: {
            id_producto: item.id_producto,
            id_bodega: remision.id_bodega,
            cantidad: item.cantidad,
            lote: item.lote ?? '',
            fecha_vencimiento: item.fecha_vencimiento ?? null,
            nota: item.nota ?? null,
            codigo_barras: item.codigo_barras ?? null,
          },
        });
      }
    }
  }

  // =========================
  // CRUD / acciones
  // =========================

  async create(dto: CreateRemisionCompraDto, opts: CreateOpts) {
    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      opts.idUsuario,
      opts.bodegasPermitidas,
      opts.idBodegaActiva,
    );

    const idBodegaObjetivo = this.resolveBodegaObjetivo({
      idBodegaBodyOrQuery: dto.id_bodega,
      idBodegaActiva: opts.idBodegaActiva,
      bodegasPermitidas,
    });

    if (dto.id_bodega !== idBodegaObjetivo) {
      throw new ForbiddenException(
        'La bodega de la remisión no coincide con la bodega seleccionada o permitida',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const ESTADO_PENDIENTE = await this.getEstadoIdByNombre(tx, 'Pendiente');

      const compra = await this.validarCompraYAcceso(
        tx,
        dto.id_compra,
        bodegasPermitidas,
        dto.id_bodega,
      );

      await this.assertCompraAprobada(tx, compra.id_estado_compra);
      await this.validarProveedor(tx, dto.id_proveedor);
      await this.validarFactura(tx, dto.id_factura);
      await this.validarEstadoRemision(tx, ESTADO_PENDIENTE);
      await this.validarProductosEIvas(tx, dto.detalle_remision_compra);

      this.validarCantidadesYPrecios(dto.detalle_remision_compra);
      this.validarDetalleSinDuplicados(dto.detalle_remision_compra);

      if (compra.id_proveedor !== dto.id_proveedor) {
        throw new BadRequestException(
          'El proveedor de la remisión no coincide con el proveedor de la compra',
        );
      }

      if (compra.id_bodega !== dto.id_bodega) {
        throw new BadRequestException(
          'La bodega de la remisión no coincide con la bodega de la compra',
        );
      }

      this.validarDetalleContraCompra(compra, dto.detalle_remision_compra);

      const cantidadesYaRemisionadas =
        await this.obtenerCantidadesYaRemisionadasPorCompra(tx, dto.id_compra);

      this.validarCantidadesContraCompra(
        compra,
        dto.detalle_remision_compra,
        cantidadesYaRemisionadas,
      );

      const codigo_remision_compra = await this.nextCodigoRemisionCompra(
        tx,
        'RC',
        4,
      );

      return tx.remision_compra.create({
        data: {
          codigo_remision_compra,
          fecha_creacion: this.getHoyDateOnly(),
          fecha_vencimiento: dto.fecha_vencimiento
            ? this.parseDateOnly(dto.fecha_vencimiento)
            : null,
          observaciones: dto.observaciones ?? null,
          id_compra: dto.id_compra,
          id_proveedor: dto.id_proveedor,
          id_bodega: dto.id_bodega,
          id_estado_remision_compra: ESTADO_PENDIENTE,
          id_usuario_creador: opts.idUsuario,
          id_factura: dto.id_factura ?? null,
          afecta_existencias: false,
          fecha_aplicacion_existencias: null,
          id_usuario_aplico_existencias: null,
          detalle_remision_compra: {
            create: dto.detalle_remision_compra.map((d) => ({
              id_producto: d.id_producto,
              cantidad: new Prisma.Decimal(d.cantidad),
              precio_unitario: new Prisma.Decimal(d.precio_unitario),
              id_iva: d.id_iva,
              lote: d.lote ?? '',
              fecha_vencimiento: d.fecha_vencimiento
                ? this.parseDateOnly(d.fecha_vencimiento)
                : null,
              codigo_barras: d.codigo_barras ?? null,
              nota: d.nota ?? null,
            })),
          },
        },
        select: remisionCompraDetailSelect,
      });
    });
  }

  async findAll(args: FindAllArgs) {
    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      args.idUsuario,
      args.bodegasPermitidas,
      args.idBodegaActiva,
    );

    if (!bodegasPermitidas.length) {
      throw new ForbiddenException('El usuario no tiene bodegas asignadas');
    }

    if (args.idBodega) {
      this.assertBodegaAccess(args.idBodega, bodegasPermitidas);

      return this.prisma.remision_compra.findMany({
        where: {
          ...(args.idCompra ? { id_compra: args.idCompra } : {}),
          id_bodega: args.idBodega,
        },
        orderBy: { id_remision_compra: 'desc' },
        select: remisionCompraListSelect,
      });
    }

    return this.prisma.remision_compra.findMany({
      where: {
        ...(args.idCompra ? { id_compra: args.idCompra } : {}),
        id_bodega: { in: bodegasPermitidas },
      },
      orderBy: { id_remision_compra: 'desc' },
      select: remisionCompraListSelect,
    });
  }

  async findOne(id: number, opts: ScopeOpts) {
    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      opts.idUsuario,
      opts.bodegasPermitidas,
      null,
    );

    const remision = await this.prisma.remision_compra.findUnique({
      where: { id_remision_compra: id },
      select: remisionCompraDetailSelect,
    });

    if (!remision) {
      throw new NotFoundException('Remisión de compra no encontrada');
    }

    if (remision.id_bodega !== null) {
      this.assertBodegaAccess(remision.id_bodega, bodegasPermitidas);
    }

    return remision;
  }

  async update(id: number, dto: UpdateRemisionCompraDto, opts: UpdateOpts) {
    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      opts.idUsuario,
      opts.bodegasPermitidas,
      null,
    );

    const actual = await this.findOne(id, {
      idUsuario: opts.idUsuario,
      bodegasPermitidas,
    });

    const actualTx = await this.prisma.remision_compra.findUnique({
      where: { id_remision_compra: id },
      select: {
        id_estado_remision_compra: true,
        afecta_existencias: true,
      },
    });

    if (!actualTx) {
      throw new NotFoundException('Remisión de compra no encontrada');
    }

    const ESTADO_ANULADA = await this.prisma.$transaction(async (tx) => {
      return this.getEstadoIdByNombre(tx, 'Anulada');
    });

    if (actualTx.id_estado_remision_compra === ESTADO_ANULADA) {
      throw new BadRequestException(
        'La remisión está anulada y no puede editarse',
      );
    }

    if (actual.afecta_existencias || actualTx.afecta_existencias) {
      throw new BadRequestException(
        'La remisión ya aplicó existencias y no puede editarse',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.id_factura !== undefined) {
        await this.validarFactura(tx, dto.id_factura);
      }

      if (dto.detalle_remision_compra?.length) {
        const compra = await this.validarCompraYAcceso(
          tx,
          actual.id_compra,
          bodegasPermitidas,
          actual.id_bodega ?? undefined,
        );

        await this.assertCompraAprobada(tx, compra.id_estado_compra);
        await this.validarProductosEIvas(tx, dto.detalle_remision_compra);
        this.validarCantidadesYPrecios(dto.detalle_remision_compra);
        this.validarDetalleSinDuplicados(dto.detalle_remision_compra);
        this.validarDetalleContraCompra(compra, dto.detalle_remision_compra);

        const cantidadesYaRemisionadas =
          await this.obtenerCantidadesYaRemisionadasPorCompra(
            tx,
            actual.id_compra,
            id,
          );

        this.validarCantidadesContraCompra(
          compra,
          dto.detalle_remision_compra,
          cantidadesYaRemisionadas,
        );

        await tx.detalle_remision_compra.deleteMany({
          where: { id_remision_compra: id },
        });

        await tx.detalle_remision_compra.createMany({
          data: dto.detalle_remision_compra.map((d) => ({
            id_remision_compra: id,
            id_producto: d.id_producto,
            cantidad: new Prisma.Decimal(d.cantidad),
            precio_unitario: new Prisma.Decimal(d.precio_unitario),
            id_iva: d.id_iva,
            lote: d.lote ?? '',
            fecha_vencimiento: d.fecha_vencimiento
              ? this.parseDateOnly(d.fecha_vencimiento)
              : null,
            codigo_barras: d.codigo_barras ?? null,
            nota: d.nota ?? null,
          })),
        });
      }

      return tx.remision_compra.update({
        where: { id_remision_compra: id },
        data: {
          observaciones:
            dto.observaciones !== undefined ? dto.observaciones : undefined,
          fecha_vencimiento:
            dto.fecha_vencimiento !== undefined
              ? dto.fecha_vencimiento
                ? this.parseDateOnly(dto.fecha_vencimiento)
                : null
              : undefined,
          id_factura: dto.id_factura !== undefined ? dto.id_factura : undefined,
        },
        select: remisionCompraDetailSelect,
      });
    });
  }

  async cambiarEstado(
    id: number,
    dto: CambiarEstadoRemisionCompraDto,
    opts: UpdateOpts,
  ) {
    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      opts.idUsuario,
      opts.bodegasPermitidas,
      null,
    );

    const actual = await this.findOne(id, {
      idUsuario: opts.idUsuario,
      bodegasPermitidas,
    });

    return this.prisma.$transaction(async (tx) => {
      await this.validarEstadoRemision(tx, dto.id_estado_remision_compra);

      const ESTADO_PENDIENTE = await this.getEstadoIdByNombre(tx, 'Pendiente');
      const ESTADO_APLICADA = await this.getEstadoIdByNombre(tx, 'Aprobada');
      const ESTADO_ANULADA = await this.getEstadoIdByNombre(tx, 'Anulada');

      if (dto.id_estado_remision_compra === actual.id_estado_remision_compra) {
        return actual;
      }

      if (actual.id_estado_remision_compra === ESTADO_ANULADA) {
        throw new BadRequestException(
          'La remisión ya está anulada y no puede cambiar de estado',
        );
      }

      if (
        actual.id_estado_remision_compra === ESTADO_APLICADA ||
        actual.afecta_existencias
      ) {
        throw new BadRequestException(
          'La remisión ya fue aplicada y no puede anularse ni cambiar de estado',
        );
      }

      if (actual.id_estado_remision_compra !== ESTADO_PENDIENTE) {
        throw new BadRequestException(
          'Solo las remisiones en estado pendiente pueden cambiar de estado',
        );
      }

      if (dto.id_estado_remision_compra === ESTADO_ANULADA) {
        return tx.remision_compra.update({
          where: { id_remision_compra: id },
          data: {
            id_estado_remision_compra: ESTADO_ANULADA,
            afecta_existencias: false,
            fecha_aplicacion_existencias: null,
            id_usuario_aplico_existencias: null,
          },
          select: remisionCompraDetailSelect,
        });
      }

      if (dto.id_estado_remision_compra === ESTADO_APLICADA) {
        if (actual.id_bodega === null) {
          throw new BadRequestException(
            'La remisión no tiene una bodega asociada para aplicar existencias',
          );
        }

        this.assertBodegaAccess(actual.id_bodega, bodegasPermitidas);

        await this.aplicarExistenciasDesdeRemision(tx, {
          id_bodega: actual.id_bodega,
          detalle_remision_compra: actual.detalle_remision_compra.map((d) => ({
            id_producto: d.id_producto,
            cantidad: new Prisma.Decimal(d.cantidad),
            lote: d.lote ?? '',
            fecha_vencimiento: d.fecha_vencimiento,
            nota: d.nota,
            codigo_barras: d.codigo_barras ?? null,
          })),
        });

        return tx.remision_compra.update({
          where: { id_remision_compra: id },
          data: {
            id_estado_remision_compra: ESTADO_APLICADA,
            afecta_existencias: true,
            fecha_aplicacion_existencias: new Date(),
            id_usuario_aplico_existencias: opts.idUsuario,
          },
          select: remisionCompraDetailSelect,
        });
      }

      throw new BadRequestException(
        'Desde pendiente solo puedes pasar la remisión a Aplicada o Anulada',
      );
    });
  }
}
