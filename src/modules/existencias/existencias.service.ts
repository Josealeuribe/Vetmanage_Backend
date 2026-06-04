import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotAcceptableException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateExistenciaDto } from './dto/create-existencia.dto';
import { UpdateExistenciaDto } from './dto/update-existencia.dto';
import {
  existenciaDetailSelect,
  existenciaListSelect,
} from './selects/existencias.select';

type CreateOpts = {
  idBodegaActiva: number;
  bodegasPermitidas?: number[];
};

type ScopeOpts = {
  bodegasPermitidas?: number[];
};

type ProductosVistaOpts = {
  idBodegaActiva?: number;
  bodegasPermitidas?: number[];
  scope?: 'active' | 'all';
};

@Injectable()
export class ExistenciasService {
  constructor(private readonly prisma: PrismaService) { }

  private assertBodegaAccess(idBodega: number, bodegasPermitidas?: number[]) {
    if (!idBodega || Number.isNaN(idBodega)) {
      throw new BadRequestException('Bodega activa inválida');
    }

    if (bodegasPermitidas?.length && !bodegasPermitidas.includes(idBodega)) {
      throw new ForbiddenException('No tienes acceso a esta bodega');
    }
  }

  private async validarProducto(
    tx: Prisma.TransactionClient,
    idProducto: number,
  ) {
    const producto = await tx.producto.findUnique({
      where: { id_producto: idProducto },
      select: {
        id_producto: true,
        estado: true,
      },
    });

    if (!producto) {
      throw new BadRequestException(`Producto inválido: ${idProducto}`);
    }

    if (!producto.estado) {
      throw new BadRequestException(`El producto ${idProducto} está inactivo`);
    }
  }

  private async getPrecioMinimoVentaProducto(
    idProducto: number,
    idBodega: number,
  ) {
    const ultimaRemisionCompra = await this.prisma.remision_compra.findFirst({
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

  private async validarDuplicadoExistencia(
    tx: Prisma.TransactionClient,
    args: {
      id_producto: number;
      id_bodega: number;
      lote: string;
      fecha_vencimiento: Date | null;
      excluirId?: number;
    },
  ) {
    const existente = await tx.existencias.findFirst({
      where: {
        id_producto: args.id_producto,
        id_bodega: args.id_bodega,
        lote: args.lote,
        fecha_vencimiento: args.fecha_vencimiento,
        ...(args.excluirId ? { id_existencia: { not: args.excluirId } } : {}),
      },
      select: { id_existencia: true },
    });

    if (existente) {
      throw new ConflictException(
        'Ya existe una existencia con el mismo producto, bodega, lote y fecha de vencimiento',
      );
    }
  }

  async create(dto: CreateExistenciaDto, opts: CreateOpts) {
    this.assertBodegaAccess(opts.idBodegaActiva, opts.bodegasPermitidas);

    return this.prisma.$transaction(async (tx) => {
      await this.validarProducto(tx, dto.id_producto);

      const lote = dto.lote?.trim() ?? '';
      const fechaVencimiento = dto.fecha_vencimiento
        ? new Date(dto.fecha_vencimiento)
        : null;

      await this.validarDuplicadoExistencia(tx, {
        id_producto: dto.id_producto,
        id_bodega: opts.idBodegaActiva,
        lote,
        fecha_vencimiento: fechaVencimiento,
      });

      return tx.existencias.create({
        data: {
          id_producto: dto.id_producto,
          id_bodega: opts.idBodegaActiva,
          nota: dto.nota ?? null,
          cantidad: new Prisma.Decimal(dto.cantidad ?? 0),
          fecha_vencimiento: fechaVencimiento,
          lote,
        },
        select: existenciaDetailSelect,
      });
    });
  }

  async findAll(args: {
    idBodegaActiva?: number;
    bodegasPermitidas?: number[];
  }) {
    const where: Prisma.existenciasWhereInput = {};

    if (args.idBodegaActiva !== undefined) {
      this.assertBodegaAccess(args.idBodegaActiva, args.bodegasPermitidas);
      where.id_bodega = args.idBodegaActiva;
    } else if (args.bodegasPermitidas?.length) {
      where.id_bodega = { in: args.bodegasPermitidas };
    }

    const existencias = await this.prisma.existencias.findMany({
      where,
      orderBy: [
        { id_producto: 'asc' },
        { fecha_vencimiento: 'asc' },
        { lote: 'asc' },
      ],
      select: existenciaListSelect,
    });

    return existencias.map((existencia) => {
      const cantidad = Number(existencia.cantidad);
      const cantidadReservada = Number(existencia.cantidad_reservada ?? 0);
      const cantidadDisponible = Math.max(0, cantidad - cantidadReservada);

      return {
        ...existencia,
        cantidad: cantidad,
        cantidad_reservada: cantidadReservada,
        cantidad_disponible: cantidadDisponible,
      };
    });
  }

  async findOne(id: number, opts?: ScopeOpts) {
    const existencia = await this.prisma.existencias.findUnique({
      where: { id_existencia: id },
      select: existenciaDetailSelect,
    });

    if (!existencia) {
      throw new NotFoundException('Existencia no encontrada');
    }

    if (
      opts?.bodegasPermitidas?.length &&
      !opts.bodegasPermitidas.includes(existencia.id_bodega)
    ) {
      throw new ForbiddenException('No tienes acceso a esta existencia');
    }

    return existencia;
  }

  async update(
    id: number,
    dto: UpdateExistenciaDto,
    opts: { idBodegaActiva: number; bodegasPermitidas?: number[] },
  ) {
    this.assertBodegaAccess(opts.idBodegaActiva, opts.bodegasPermitidas);

    const actual = await this.findOne(id, {
      bodegasPermitidas: opts.bodegasPermitidas,
    });

    if (actual.id_bodega !== opts.idBodegaActiva) {
      throw new ForbiddenException(
        'Solo puedes editar existencias de la bodega activa',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const nuevoProducto = dto.id_producto ?? actual.id_producto;
      const nuevoLote = dto.lote?.trim() ?? actual.lote ?? '';
      const nuevaFechaVencimiento =
        dto.fecha_vencimiento !== undefined
          ? dto.fecha_vencimiento
            ? new Date(dto.fecha_vencimiento)
            : null
          : actual.fecha_vencimiento;

      if (dto.id_producto) {
        await this.validarProducto(tx, dto.id_producto);
      }

      await this.validarDuplicadoExistencia(tx, {
        id_producto: nuevoProducto,
        id_bodega: actual.id_bodega,
        lote: nuevoLote,
        fecha_vencimiento: nuevaFechaVencimiento,
        excluirId: id,
      });

      return tx.existencias.update({
        where: { id_existencia: id },
        data: {
          id_producto: dto.id_producto ?? undefined,
          nota: dto.nota ?? undefined,
          cantidad:
            dto.cantidad !== undefined
              ? new Prisma.Decimal(dto.cantidad)
              : undefined,
          fecha_vencimiento:
            dto.fecha_vencimiento !== undefined
              ? dto.fecha_vencimiento
                ? new Date(dto.fecha_vencimiento)
                : null
              : undefined,
          lote: dto.lote !== undefined ? dto.lote.trim() : undefined,
        },
        select: existenciaDetailSelect,
      });
    });
  }

  async remove(id: number, opts?: ScopeOpts) {
    const actual = await this.findOne(id, {
      bodegasPermitidas: opts?.bodegasPermitidas,
    });

    if (Number(actual.cantidad) > 0) {
      throw new BadRequestException(
        'No puedes eliminar una existencia con cantidad mayor a 0',
      );
    }

    await this.prisma.existencias.delete({
      where: { id_existencia: id },
    });

    return {
      message: 'Existencia eliminada correctamente',
    };
  }

  async findProductosVista(opts: ProductosVistaOpts) {
    const scope = opts.scope ?? 'active';

    if (scope === 'active') {
      if (!opts.idBodegaActiva || Number.isNaN(opts.idBodegaActiva)) {
        throw new BadRequestException(
          'Bodega activa inválida para consultar productos-vista',
        );
      }

      this.assertBodegaAccess(opts.idBodegaActiva, opts.bodegasPermitidas);
    }

    const baseWhereExistencias: Prisma.existenciasWhereInput =
      scope === 'all'
        ? opts.bodegasPermitidas?.length
          ? { id_bodega: { in: opts.bodegasPermitidas } }
          : {}
        : { id_bodega: opts.idBodegaActiva! };

    const whereExistencias: Prisma.existenciasWhereInput = {
      ...baseWhereExistencias,
      cantidad: { gt: new Prisma.Decimal(0) },
    };

    const productos = await this.prisma.producto.findMany({
      orderBy: { nombre_producto: 'asc' },
      include: {
        categoria_producto: true,
        iva: true,
        existencias: {
          where: whereExistencias,
          orderBy: [{ fecha_vencimiento: 'asc' }, { lote: 'asc' }],
          include: {
            bodega: {
              select: {
                id_bodega: true,
                nombre_bodega: true,
              },
            },
          },
        },
      },
    });

    return Promise.all(
      productos.map(async (producto) => {
        const lotes = producto.existencias.map((existencia) => ({
          id_existencia: existencia.id_existencia,
          lote: existencia.lote,
          cantidad: Number(existencia.cantidad),
          fecha_vencimiento: existencia.fecha_vencimiento,
          id_bodega: existencia.id_bodega,
          nombre_bodega: existencia.bodega?.nombre_bodega ?? '',
          nota: existencia.nota ?? '',
        }));

        const stock_total = lotes.reduce(
          (sum, lote) => sum + Number(lote.cantidad),
          0,
        );

        const precio_minimo_venta =
          scope === 'active' && opts.idBodegaActiva
            ? await this.getPrecioMinimoVentaProducto(
              Number(producto.id_producto),
              Number(opts.idBodegaActiva),
            )
            : null;

        return {
          id_producto: producto.id_producto,
          nombre_producto: producto.nombre_producto,
          descripcion: producto.descripcion,
          id_categoria_producto: producto.id_categoria_producto,
          id_iva: producto.id_iva,
          estado: producto.estado,
          categoria_producto: producto.categoria_producto
            ? {
              id_categoria_producto:
                producto.categoria_producto.id_categoria_producto,
              nombre_categoria: producto.categoria_producto.nombre_categoria,
            }
            : null,
          iva: producto.iva
            ? {
              id_iva: producto.iva.id_iva,
              porcentaje: Number(producto.iva.porcentaje),
            }
            : null,
          stock_total,
          lotes,
          precio_minimo_venta,
        };
      }),
    );
  }
}