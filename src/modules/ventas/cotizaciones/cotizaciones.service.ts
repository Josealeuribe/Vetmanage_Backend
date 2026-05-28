import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateEstadoCotizacionDto } from './dto/update-estado-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';

type FindAllArgs = {
  idBodega?: number;
};

@Injectable()
export class CotizacionesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly includeCotizacion =
    Prisma.validator<Prisma.cotizacionInclude>()({
      cliente: true,
      bodega: true,
      usuario: true,
      estado_cotizacion: true,
      detalle_cotizacion: {
        include: {
          producto: true,
          iva: true,
        },
      },
    });

  private async assertBodegaExists(idBodega?: number) {
    if (idBodega === undefined) return;

    const bodega = await this.prisma.bodega.findUnique({
      where: { id_bodega: idBodega },
      select: { id_bodega: true },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega no existe');
    }
  }

  private async resolveIva(
    tx: Prisma.TransactionClient,
    productoIdIva: number,
    itemIdIva?: number,
  ) {
    const idIvaFinal = itemIdIva ?? productoIdIva;

    const iva = await tx.iva.findUnique({
      where: { id_iva: idIvaFinal },
      select: {
        id_iva: true,
        porcentaje: true,
      },
    });

    if (!iva) {
      throw new NotFoundException(`IVA ${idIvaFinal} no existe`);
    }

    return {
      idIvaFinal,
      ivaPorcentaje: iva.porcentaje,
    };
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

  // private async assertPrecioVentaValido(
  //   db: Prisma.TransactionClient | PrismaService,
  //   params: {
  //     idProducto: number;
  //     idBodega: number;
  //     precioUnitario: number;
  //     nombreProducto?: string | null;
  //   },
  // ) {
  //   const precioMinimo = await this.getPrecioMinimoVentaProducto(
  //     db,
  //     params.idProducto,
  //     params.idBodega,
  //   );

  //   if (precioMinimo === null) return;

  //   if (Number(params.precioUnitario) < Number(precioMinimo)) {
  //     const nombre = params.nombreProducto || `ID ${params.idProducto}`;

  //     throw new Error(
  //       `El precio de venta del producto "${nombre}" no puede ser menor al último precio de ingreso al inventario (${precioMinimo}).`,
  //     );
  //   }
  // }

  async create(dto: CreateCotizacionDto) {
    return this.prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUnique({
        where: { id_cliente: dto.id_cliente },
      });

      if (!cliente) {
        throw new NotFoundException('Cliente no existe');
      }

      const bodega = await tx.bodega.findUnique({
        where: { id_bodega: dto.id_bodega },
      });

      if (!bodega) {
        throw new NotFoundException('Bodega no existe');
      }

      const usuario = await tx.usuario.findUnique({
        where: { id_usuario: dto.id_usuario_creador },
      });

      if (!usuario) {
        throw new NotFoundException('Usuario no existe');
      }

      const estado = await tx.estado_cotizacion.findUnique({
        where: { id_estado_cotizacion: dto.id_estado_cotizacion },
      });

      if (!estado) {
        throw new NotFoundException('Estado de cotización no existe');
      }

      const cotizacion = await tx.cotizacion.create({
        data: {
          fecha: new Date(dto.fecha),
          fecha_vencimiento: new Date(dto.fecha_vencimiento),
          id_cliente: dto.id_cliente,
          id_bodega: dto.id_bodega,
          id_usuario_creador: dto.id_usuario_creador,
          id_estado_cotizacion: dto.id_estado_cotizacion,
          observaciones: dto.observaciones ?? null,
        },
      });

      for (const item of dto.detalle) {
        const producto = await tx.producto.findUnique({
          where: { id_producto: item.id_producto },
          select: {
            id_producto: true,
            id_iva: true,
            nombre_producto: true,
          },
        });

        if (!producto) {
          throw new NotFoundException(`Producto ${item.id_producto} no existe`);
        }

        // try {
        //   await this.assertPrecioVentaValido(tx, {
        //     idProducto: item.id_producto,
        //     idBodega: dto.id_bodega,
        //     precioUnitario: Number(item.precio_unitario),
        //     nombreProducto: producto.nombre_producto,
        //   });
        // } catch (error: any) {
        //   throw new BadRequestException(error?.message || 'Precio inválido');
        // }

        const { idIvaFinal, ivaPorcentaje } = await this.resolveIva(
          tx,
          producto.id_iva,
          item.id_iva,
        );

        await tx.detalle_cotizacion.create({
          data: {
            id_cotizacion: cotizacion.id_cotizacion,
            id_producto: item.id_producto,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            id_iva: idIvaFinal,
            iva_porcentaje: ivaPorcentaje,
          },
        });
      }

      return tx.cotizacion.update({
        where: { id_cotizacion: cotizacion.id_cotizacion },
        data: {
          codigo_cotizacion: `CT-${String(cotizacion.id_cotizacion).padStart(4, '0')}`,
        },
        include: this.includeCotizacion,
      });
    });
  }

  async findAll(args?: FindAllArgs) {
    await this.assertBodegaExists(args?.idBodega);

    return this.prisma.cotizacion.findMany({
      where:
        args?.idBodega !== undefined
          ? { id_bodega: args.idBodega }
          : undefined,
      include: this.includeCotizacion,
      orderBy: { id_cotizacion: 'desc' },
    });
  }

  async findOne(id: number) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id_cotizacion: id },
      include: this.includeCotizacion,
    });

    if (!cotizacion) {
      throw new NotFoundException('Cotización no existe');
    }

    return cotizacion;
  }

  async update(id: number, dto: UpdateCotizacionDto) {
    return this.prisma.$transaction(async (tx) => {
      const cotizacion = await tx.cotizacion.findUnique({
        where: { id_cotizacion: id },
      });

      if (!cotizacion) {
        throw new NotFoundException('Cotización no existe');
      }

      const cliente = await tx.cliente.findUnique({
        where: { id_cliente: dto.id_cliente },
      });

      if (!cliente) {
        throw new NotFoundException('Cliente no existe');
      }

      const bodega = await tx.bodega.findUnique({
        where: { id_bodega: dto.id_bodega },
      });

      if (!bodega) {
        throw new NotFoundException('Bodega no existe');
      }

      const estado = await tx.estado_cotizacion.findUnique({
        where: { id_estado_cotizacion: dto.id_estado_cotizacion },
      });

      if (!estado) {
        throw new NotFoundException('Estado de cotización no existe');
      }

      await tx.cotizacion.update({
        where: { id_cotizacion: id },
        data: {
          fecha: new Date(dto.fecha),
          fecha_vencimiento: new Date(dto.fecha_vencimiento),
          id_cliente: dto.id_cliente,
          id_bodega: dto.id_bodega,
          id_estado_cotizacion: dto.id_estado_cotizacion,
          observaciones: dto.observaciones ?? null,
        },
      });

      await tx.detalle_cotizacion.deleteMany({
        where: { id_cotizacion: id },
      });

      for (const item of dto.detalle) {
        const producto = await tx.producto.findUnique({
          where: { id_producto: item.id_producto },
          select: {
            id_producto: true,
            id_iva: true,
            nombre_producto: true,
          },
        });

        if (!producto) {
          throw new NotFoundException(`Producto ${item.id_producto} no existe`);
        }

        // try {
        //   await this.assertPrecioVentaValido(tx, {
        //     idProducto: item.id_producto,
        //     idBodega: dto.id_bodega,
        //     precioUnitario: Number(item.precio_unitario),
        //     nombreProducto: producto.nombre_producto,
        //   });
        // } catch (error: any) {
        //   throw new BadRequestException(error?.message || 'Precio inválido');
        // }

        const { idIvaFinal, ivaPorcentaje } = await this.resolveIva(
          tx,
          producto.id_iva,
          item.id_iva,
        );

        await tx.detalle_cotizacion.create({
          data: {
            id_cotizacion: id,
            id_producto: item.id_producto,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            id_iva: idIvaFinal,
            iva_porcentaje: ivaPorcentaje,
          },
        });
      }

      return tx.cotizacion.findUnique({
        where: { id_cotizacion: id },
        include: this.includeCotizacion,
      });
    });
  }

  async updateEstado(id: number, dto: UpdateEstadoCotizacionDto) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id_cotizacion: id },
      select: { id_cotizacion: true },
    });

    if (!cotizacion) {
      throw new NotFoundException('Cotización no existe');
    }

    const estado = await this.prisma.estado_cotizacion.findUnique({
      where: { id_estado_cotizacion: dto.id_estado_cotizacion },
      select: { id_estado_cotizacion: true },
    });

    if (!estado) {
      throw new NotFoundException('Estado de cotización no existe');
    }

    return this.prisma.cotizacion.update({
      where: { id_cotizacion: id },
      data: {
        id_estado_cotizacion: dto.id_estado_cotizacion,
      },
      include: this.includeCotizacion,
    });
  }
}