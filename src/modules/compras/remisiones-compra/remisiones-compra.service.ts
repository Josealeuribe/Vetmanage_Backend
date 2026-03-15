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
  idBodegaActiva: number;
  bodegasPermitidas?: number[];
};

type ScopeOpts = {
  bodegasPermitidas?: number[];
};

type UpdateOpts = {
  idUsuario: number;
  bodegasPermitidas?: number[];
};

@Injectable()
export class RemisionesCompraService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value?: string | null) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private assertBodegaAccess(idBodega: number, bodegasPermitidas?: number[]) {
    if (!idBodega || Number.isNaN(idBodega)) {
      throw new BadRequestException('Bodega activa inválida');
    }

    if (bodegasPermitidas?.length && !bodegasPermitidas.includes(idBodega)) {
      throw new ForbiddenException('No tienes acceso a esta bodega');
    }
  }

  private async nextCodigoRemisionCompra(
    tx: Prisma.TransactionClient,
    prefix = 'RMC',
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

  /**
   * Busca un estado de remisión por posibles nombres reales en BD.
   * Así no dependemos de que "Pendiente" o "Confirmada" sea un id fijo.
   */
  private async obtenerEstadoRemisionPorNombres(
    tx: Prisma.TransactionClient,
    posiblesNombres: string[],
  ) {
    const estados = await tx.estado_remision_compra.findMany({
      select: {
        id_estado_remision_compra: true,
        nombre_estado: true,
      },
    });

    const encontrado = estados.find((estado) =>
      posiblesNombres.includes(this.normalizeText(estado.nombre_estado)),
    );

    if (!encontrado) {
      throw new BadRequestException(
        `No existe en BD un estado de remisión con alguno de estos nombres: ${posiblesNombres.join(
          ', ',
        )}`,
      );
    }

    return encontrado;
  }

  private async validarCompraYAcceso(
    tx: Prisma.TransactionClient,
    idCompra: number,
    idBodegaActiva?: number,
    bodegasPermitidas?: number[],
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

    if (idBodegaActiva) {
      this.assertBodegaAccess(idBodegaActiva, bodegasPermitidas);

      if (compra.id_bodega !== idBodegaActiva) {
        throw new ForbiddenException(
          'La compra no pertenece a la bodega activa',
        );
      }
    } else if (
      bodegasPermitidas?.length &&
      !bodegasPermitidas.includes(compra.id_bodega)
    ) {
      throw new ForbiddenException('No tienes acceso a esta compra');
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

  private async validarEstadoRemision(
    tx: Prisma.TransactionClient,
    idEstado: number,
  ) {
    const estado = await tx.estado_remision_compra.findUnique({
      where: { id_estado_remision_compra: idEstado },
      select: {
        id_estado_remision_compra: true,
        nombre_estado: true,
      },
    });

    if (!estado) {
      throw new BadRequestException(`Estado de remisión inválido: ${idEstado}`);
    }

    return estado;
  }

  private async validarProductosEIvas(
    tx: Prisma.TransactionClient,
    detalle: CreateRemisionCompraDto['detalle_remision_compra'],
  ) {
    const productoIds: number[] = [
      ...new Set(detalle.map((d) => d.id_producto)),
    ];
    const ivaIds: number[] = [...new Set(detalle.map((d) => d.id_iva))];

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

  private async aplicarExistenciasDesdeRemision(
    tx: Prisma.TransactionClient,
    remision: {
      id_remision_compra: number;
      id_bodega: number;
      detalle_remision_compra: Array<{
        id_producto: number;
        cantidad: Prisma.Decimal;
        lote: string;
        fecha_vencimiento: Date | null;
        nota: string | null;
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
          },
        });
      }
    }
  }

  async create(dto: CreateRemisionCompraDto, opts: CreateOpts) {
    this.assertBodegaAccess(opts.idBodegaActiva, opts.bodegasPermitidas);

    if (dto.id_bodega !== opts.idBodegaActiva) {
      throw new ForbiddenException(
        'La bodega de la remisión no coincide con la bodega activa',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const compra = await this.validarCompraYAcceso(
        tx,
        dto.id_compra,
        opts.idBodegaActiva,
        opts.bodegasPermitidas,
      );

      const estadoInicial = await this.obtenerEstadoRemisionPorNombres(tx, [
        'pendiente',
      ]);

      await this.validarProveedor(tx, dto.id_proveedor);
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

      const codigo_remision_compra = await this.nextCodigoRemisionCompra(
        tx,
        'RMC',
        4,
      );

      return tx.remision_compra.create({
        data: {
          codigo_remision_compra,
          fecha_creacion: new Date(),
          fecha_vencimiento: dto.fecha_vencimiento
            ? new Date(dto.fecha_vencimiento)
            : null,
          observaciones: dto.observaciones ?? null,
          id_compra: dto.id_compra,
          id_proveedor: dto.id_proveedor,
          id_bodega: dto.id_bodega,
          id_estado_remision_compra: estadoInicial.id_estado_remision_compra,
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
                ? new Date(d.fecha_vencimiento)
                : null,
              cod_barras: d.cod_barras ?? null,
              nota: d.nota ?? null,
            })),
          },
        },
        select: remisionCompraDetailSelect,
      });
    });
  }

  async findAll(args: {
    idBodegaActiva: number;
    bodegasPermitidas?: number[];
    idCompra?: number;
  }) {
    this.assertBodegaAccess(args.idBodegaActiva, args.bodegasPermitidas);

    return this.prisma.remision_compra.findMany({
      where: {
        ...(args.idCompra ? { id_compra: args.idCompra } : {}),
        id_bodega: args.idBodegaActiva,
      },
      orderBy: { id_remision_compra: 'desc' },
      select: remisionCompraListSelect,
    });
  }

  async findOne(id: number, opts?: ScopeOpts) {
    const remision = await this.prisma.remision_compra.findUnique({
      where: { id_remision_compra: id },
      select: remisionCompraDetailSelect,
    });

    if (!remision) {
      throw new NotFoundException('Remisión de compra no encontrada');
    }

    if (
      opts?.bodegasPermitidas?.length &&
      !opts.bodegasPermitidas.includes(remision.id_bodega)
    ) {
      throw new ForbiddenException('No tienes acceso a esta remisión');
    }

    return remision;
  }

  async update(id: number, dto: UpdateRemisionCompraDto, opts: UpdateOpts) {
    const actual = await this.findOne(id, {
      bodegasPermitidas: opts.bodegasPermitidas,
    });

    if (actual.afecta_existencias) {
      throw new BadRequestException(
        'La remisión ya aplicó existencias y no puede editarse',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.id_estado_remision_compra) {
        await this.validarEstadoRemision(tx, dto.id_estado_remision_compra);
      }

      if (dto.id_proveedor) {
        await this.validarProveedor(tx, dto.id_proveedor);

        if (dto.id_proveedor !== actual.id_proveedor) {
          throw new BadRequestException(
            'No puedes cambiar el proveedor de una remisión a uno distinto de la compra',
          );
        }
      }

      if (dto.id_bodega) {
        this.assertBodegaAccess(dto.id_bodega, opts.bodegasPermitidas);

        if (dto.id_bodega !== actual.id_bodega) {
          throw new BadRequestException(
            'No puedes cambiar la bodega de una remisión ya asociada a una compra',
          );
        }
      }

      if (dto.detalle_remision_compra?.length) {
        const compra = await this.validarCompraYAcceso(
          tx,
          actual.id_compra,
          actual.id_bodega,
          opts.bodegasPermitidas,
        );

        await this.validarProductosEIvas(tx, dto.detalle_remision_compra);
        this.validarCantidadesYPrecios(dto.detalle_remision_compra);
        this.validarDetalleSinDuplicados(dto.detalle_remision_compra);
        this.validarDetalleContraCompra(compra, dto.detalle_remision_compra);

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
              ? new Date(d.fecha_vencimiento)
              : null,
            cod_barras: d.cod_barras ?? null,
            nota: d.nota ?? null,
          })),
        });
      }

      return tx.remision_compra.update({
        where: { id_remision_compra: id },
        data: {
          observaciones: dto.observaciones ?? undefined,
          fecha_vencimiento:
            dto.fecha_vencimiento !== undefined
              ? dto.fecha_vencimiento
                ? new Date(dto.fecha_vencimiento)
                : null
              : undefined,
          id_estado_remision_compra: dto.id_estado_remision_compra ?? undefined,
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
    const actual = await this.findOne(id, {
      bodegasPermitidas: opts.bodegasPermitidas,
    });

    return this.prisma.$transaction(async (tx) => {
      const estadoDestino = await this.validarEstadoRemision(
        tx,
        dto.id_estado_remision_compra,
      );

      const nombreEstadoDestino = this.normalizeText(
        estadoDestino.nombre_estado,
      );

      const estadosQueAplicanExistencias = [
        'recibida',
        'recibido',
        'aprobada',
        'aprobado',
        'confirmada',
        'confirmado',
      ];

      const aplicaExistenciasConEsteEstado =
        estadosQueAplicanExistencias.includes(nombreEstadoDestino);

      if (aplicaExistenciasConEsteEstado && actual.afecta_existencias) {
        throw new BadRequestException(
          'La remisión ya aplicó existencias anteriormente',
        );
      }

      if (aplicaExistenciasConEsteEstado && !actual.afecta_existencias) {
        if (!actual.detalle_remision_compra?.length) {
          throw new BadRequestException(
            'La remisión no tiene detalle para aplicar existencias',
          );
        }

        await this.aplicarExistenciasDesdeRemision(tx, {
          id_remision_compra: actual.id_remision_compra,
          id_bodega: actual.id_bodega,
          detalle_remision_compra: actual.detalle_remision_compra.map((d) => ({
            id_producto: d.id_producto,
            cantidad: new Prisma.Decimal(d.cantidad),
            lote: d.lote ?? '',
            fecha_vencimiento: d.fecha_vencimiento,
            nota: d.nota,
          })),
        });

        return tx.remision_compra.update({
          where: { id_remision_compra: id },
          data: {
            id_estado_remision_compra: dto.id_estado_remision_compra,
            afecta_existencias: true,
            fecha_aplicacion_existencias: new Date(),
            id_usuario_aplico_existencias: opts.idUsuario,
          },
          select: remisionCompraDetailSelect,
        });
      }

      return tx.remision_compra.update({
        where: { id_remision_compra: id },
        data: {
          id_estado_remision_compra: dto.id_estado_remision_compra,
        },
        select: remisionCompraDetailSelect,
      });
    });
  }
}
