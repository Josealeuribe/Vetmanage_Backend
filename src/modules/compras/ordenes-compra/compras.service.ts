import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';
import { compraDetailSelect, compraListSelect } from './selects/compras.select';

type CreateOpts = {
  idUsuario: number;
};

type ScopeOpts = {
  idUsuario: number;
};

type UpdateOpts = {
  idUsuario: number;
};

type DetalleCompraInput = Array<{
  id_producto: number;
  cantidad: number | string | Prisma.Decimal;
  precio_unitario: number | string | Prisma.Decimal;
}>;

type DetalleCompraConIva = Array<{
  id_producto: number;
  cantidad: number | string | Prisma.Decimal;
  precio_unitario: number | string | Prisma.Decimal;
  id_iva: number;
}>;

type CompraReferenciaDto = {
  id_proveedor?: number;
  id_termino_pago?: number;
  id_estado_compra?: number;
  detalle?: DetalleCompraInput;
};

const ESTADO_PENDIENTE = 1;
const ESTADO_APROBADA = 2;
const ESTADO_ANULADA = 3;

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) { }

  private async getBodegasPermitidasUsuario(
    idUsuario: number,
  ): Promise<number[]> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id_usuario: idUsuario },
      select: {
        id_usuario: true,
        bodegas_por_usuario: {
          select: {
            id_bodega: true,
          },
        },
      },
    });

    if (!usuario) {
      throw new ForbiddenException('Usuario no válido');
    }

    const bodegas = usuario.bodegas_por_usuario.map((b) => b.id_bodega);

    if (!bodegas.length) {
      throw new ForbiddenException('El usuario no tiene bodegas asignadas');
    }

    return bodegas;
  }

  private assertBodegaAccess(
    idBodega: number | undefined | null,
    bodegasPermitidas: number[],
  ) {
    if (!idBodega || Number.isNaN(idBodega)) {
      throw new BadRequestException('Debes seleccionar una bodega válida');
    }

    if (!bodegasPermitidas.includes(idBodega)) {
      throw new ForbiddenException('No tienes acceso a esta bodega');
    }
  }

  private parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);

    if (!year || !month || !day) {
      throw new BadRequestException(`Fecha inválida: ${value}`);
    }

    return new Date(year, month - 1, day, 12, 0, 0);
  }

  private getHoyDateOnly(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  }

  private assertDetalleSinDuplicados(detalle: Array<{ id_producto: number }>) {
    const ids = detalle.map((d) => d.id_producto);
    const duplicados = ids.filter((id, index) => ids.indexOf(id) !== index);

    if (duplicados.length) {
      throw new BadRequestException(
        `Hay productos repetidos en el detalle: ${[
          ...new Set(duplicados),
        ].join(', ')}`,
      );
    }
  }

  private async resolverDetalleConIvaDelProducto(
    tx: Prisma.TransactionClient,
    detalle: DetalleCompraInput,
  ): Promise<DetalleCompraConIva> {
    const productoIds = [...new Set(detalle.map((item) => item.id_producto))];

    const productos = await tx.producto.findMany({
      where: {
        id_producto: {
          in: productoIds,
        },
      },
      select: {
        id_producto: true,
        id_iva: true,
        nombre_producto: true,
        iva: {
          select: {
            id_iva: true,
            porcentaje: true,
          },
        },
      },
    });

    if (productos.length !== productoIds.length) {
      const encontrados = new Set(productos.map((p) => p.id_producto));
      const faltantes = productoIds.filter((id) => !encontrados.has(id));

      throw new BadRequestException(
        `Productos inválidos: ${faltantes.join(', ')}`,
      );
    }

    const productoMap = new Map(productos.map((p) => [p.id_producto, p]));

    return detalle.map((item) => {
      const producto = productoMap.get(item.id_producto);

      if (!producto) {
        throw new BadRequestException(`Producto inválido: ${item.id_producto}`);
      }

      if (!producto.id_iva || !producto.iva) {
        throw new BadRequestException(
          `El producto "${producto.nombre_producto}" no tiene IVA configurado`,
        );
      }

      return {
        ...item,
        id_iva: producto.id_iva,
      };
    });
  }

  private async nextCodigoCompra(
    tx: Prisma.TransactionClient,
    prefix = 'OC',
    pad = 4,
  ) {
    const last = await tx.compras.findFirst({
      orderBy: { id_compra: 'desc' },
      select: { codigo_compra: true },
    });

    const lastCode = last?.codigo_compra ?? `${prefix}-${'0'.repeat(pad)}`;
    const match = lastCode.match(/-(\d+)$/);
    const lastNum = match ? Number(match[1]) : 0;
    const nextNum = lastNum + 1;

    return `${prefix}-${String(nextNum).padStart(pad, '0')}`;
  }

  private async validarReferencias(
    tx: Prisma.TransactionClient,
    dto: CompraReferenciaDto,
    idBodega: number,
  ) {
    const bodega = await tx.bodega.findUnique({
      where: { id_bodega: idBodega },
      select: { id_bodega: true },
    });

    if (!bodega) {
      throw new BadRequestException(`Bodega inválida: ${idBodega}`);
    }

    if (dto.id_proveedor !== undefined) {
      const proveedor = await tx.proveedor.findUnique({
        where: { id_proveedor: dto.id_proveedor },
        select: { id_proveedor: true },
      });

      if (!proveedor) {
        throw new BadRequestException(`Proveedor inválido: ${dto.id_proveedor}`);
      }
    }

    if (dto.id_termino_pago !== undefined) {
      const termino = await tx.termino_pago.findUnique({
        where: { id_termino_pago: dto.id_termino_pago },
        select: { id_termino_pago: true },
      });

      if (!termino) {
        throw new BadRequestException(
          `Término de pago inválido: ${dto.id_termino_pago}`,
        );
      }
    }

    if (dto.id_estado_compra !== undefined) {
      const estado = await tx.estado_compra.findUnique({
        where: { id_estado_compra: dto.id_estado_compra },
        select: { id_estado_compra: true },
      });

      if (!estado) {
        throw new BadRequestException(
          `Estado de compra inválido: ${dto.id_estado_compra}`,
        );
      }
    }

    if (dto.detalle?.length) {
      const productoIds = [...new Set(dto.detalle.map((d) => d.id_producto))];

      const productos = await tx.producto.findMany({
        where: { id_producto: { in: productoIds } },
        select: { id_producto: true },
      });

      if (productos.length !== productoIds.length) {
        const encontrados = new Set(productos.map((p) => p.id_producto));
        const faltantes = productoIds.filter((id) => !encontrados.has(id));

        throw new BadRequestException(
          `Productos inválidos: ${faltantes.join(', ')}`,
        );
      }
    }
  }

  private async calcularTotales(
    tx: Prisma.TransactionClient,
    detalle: DetalleCompraConIva,
  ) {
    const ivaIds = [...new Set(detalle.map((d) => d.id_iva))];

    const ivas = await tx.iva.findMany({
      where: { id_iva: { in: ivaIds } },
      select: { id_iva: true, porcentaje: true },
    });

    const ivaMap = new Map<number, Prisma.Decimal>();

    for (const iva of ivas) {
      ivaMap.set(iva.id_iva, iva.porcentaje);
    }

    let subtotal = new Prisma.Decimal(0);
    let totalIva = new Prisma.Decimal(0);

    for (const item of detalle) {
      const qty = new Prisma.Decimal(item.cantidad);
      const price = new Prisma.Decimal(item.precio_unitario);
      const lineSub = qty.mul(price);

      const pct = ivaMap.get(item.id_iva);

      if (!pct) {
        throw new BadRequestException(`IVA inválido: ${item.id_iva}`);
      }

      const lineIva = lineSub.mul(pct).div(100);

      subtotal = subtotal.add(lineSub);
      totalIva = totalIva.add(lineIva);
    }

    const total = subtotal.add(totalIva);

    const r2 = (d: Prisma.Decimal) => new Prisma.Decimal(d.toFixed(2));

    return {
      subtotal: r2(subtotal),
      total_iva: r2(totalIva),
      total: r2(total),
    };
  }

  private async obtenerIdsComprasConPendientes(
    tx: Prisma.TransactionClient,
    compraIds: number[],
  ): Promise<number[]> {
    if (!compraIds.length) return [];

    const estadoAnulada = await tx.estado_remision_compra.findFirst({
      where: { nombre_estado: 'Anulada' },
      select: { id_estado_remision_compra: true },
    });

    const [detallesCompra, detallesRemision] = await Promise.all([
      tx.detalle_compra.findMany({
        where: {
          id_compra: { in: compraIds },
        },
        select: {
          id_compra: true,
          id_producto: true,
          cantidad: true,
        },
      }),
      tx.detalle_remision_compra.findMany({
        where: {
          remision_compra: {
            is: {
              id_compra: { in: compraIds },
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
          remision_compra: {
            select: {
              id_compra: true,
            },
          },
        },
      }),
    ]);

    const compradasMap = new Map<string, number>();
    const remisionadasMap = new Map<string, number>();

    for (const item of detallesCompra) {
      const key = `${item.id_compra}-${item.id_producto}`;
      compradasMap.set(key, (compradasMap.get(key) ?? 0) + Number(item.cantidad));
    }

    for (const item of detallesRemision) {
      const idCompra = item.remision_compra?.id_compra;

      if (!idCompra) continue;

      const key = `${idCompra}-${item.id_producto}`;
      remisionadasMap.set(
        key,
        (remisionadasMap.get(key) ?? 0) + Number(item.cantidad),
      );
    }

    const comprasConPendientes = new Set<number>();

    for (const item of detallesCompra) {
      const key = `${item.id_compra}-${item.id_producto}`;
      const cantidadComprada = compradasMap.get(key) ?? 0;
      const cantidadRemisionada = remisionadasMap.get(key) ?? 0;
      const pendiente = cantidadComprada - cantidadRemisionada;

      if (pendiente > 0.0001) {
        comprasConPendientes.add(item.id_compra);
      }
    }

    return [...comprasConPendientes];
  }

  async create(dto: CreateCompraDto, opts: CreateOpts) {
    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      opts.idUsuario,
    );

    const idBodegaFinal =
      dto.id_bodega ??
      (bodegasPermitidas.length === 1 ? bodegasPermitidas[0] : undefined);

    this.assertBodegaAccess(idBodegaFinal, bodegasPermitidas);
    this.assertDetalleSinDuplicados(dto.detalle);

    return this.prisma.$transaction(async (tx) => {
      const detalleConIva = await this.resolverDetalleConIvaDelProducto(
        tx,
        dto.detalle,
      );

      await this.validarReferencias(
        tx,
        {
          ...dto,
          detalle: detalleConIva,
        },
        idBodegaFinal!,
      );

      const codigo_compra = await this.nextCodigoCompra(tx, 'OC', 4);
      const totales = await this.calcularTotales(tx, detalleConIva);

      const compra = await tx.compras.create({
        data: {
          codigo_compra,
          fecha_solicitud: this.getHoyDateOnly(),
          id_proveedor: dto.id_proveedor,
          id_termino_pago: dto.id_termino_pago,
          descripcion: dto.descripcion ?? null,
          subtotal: totales.subtotal,
          total_iva: totales.total_iva,
          total: totales.total,
          fecha_entrega: dto.fecha_entrega
            ? this.parseDateOnly(dto.fecha_entrega)
            : null,
          id_estado_compra: ESTADO_PENDIENTE,
          id_usuario_creador: opts.idUsuario,
          id_bodega: idBodegaFinal!,
          detalle_compra: {
            create: detalleConIva.map((d) => ({
              id_producto: d.id_producto,
              cantidad: new Prisma.Decimal(d.cantidad),
              precio_unitario: new Prisma.Decimal(d.precio_unitario),
              id_iva: d.id_iva,
            })),
          },
        },
        select: compraDetailSelect,
      });

      return compra;
    });
  }

  async findAll(args: {
    idUsuario: number;
    idBodegaScope?: number;
    soloAprobadas?: boolean;
  }) {
    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      args.idUsuario,
    );

    if (args.idBodegaScope !== undefined) {
      this.assertBodegaAccess(args.idBodegaScope, bodegasPermitidas);
    }

    const compras = await this.prisma.compras.findMany({
      where: {
        ...(args.soloAprobadas ? { id_estado_compra: ESTADO_APROBADA } : {}),
        ...(args.idBodegaScope !== undefined
          ? { id_bodega: args.idBodegaScope }
          : { id_bodega: { in: bodegasPermitidas } }),
      },
      orderBy: { id_compra: 'desc' },
      select: compraListSelect,
    });

    if (!args.soloAprobadas) {
      return compras;
    }

    const idsCompras = compras.map((compra) => compra.id_compra);

    const idsComprasConPendientes = await this.prisma.$transaction((tx) =>
      this.obtenerIdsComprasConPendientes(tx, idsCompras),
    );

    const permitidasSet = new Set(idsComprasConPendientes);

    return compras.filter((compra) => permitidasSet.has(compra.id_compra));
  }

  async findOne(id: number, opts: ScopeOpts) {
    const compra = await this.prisma.compras.findUnique({
      where: { id_compra: id },
      select: compraDetailSelect,
    });

    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }

    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      opts.idUsuario,
    );

    if (!bodegasPermitidas.includes(compra.id_bodega)) {
      throw new ForbiddenException('No tienes acceso a esta compra');
    }

    return compra;
  }

  async update(id: number, dto: UpdateCompraDto, opts: UpdateOpts) {
    const actual = await this.findOne(id, { idUsuario: opts.idUsuario });

    if (actual.id_estado_compra === ESTADO_ANULADA) {
      throw new BadRequestException('No puedes editar una compra anulada');
    }

    if (actual.id_estado_compra === ESTADO_APROBADA) {
      throw new BadRequestException('No puedes editar una compra aprobada');
    }

    const bodegasPermitidas = await this.getBodegasPermitidasUsuario(
      opts.idUsuario,
    );

    const idBodegaFinal =
      dto.id_bodega ??
      actual.id_bodega ??
      (bodegasPermitidas.length === 1 ? bodegasPermitidas[0] : undefined);

    this.assertBodegaAccess(idBodegaFinal, bodegasPermitidas);

    if (dto.detalle?.length) {
      this.assertDetalleSinDuplicados(dto.detalle);
    }

    return this.prisma.$transaction(async (tx) => {
      let detalleConIva: DetalleCompraConIva | null = null;

      if (dto.detalle?.length) {
        detalleConIva = await this.resolverDetalleConIvaDelProducto(
          tx,
          dto.detalle,
        );
      }

      await this.validarReferencias(
        tx,
        {
          ...dto,
          detalle: detalleConIva ?? undefined,
        },
        idBodegaFinal!,
      );

      let totales: {
        subtotal: Prisma.Decimal;
        total_iva: Prisma.Decimal;
        total: Prisma.Decimal;
      } | null = null;

      if (detalleConIva?.length) {
        totales = await this.calcularTotales(tx, detalleConIva);

        await tx.detalle_compra.deleteMany({
          where: { id_compra: id },
        });

        await tx.detalle_compra.createMany({
          data: detalleConIva.map((d) => ({
            id_compra: id,
            id_producto: d.id_producto,
            cantidad: new Prisma.Decimal(d.cantidad),
            precio_unitario: new Prisma.Decimal(d.precio_unitario),
            id_iva: d.id_iva,
          })),
        });
      }

      const updated = await tx.compras.update({
        where: { id_compra: id },
        data: {
          id_bodega: dto.id_bodega ? idBodegaFinal : undefined,
          id_proveedor: dto.id_proveedor ?? undefined,
          id_termino_pago: dto.id_termino_pago ?? undefined,
          descripcion: dto.descripcion ?? undefined,
          fecha_entrega: dto.fecha_entrega
            ? this.parseDateOnly(dto.fecha_entrega)
            : undefined,
          id_estado_compra: dto.id_estado_compra ?? undefined,
          ...(totales
            ? {
              subtotal: totales.subtotal,
              total_iva: totales.total_iva,
              total: totales.total,
            }
            : {}),
        },
        select: compraDetailSelect,
      });

      return updated;
    });
  }

  async aprobar(id: number, opts: ScopeOpts) {
    const actual = await this.findOne(id, { idUsuario: opts.idUsuario });

    if (actual.id_estado_compra === ESTADO_ANULADA) {
      throw new BadRequestException('No puedes aprobar una compra anulada');
    }

    if (actual.id_estado_compra === ESTADO_APROBADA) {
      throw new BadRequestException('La compra ya está aprobada');
    }

    return this.prisma.compras.update({
      where: { id_compra: id },
      data: {
        id_estado_compra: ESTADO_APROBADA,
      },
      select: compraDetailSelect,
    });
  }

  async anular(id: number, opts: ScopeOpts) {
    const actual = await this.findOne(id, { idUsuario: opts.idUsuario });

    if (actual.id_estado_compra === ESTADO_ANULADA) {
      throw new BadRequestException('La compra ya está anulada');
    }

    if (actual.id_estado_compra === ESTADO_APROBADA) {
      throw new BadRequestException('No puedes anular una compra aprobada');
    }

    return this.prisma.compras.update({
      where: { id_compra: id },
      data: {
        id_estado_compra: ESTADO_ANULADA,
      },
      select: compraDetailSelect,
    });
  }
}