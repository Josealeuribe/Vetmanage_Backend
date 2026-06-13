import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateFacturaDesdeRemisionesDto } from './dto/create-factura-desde-remisiones.dto';
import { CreateAbonoDto } from './dto/create-abono.dto';

@Injectable()
export class PagosAbonosService {
  constructor(private readonly prisma: PrismaService) { }

  private readonly facturaInclude = {
    cliente: true,
    estado_factura: true,
    bodega: true,
    usuario_creador: {
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
    pagos_abonos: {
      include: {
        metodo_pago: true,
        usuario_registro: {
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
      },
    },
    remision_venta: {
      include: {
        orden_venta: {
          include: {
            bodega: true,
          },
        },
        cliente: true,
        estado_remision_venta: true,
        detalle_remision_venta: {
          include: {
            existencias: {
              include: {
                producto: true,
                bodega: true,
              },
            },
          },
        },
      },
    },
  } as const;

  private round2(value: number) {
    return Number(value.toFixed(2));
  }

  private normalizeText(value?: string | null) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private isEstadoEntregado(nombre?: string | null) {
    return this.normalizeText(nombre).includes('entreg');
  }

  private isEstadoAnulado(nombre?: string | null) {
    return this.normalizeText(nombre).includes('anulad');
  }

  private parseFecha(value: string, campo: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${campo} inválida`);
    }

    return date;
  }

  private generarCodigoTemporal() {
    return `TMP-PG-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  private matchesBodegaInRemision(remision: any, idBodega?: number) {
    if (!idBodega) return true;

    const remisionBodegaId = Number(
      remision?.orden_venta?.id_bodega ??
      remision?.orden_venta?.bodega?.id_bodega ??
      0,
    );

    return remisionBodegaId === Number(idBodega);
  }

  private matchesBodegaInFactura(factura: any, idBodega?: number) {
    if (!idBodega) return true;

    const idBodegaFactura = Number(factura?.id_bodega ?? 0);

    if (idBodegaFactura === Number(idBodega)) {
      return true;
    }

    const remisiones = Array.isArray(factura?.remision_venta)
      ? factura.remision_venta
      : [];

    return remisiones.some((remision: any) =>
      this.matchesBodegaInRemision(remision, idBodega),
    );
  }

  private calcularResumenRemision(remision: any) {
    const subtotal = remision.detalle_remision_venta.reduce(
      (acc: number, item: any) =>
        acc + Number(item.cantidad) * Number(item.precio_unitario),
      0,
    );

    const totalIva = remision.detalle_remision_venta.reduce(
      (acc: number, item: any) =>
        acc +
        Number(item.cantidad) *
        Number(item.precio_unitario) *
        (Number(item.iva ?? 0) / 100),
      0,
    );

    const total = subtotal + totalIva;

    return {
      subtotal: this.round2(subtotal),
      total_iva: this.round2(totalIva),
      total: this.round2(total),
    };
  }

  private async buscarEstadoRemisionVentaId(
    db: any,
    nombres: string[],
    obligatorio = false,
  ) {
    const estado = await db.estado_remision_venta.findFirst({
      where: {
        nombre_estado: {
          in: nombres,
        },
      },
      orderBy: {
        id_estado_remision_venta: 'asc',
      },
    });

    if (!estado && obligatorio) {
      throw new BadRequestException(
        `No existe un estado de remisión válido para: ${nombres.join(', ')}`,
      );
    }

    return estado?.id_estado_remision_venta ?? null;
  }

  private construirFacturaRespuesta(factura: any) {
    const remisiones = factura.remision_venta.map((remision: any) => {
      const resumen = this.calcularResumenRemision(remision);
      return {
        ...remision,
        resumen,
      };
    });

    const subtotal = remisiones.reduce(
      (acc: number, remision: any) => acc + remision.resumen.subtotal,
      0,
    );

    const totalIva = remisiones.reduce(
      (acc: number, remision: any) => acc + remision.resumen.total_iva,
      0,
    );

    const totalAbonado = factura.pagos_abonos
      .filter((pago: any) => pago.estado)
      .reduce((acc: number, pago: any) => acc + Number(pago.valor), 0);

    const totalFactura = Number(factura.total);
    const saldoPendiente = Math.max(0, totalFactura - totalAbonado);

    return {
      ...factura,
      remision_venta: remisiones,
      resumen_pago: {
        subtotal: this.round2(subtotal),
        total_iva: this.round2(totalIva),
        total_factura: this.round2(totalFactura),
        total_abonado: this.round2(totalAbonado),
        saldo_pendiente: this.round2(saldoPendiente),
      },
    };
  }

  private async obtenerFacturaCompleta(db: any, idFactura: number) {
    return db.factura.findUnique({
      where: { id_factura: idFactura },
      include: this.facturaInclude,
    });
  }

  private async buscarEstadoFacturaId(
    db: any,
    nombres: string[],
    obligatorio = false,
  ) {
    const estado = await db.estado_factura.findFirst({
      where: {
        nombre_estado_factura: {
          in: nombres,
        },
      },
      orderBy: {
        id_estado_factura: 'asc',
      },
    });

    if (!estado && obligatorio) {
      throw new BadRequestException(
        `No existe un estado de factura válido para: ${nombres.join(', ')}`,
      );
    }

    return estado?.id_estado_factura ?? null;
  }

  private async actualizarEstadoFacturaSegunSaldo(db: any, idFactura: number) {
    const factura = await db.factura.findUnique({
      where: { id_factura: idFactura },
      include: {
        pagos_abonos: true,
      },
    });

    if (!factura) {
      throw new NotFoundException('Factura no existe');
    }

    const totalFactura = Number(factura.total);
    const totalAbonado = factura.pagos_abonos
      .filter((p: any) => p.estado)
      .reduce((acc: number, p: any) => acc + Number(p.valor), 0);

    const saldoPendiente = totalFactura - totalAbonado;

    let nuevoEstadoId: number | null = null;

    if (saldoPendiente <= 0) {
      nuevoEstadoId = await this.buscarEstadoFacturaId(
        db,
        ['Pagada', 'Pagado'],
        true,
      );
    } else if (totalAbonado > 0) {
      nuevoEstadoId = await this.buscarEstadoFacturaId(
        db,
        ['Abonada', 'Abonado', 'Parcial', 'Pago parcial'],
        false,
      );

      if (!nuevoEstadoId) {
        nuevoEstadoId = await this.buscarEstadoFacturaId(
          db,
          ['Pendiente'],
          true,
        );
      }
    } else {
      nuevoEstadoId = await this.buscarEstadoFacturaId(
        db,
        ['Pendiente'],
        true,
      );
    }

    await db.factura.update({
      where: { id_factura: idFactura },
      data: {
        id_estado_factura: nuevoEstadoId,
      },
    });
  }

  async findCatalogos() {
    const [metodosPago, estadosFactura] = await Promise.all([
      this.prisma.metodo_pago.findMany({
        orderBy: { id_metodo: 'asc' },
      }),
      this.prisma.estado_factura.findMany({
        orderBy: { id_estado_factura: 'asc' },
      }),
    ]);

    return {
      metodos_pago: metodosPago,
      estados_factura: estadosFactura,
    };
  }

  async findRemisionesPendientesPorCliente(idCliente: number, idBodega?: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id_cliente: idCliente },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no existe');
    }

    const remisiones = await this.prisma.remision_venta.findMany({
      where: {
        id_cliente: idCliente,
        id_factura: null,
      },
      include: {
        orden_venta: {
          include: {
            bodega: true,
          },
        },
        cliente: true,
        estado_remision_venta: true,
        detalle_remision_venta: {
          include: {
            existencias: {
              include: {
                producto: true,
                bodega: true,
              },
            },
          },
        },
      },
      orderBy: {
        id_remision_venta: 'desc',
      },
    });

    const remisionesFiltradas = remisiones.filter(
      (remision) =>
        this.matchesBodegaInRemision(remision, idBodega) &&
        this.isEstadoEntregado(remision.estado_remision_venta?.nombre_estado) &&
        !this.isEstadoAnulado(remision.estado_remision_venta?.nombre_estado),
    );

    return remisionesFiltradas.map((remision) => ({
      ...remision,
      resumen: this.calcularResumenRemision(remision),
    }));
  }

  async createFacturaDesdeRemisiones(
    dto: CreateFacturaDesdeRemisionesDto,
    idUsuario: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const remisionesIds = Array.from(
        new Set(dto.id_remisiones.map((id) => Number(id))),
      );

      if (remisionesIds.length === 0) {
        throw new BadRequestException('Debes seleccionar al menos una remisión');
      }

      if (remisionesIds.length !== dto.id_remisiones.length) {
        throw new BadRequestException('No puedes enviar remisiones repetidas');
      }

      const cliente = await tx.cliente.findUnique({
        where: { id_cliente: dto.id_cliente },
      });

      if (!cliente) {
        throw new NotFoundException('Cliente no existe');
      }

      const fechaFactura = this.parseFecha(dto.fecha_factura, 'Fecha de pago');

      const fechaVencimiento = dto.fecha_vencimiento
        ? this.parseFecha(dto.fecha_vencimiento, 'Fecha de vencimiento')
        : null;

      if (fechaVencimiento && fechaVencimiento < fechaFactura) {
        throw new BadRequestException(
          'La fecha de vencimiento no puede ser anterior a la fecha del pago',
        );
      }

      const remisiones = await tx.remision_venta.findMany({
        where: {
          id_remision_venta: {
            in: remisionesIds,
          },
        },
        include: {
          cliente: true,
          estado_remision_venta: true,
          orden_venta: {
            include: {
              bodega: true,
            },
          },
          detalle_remision_venta: true,
        },
      });

      if (remisiones.length !== remisionesIds.length) {
        throw new BadRequestException(
          'Una o más remisiones no existen o no pudieron cargarse',
        );
      }

      for (const remision of remisiones) {
        if (remision.id_cliente !== dto.id_cliente) {
          throw new BadRequestException(
            `La remisión ${remision.id_remision_venta} no pertenece al cliente enviado`,
          );
        }

        if (remision.id_factura) {
          throw new BadRequestException(
            `La remisión ${remision.id_remision_venta} ya está asociada a un pago`,
          );
        }

        if (this.isEstadoAnulado(remision.estado_remision_venta?.nombre_estado)) {
          throw new BadRequestException(
            `La remisión ${remision.id_remision_venta} está anulada`,
          );
        }

        if (!this.isEstadoEntregado(remision.estado_remision_venta?.nombre_estado)) {
          throw new BadRequestException(
            `La remisión ${remision.id_remision_venta} debe estar entregada para poder agregarse a un pago`,
          );
        }

        if (!remision.detalle_remision_venta.length) {
          throw new BadRequestException(
            `La remisión ${remision.id_remision_venta} no tiene detalle`,
          );
        }
      }

      const bodegaIds = Array.from(
        new Set(
          remisiones
            .map((remision) => remision.orden_venta?.id_bodega)
            .filter((id): id is number => Boolean(id)),
        ),
      );

      if (bodegaIds.length > 1) {
        throw new BadRequestException(
          'No puedes crear un pago con remisiones de diferentes bodegas',
        );
      }

      const idBodegaPago = bodegaIds[0] ?? null;

      const remisionesSnapshot = remisiones
        .map(
          (remision) =>
            remision.codigo_remision_venta ??
            `RV-${String(remision.id_remision_venta).padStart(4, '0')}`,
        )
        .join(', ');

      const bodegaSnapshot =
        Array.from(
          new Set(
            remisiones
              .map((remision) => remision.orden_venta?.bodega?.nombre_bodega)
              .filter(Boolean),
          ),
        ).join(', ') || null;

      const totalFactura = remisiones.reduce((acc, remision) => {
        const resumen = this.calcularResumenRemision(remision);
        return acc + resumen.total;
      }, 0);

      const estadoPendienteId = await this.buscarEstadoFacturaId(
        tx,
        ['Pendiente'],
        true,
      );

      const estadoFacturadaRemisionId = await this.buscarEstadoRemisionVentaId(
        tx,
        ['Facturada', 'Facturado'],
        true,
      );

      const facturaCreada = await tx.factura.create({
        data: {
          codigo_factura: this.generarCodigoTemporal(),
          fecha_factura: fechaFactura,
          fecha_vencimiento: fechaVencimiento,
          total: this.round2(totalFactura),
          nota: dto.nota?.trim() || null,
          id_cliente: dto.id_cliente,
          id_bodega: idBodegaPago,
          id_estado_factura: estadoPendienteId!,
          id_usuario_creador: idUsuario,
          remisiones_snapshot: remisionesSnapshot,
          bodega_snapshot: bodegaSnapshot,
        },
      });

      await tx.factura.update({
        where: { id_factura: facturaCreada.id_factura },
        data: {
          codigo_factura: `PG-${String(facturaCreada.id_factura).padStart(4, '0')}`,
        },
      });

      const remisionesActualizadas = await tx.remision_venta.updateMany({
        where: {
          id_remision_venta: {
            in: remisionesIds,
          },
          id_factura: null,
        },
        data: {
          id_factura: facturaCreada.id_factura,
          id_estado_remision_venta: estadoFacturadaRemisionId!,
        },
      });

      if (remisionesActualizadas.count !== remisionesIds.length) {
        throw new BadRequestException(
          'Una o más remisiones ya fueron asociadas a otro pago',
        );
      }

      const facturaCompleta = await this.obtenerFacturaCompleta(
        tx,
        facturaCreada.id_factura,
      );

      if (!facturaCompleta) {
        throw new NotFoundException('No se pudo reconstruir el pago creado');
      }

      return this.construirFacturaRespuesta(facturaCompleta);
    });
  }

  async findAllFacturas(idBodega?: number) {
    const facturas = await this.prisma.factura.findMany({
      include: this.facturaInclude,
      orderBy: {
        id_factura: 'desc',
      },
    });

    return facturas
      .filter((factura) => this.matchesBodegaInFactura(factura, idBodega))
      .map((factura) => this.construirFacturaRespuesta(factura));
  }

  async findFacturasPorCliente(idCliente: number, idBodega?: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id_cliente: idCliente },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no existe');
    }

    const facturas = await this.prisma.factura.findMany({
      where: {
        id_cliente: idCliente,
      },
      include: this.facturaInclude,
      orderBy: {
        id_factura: 'desc',
      },
    });

    return facturas
      .filter((factura) => this.matchesBodegaInFactura(factura, idBodega))
      .map((factura) => this.construirFacturaRespuesta(factura));
  }

  async findFactura(id: number) {
    const factura = await this.prisma.factura.findUnique({
      where: { id_factura: id },
      include: this.facturaInclude,
    });

    if (!factura) {
      throw new NotFoundException('Factura no existe');
    }

    return this.construirFacturaRespuesta(factura);
  }

  async addAbono(
    idFactura: number,
    dto: CreateAbonoDto,
    idUsuario: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const valorAbono = Number(dto.valor);

      if (!Number.isFinite(valorAbono) || valorAbono <= 0) {
        throw new BadRequestException('El valor del abono debe ser mayor a cero');
      }

      const fechaPago = this.parseFecha(dto.fecha_pago, 'Fecha de abono');

      const factura = await tx.factura.findUnique({
        where: { id_factura: idFactura },
        include: {
          estado_factura: true,
          pagos_abonos: true,
        },
      });

      if (!factura) {
        throw new NotFoundException('Pago no existe');
      }

      if (this.isEstadoAnulado(factura.estado_factura?.nombre_estado_factura)) {
        throw new BadRequestException(
          'No puedes agregar abonos a un pago anulado',
        );
      }

      const metodoPago = await tx.metodo_pago.findUnique({
        where: { id_metodo: dto.id_metodo },
      });

      if (!metodoPago) {
        throw new NotFoundException('Método de pago no existe');
      }

      const totalAbonadoActual = factura.pagos_abonos
        .filter((p) => p.estado)
        .reduce((acc, p) => acc + Number(p.valor), 0);

      const saldoPendiente = Number(factura.total) - totalAbonadoActual;

      if (saldoPendiente <= 0) {
        throw new BadRequestException(
          'El pago ya se encuentra completamente abonado',
        );
      }

      if (valorAbono > saldoPendiente) {
        throw new BadRequestException(
          `El abono supera el saldo pendiente. Saldo actual: ${this.round2(
            saldoPendiente,
          )}`,
        );
      }

      await tx.pagos_abonos.create({
        data: {
          fecha_pago: fechaPago,
          valor: this.round2(valorAbono),
          id_metodo: dto.id_metodo,
          id_factura: idFactura,
          id_usuario_registro: idUsuario,
          estado: true,
        },
      });

      await this.actualizarEstadoFacturaSegunSaldo(tx, idFactura);

      const facturaCompleta = await this.obtenerFacturaCompleta(tx, idFactura);

      if (!facturaCompleta) {
        throw new NotFoundException(
          'No se pudo reconstruir el pago actualizado',
        );
      }

      return this.construirFacturaRespuesta(facturaCompleta);
    });
  }

  async anularAbono(idPago: number, idUsuario: number) {
    return this.prisma.$transaction(async (tx) => {
      const pago = await tx.pagos_abonos.findUnique({
        where: { id_pago: idPago },
      });

      if (!pago) {
        throw new NotFoundException('Abono no existe');
      }

      if (!pago.estado) {
        throw new BadRequestException('El abono ya está anulado');
      }

      await tx.pagos_abonos.update({
        where: { id_pago: idPago },
        data: {
          estado: false,
          fecha_anulacion: new Date(),
          id_usuario_anulo: idUsuario,
        },
      });

      await this.actualizarEstadoFacturaSegunSaldo(tx, pago.id_factura);

      const facturaCompleta = await this.obtenerFacturaCompleta(
        tx,
        pago.id_factura,
      );

      if (!facturaCompleta) {
        throw new NotFoundException(
          'No se pudo reconstruir el pago luego de anular el abono',
        );
      }

      return {
        message: 'Abono anulado correctamente',
        factura: this.construirFacturaRespuesta(facturaCompleta),
      };
    });
  }

  async anularFactura(idFactura: number, idUsuario: number) {
    await this.prisma.$transaction(async (tx) => {
      const factura = await tx.factura.findUnique({
        where: { id_factura: idFactura },
        include: {
          estado_factura: true,
          pagos_abonos: true,
          remision_venta: true,
        },
      });

      if (!factura) {
        throw new NotFoundException('Pago no encontrado');
      }

      if (this.isEstadoAnulado(factura.estado_factura?.nombre_estado_factura)) {
        throw new BadRequestException('El pago ya está anulado');
      }

      const tieneAbonosActivos = factura.pagos_abonos.some(
        (pago) => pago.estado === true,
      );

      if (tieneAbonosActivos) {
        throw new BadRequestException(
          'No puedes anular un pago con abonos activos. Primero debes anular los abonos registrados.',
        );
      }

      const estadoAnuladaFacturaId = await this.buscarEstadoFacturaId(
        tx,
        ['Anulada', 'Anulado'],
        true,
      );

      const estadoEntregadaRemisionId = await this.buscarEstadoRemisionVentaId(
        tx,
        ['Entregado', 'Entregada'],
        true,
      );

      await tx.remision_venta.updateMany({
        where: {
          id_factura: idFactura,
        },
        data: {
          id_factura: null,
          id_estado_remision_venta: estadoEntregadaRemisionId!,
        },
      });

      await tx.factura.update({
        where: {
          id_factura: idFactura,
        },
        data: {
          id_estado_factura: estadoAnuladaFacturaId!,
          fecha_anulacion: new Date(),
          id_usuario_anulo: idUsuario,
        },
      });
    });

    const facturaActualizada = await this.findFactura(idFactura);

    return {
      message: 'Pago anulado correctamente',
      factura: facturaActualizada,
    };
  }
}