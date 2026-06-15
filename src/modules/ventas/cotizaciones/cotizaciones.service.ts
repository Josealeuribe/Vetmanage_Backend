import {
  BadRequestException,
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
  constructor(private readonly prisma: PrismaService) { }

  private readonly includeCotizacion =
    Prisma.validator<Prisma.cotizacionInclude>()({
      cliente: true,
      bodega: true,
      usuario: true,
      usuario_aprobo: {
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

  private normalizeEstado(value?: string | null) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
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

  private async getCostoReferenciaProducto(
    db: Prisma.TransactionClient | PrismaService,
    idProducto: number,
    idBodegaCliente: number,
  ) {
    const buscarCosto = async (soloBodegaCliente: boolean) => {
      const existencias = await db.existencias.findMany({
        where: {
          id_producto: idProducto,
          ...(soloBodegaCliente ? { id_bodega: idBodegaCliente } : {}),
          cantidad: {
            gt: 0,
          },
          precio_compra_unitario: {
            not: null,
          },
        },
        select: {
          id_existencia: true,
          id_bodega: true,
          lote: true,
          cantidad: true,
          cantidad_reservada: true,
          fecha_vencimiento: true,
          precio_compra_unitario: true,
          bodega: {
            select: {
              id_bodega: true,
              nombre_bodega: true,
            },
          },
        },
      });

      const disponibles = existencias
        .map((existencia) => {
          const cantidad = Number(existencia.cantidad);
          const reservada = Number(existencia.cantidad_reservada ?? 0);
          const cantidadDisponible = cantidad - reservada;
          const costo = Number(existencia.precio_compra_unitario ?? 0);

          return {
            ...existencia,
            cantidadDisponible,
            costo,
          };
        })
        .filter(
          (existencia) =>
            existencia.cantidadDisponible > 0 &&
            Number.isFinite(existencia.costo) &&
            existencia.costo > 0,
        );

      if (disponibles.length === 0) {
        return null;
      }

      disponibles.sort((a, b) => b.costo - a.costo);

      return disponibles[0];
    };

    const referenciaBodegaCliente = await buscarCosto(true);

    if (referenciaBodegaCliente) {
      return {
        id_existencia: referenciaBodegaCliente.id_existencia,
        id_bodega: referenciaBodegaCliente.bodega.id_bodega,
        nombre_bodega: referenciaBodegaCliente.bodega.nombre_bodega,
        lote: referenciaBodegaCliente.lote,
        fecha_vencimiento: referenciaBodegaCliente.fecha_vencimiento,
        cantidad_disponible: referenciaBodegaCliente.cantidadDisponible,
        costo_referencia: referenciaBodegaCliente.costo,
        origen: 'BODEGA_CLIENTE',
      };
    }

    const referenciaGlobal = await buscarCosto(false);

    if (!referenciaGlobal) {
      return null;
    }

    return {
      id_existencia: referenciaGlobal.id_existencia,
      id_bodega: referenciaGlobal.bodega.id_bodega,
      nombre_bodega: referenciaGlobal.bodega.nombre_bodega,
      lote: referenciaGlobal.lote,
      fecha_vencimiento: referenciaGlobal.fecha_vencimiento,
      cantidad_disponible: referenciaGlobal.cantidadDisponible,
      costo_referencia: referenciaGlobal.costo,
      origen:
        referenciaGlobal.id_bodega === idBodegaCliente
          ? 'BODEGA_CLIENTE'
          : 'OTRA_BODEGA',
    };
  }

  async create(dto: CreateCotizacionDto) {
    return this.prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUnique({
        where: { id_cliente: dto.id_cliente },
        select: {
          id_cliente: true,
          id_bodega: true,
        },
      });

      if (!cliente) {
        throw new NotFoundException('Cliente no existe');
      }

      if (!cliente.id_bodega) {
        throw new BadRequestException(
          'El cliente no tiene una bodega principal asignada',
        );
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
          id_bodega: cliente.id_bodega,
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

  async getCostoReferencia(idCliente: number, idProducto: number) {
    if (!Number.isFinite(idCliente) || idCliente <= 0) {
      throw new BadRequestException('Cliente inválido');
    }

    if (!Number.isFinite(idProducto) || idProducto <= 0) {
      throw new BadRequestException('Producto inválido');
    }

    const cliente = await this.prisma.cliente.findUnique({
      where: { id_cliente: idCliente },
      select: {
        id_cliente: true,
        id_bodega: true,
        bodega: {
          select: {
            id_bodega: true,
            nombre_bodega: true,
          },
        },
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no existe');
    }

    if (!cliente.id_bodega) {
      throw new BadRequestException(
        'El cliente no tiene una bodega principal asignada',
      );
    }

    const producto = await this.prisma.producto.findUnique({
      where: { id_producto: idProducto },
      select: {
        id_producto: true,
        nombre_producto: true,
      },
    });

    if (!producto) {
      throw new NotFoundException('Producto no existe');
    }

    const referencia = await this.getCostoReferenciaProducto(
      this.prisma,
      idProducto,
      cliente.id_bodega,
    );

    return {
      id_cliente: idCliente,
      id_producto: idProducto,
      nombre_producto: producto.nombre_producto,
      id_bodega_cliente: cliente.id_bodega,
      nombre_bodega_cliente: cliente.bodega.nombre_bodega,
      id_bodega_referencia: referencia?.id_bodega ?? null,
      nombre_bodega_referencia: referencia?.nombre_bodega ?? null,
      costo_referencia: referencia?.costo_referencia ?? null,
      lote_referencia: referencia?.lote ?? null,
      cantidad_disponible: referencia?.cantidad_disponible ?? 0,
      origen_referencia: referencia?.origen ?? 'SIN_EXISTENCIAS_CON_COSTO',
      criterio: referencia
        ? referencia.origen === 'BODEGA_CLIENTE'
          ? 'MAYOR_COSTO_LOTE_DISPONIBLE_BODEGA_CLIENTE_CON_IVA'
          : 'MAYOR_COSTO_LOTE_DISPONIBLE_GLOBAL_CON_IVA'
        : 'SIN_EXISTENCIAS_CON_COSTO',
    };
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
        include: {
          estado_cotizacion: true,
        },
      });

      if (!cotizacion) {
        throw new NotFoundException('Cotización no existe');
      }

      const estadoActual = String(
        cotizacion.estado_cotizacion?.nombre_estado ?? '',
      )
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

      if (estadoActual !== 'pendiente') {
        throw new BadRequestException(
          'Solo se pueden editar cotizaciones pendientes',
        );
      }

      const cliente = await tx.cliente.findUnique({
        where: { id_cliente: dto.id_cliente },
        select: {
          id_cliente: true,
          id_bodega: true,
        },
      });

      if (!cliente) {
        throw new NotFoundException('Cliente no existe');
      }

      if (!cliente.id_bodega) {
        throw new BadRequestException(
          'El cliente no tiene una bodega principal asignada',
        );
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
          id_bodega: cliente.id_bodega,
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

  async updateEstado(
    id: number,
    dto: UpdateEstadoCotizacionDto,
    idUsuarioGestion: number,
  ) {
    if (!Number.isFinite(idUsuarioGestion) || idUsuarioGestion <= 0) {
      throw new BadRequestException('Usuario de gestión inválido');
    }

    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id_cotizacion: id },
      select: {
        id_cotizacion: true,
        id_estado_cotizacion: true,
      },
    });

    if (!cotizacion) {
      throw new NotFoundException('Cotización no existe');
    }

    const estado = await this.prisma.estado_cotizacion.findUnique({
      where: { id_estado_cotizacion: dto.id_estado_cotizacion },
      select: {
        id_estado_cotizacion: true,
        nombre_estado: true,
      },
    });

    if (!estado) {
      throw new NotFoundException('Estado de cotización no existe');
    }

    const estadoNormalizado = this.normalizeEstado(estado.nombre_estado);

    const data: Prisma.cotizacionUncheckedUpdateInput = {
      id_estado_cotizacion: dto.id_estado_cotizacion,
    };

    if (estadoNormalizado === 'aprobada') {
      data.id_usuario_aprobo = idUsuarioGestion;
      data.fecha_aprobacion = new Date();
    }

    if (estadoNormalizado === 'anulada') {
      data.id_usuario_anulo = idUsuarioGestion;
      data.fecha_anulacion = new Date();
    }

    return this.prisma.cotizacion.update({
      where: { id_cotizacion: id },
      data,
      include: this.includeCotizacion,
    });
  }
}