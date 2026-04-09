import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificacionesQueryDto } from './dto/notificaciones-query.dto';

interface AuthUser {
  id_usuario: number;
  email: string;
  id_rol: number;
  id_bodega_activa?: number | null;
  rol: string;
  permisos: string[];
}

type NotificationType = 'traslado' | 'vencimiento' | 'stockBajo';
type NotificationPriority = 'alta' | 'media' | 'baja';

interface NotificationSeed {
  hash_unico: string;
  tipo: NotificationType;
  prioridad: NotificationPriority;
  titulo: string;
  descripcion: string;
  modulo: 'traslados' | 'existencias';
  accion: 'detalle';
  entidad_tipo: 'traslado' | 'producto' | 'existencia';
  entidad_id: string;
  ruta: string;
  id_bodega?: number | null;
  id_bodega_relacionada?: number | null;
  fecha_evento?: Date | null;
  metadata?: Record<string, any> | null;
}

const ESTADOS_TRASLADO = {
  PENDIENTE: 1,
  ENVIADO: 2,
  RECIBIDO: 3,
  ANULADO: 4,
} as const;

const UMBRAL_STOCK_BAJO = 10;
const DIAS_VENCIMIENTO_ALERTA = 30;

@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotificaciones(query: NotificacionesQueryDto, user: AuthUser) {
    const scope = await this.resolveBodegaScope(user, query.id_bodega);
    await this.syncForUser(user, scope.ids_bodegas);

    const where = {
      id_usuario: user.id_usuario,
      activa: true,
      archivada: false,
      eliminada: false,
      ...(query.solo_no_leidas ? { leida: false } : {}),
      ...this.buildScopeWhere(scope.ids_bodegas),
    };

    const rows = await this.prisma.notificacion_usuario.findMany({
      where,
      orderBy: [{ leida: 'asc' }, { fecha_evento: 'desc' }, { fecha_generada: 'desc' }],
      take: query.limit ?? 50,
    });

    const unreadCount = await this.prisma.notificacion_usuario.count({
      where: {
        id_usuario: user.id_usuario,
        activa: true,
        archivada: false,
        eliminada: false,
        leida: false,
        ...this.buildScopeWhere(scope.ids_bodegas),
      },
    });

    return {
      data: rows.map((row) => this.mapNotification(row)),
      unreadCount,
      scope: {
        ids_bodegas: scope.ids_bodegas,
      },
    };
  }

  async getContador(query: NotificacionesQueryDto, user: AuthUser) {
    const scope = await this.resolveBodegaScope(user, query.id_bodega);
    await this.syncForUser(user, scope.ids_bodegas);

    const unreadCount = await this.prisma.notificacion_usuario.count({
      where: {
        id_usuario: user.id_usuario,
        activa: true,
        archivada: false,
        eliminada: false,
        leida: false,
        ...this.buildScopeWhere(scope.ids_bodegas),
      },
    });

    return { unreadCount };
  }

  async sincronizar(query: NotificacionesQueryDto, user: AuthUser) {
    const scope = await this.resolveBodegaScope(user, query.id_bodega);
    const syncResult = await this.syncForUser(user, scope.ids_bodegas);

    const unreadCount = await this.prisma.notificacion_usuario.count({
      where: {
        id_usuario: user.id_usuario,
        activa: true,
        archivada: false,
        eliminada: false,
        leida: false,
        ...this.buildScopeWhere(scope.ids_bodegas),
      },
    });

    return {
      ...syncResult,
      unreadCount,
      scope: {
        ids_bodegas: scope.ids_bodegas,
      },
    };
  }

  async marcarLeida(id: number, user: AuthUser) {
    const notification = await this.prisma.notificacion_usuario.findFirst({
      where: {
        id_notificacion_usuario: id,
        id_usuario: user.id_usuario,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    const updated = await this.prisma.notificacion_usuario.update({
      where: { id_notificacion_usuario: id },
      data: {
        leida: true,
        fecha_leida: notification.leida ? notification.fecha_leida : new Date(),
      },
    });

    return this.mapNotification(updated);
  }

  async marcarTodasLeidas(query: NotificacionesQueryDto, user: AuthUser) {
    const scope = await this.resolveBodegaScope(user, query.id_bodega);

    const result = await this.prisma.notificacion_usuario.updateMany({
      where: {
        id_usuario: user.id_usuario,
        activa: true,
        archivada: false,
        eliminada: false,
        leida: false,
        ...this.buildScopeWhere(scope.ids_bodegas),
      },
      data: {
        leida: true,
        fecha_leida: new Date(),
      },
    });

    return {
      updated: result.count,
    };
  }

  async eliminar(id: number, user: AuthUser) {
    const notification = await this.prisma.notificacion_usuario.findFirst({
      where: {
        id_notificacion_usuario: id,
        id_usuario: user.id_usuario,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    await this.prisma.notificacion_usuario.update({
      where: { id_notificacion_usuario: id },
      data: {
        eliminada: true,
        fecha_eliminada: new Date(),
      },
    });

    return {
      message: 'Notificación eliminada correctamente',
    };
  }

  private async syncForUser(user: AuthUser, scopeBodegas: number[]) {
    const alerts = await this.buildAlerts(scopeBodegas);
    const hashes = alerts.map((item) => item.hash_unico);

    const existing = hashes.length
      ? await this.prisma.notificacion_usuario.findMany({
          where: {
            id_usuario: user.id_usuario,
            hash_unico: {
              in: hashes,
            },
          },
        })
      : [];

    const existingMap = new Map(
      existing.map((item) => [item.hash_unico, item]),
    );

    const operations: any[] = [];
    const now = new Date();

    for (const alert of alerts) {
      const current = existingMap.get(alert.hash_unico);

      const commonData = {
        tipo: alert.tipo,
        prioridad: alert.prioridad,
        titulo: alert.titulo,
        descripcion: alert.descripcion,
        modulo: alert.modulo,
        accion: alert.accion,
        entidad_tipo: alert.entidad_tipo,
        entidad_id: alert.entidad_id,
        ruta: alert.ruta,
        metadata: alert.metadata ? JSON.stringify(alert.metadata) : null,
        id_bodega: alert.id_bodega ?? null,
        id_bodega_relacionada: alert.id_bodega_relacionada ?? null,
        fecha_evento: alert.fecha_evento ?? null,
        activa: true,
      };

      if (!current) {
        operations.push(
          this.prisma.notificacion_usuario.create({
            data: {
              id_usuario: user.id_usuario,
              hash_unico: alert.hash_unico,
              ...commonData,
              leida: false,
              archivada: false,
              eliminada: false,
              fecha_generada: now,
              fecha_leida: null,
              fecha_archivada: null,
              fecha_eliminada: null,
            },
          }),
        );
        continue;
      }

      if (!current.activa) {
        operations.push(
          this.prisma.notificacion_usuario.update({
            where: {
              id_notificacion_usuario: current.id_notificacion_usuario,
            },
            data: {
              ...commonData,
              leida: false,
              archivada: false,
              eliminada: false,
              fecha_generada: now,
              fecha_leida: null,
              fecha_archivada: null,
              fecha_eliminada: null,
            },
          }),
        );
        continue;
      }

      operations.push(
        this.prisma.notificacion_usuario.update({
          where: {
            id_notificacion_usuario: current.id_notificacion_usuario,
          },
          data: {
            ...commonData,
          },
        }),
      );
    }

    const deactivateWhere: any = {
      id_usuario: user.id_usuario,
      activa: true,
      tipo: {
        in: ['traslado', 'vencimiento', 'stockBajo'],
      },
      ...this.buildScopeWhere(scopeBodegas),
    };

    if (hashes.length > 0) {
      deactivateWhere.hash_unico = {
        notIn: hashes,
      };
    }

    operations.push(
      this.prisma.notificacion_usuario.updateMany({
        where: deactivateWhere,
        data: {
          activa: false,
        },
      }),
    );

    if (operations.length > 0) {
      await this.prisma.$transaction(operations);
    }

    return {
      generated: alerts.length,
    };
  }

  private async buildAlerts(scopeBodegas: number[]): Promise<NotificationSeed[]> {
    const [traslados, existencias] = await Promise.all([
      this.prisma.traslado.findMany({
        where: {
          id_estado_traslado: {
            in: [ESTADOS_TRASLADO.PENDIENTE, ESTADOS_TRASLADO.ENVIADO],
          },
          OR: [
            {
              id_bodega_origen: {
                in: scopeBodegas,
              },
            },
            {
              id_bodega_destino: {
                in: scopeBodegas,
              },
            },
          ],
        },
        select: {
          id_traslado: true,
          codigo_traslado: true,
          fecha_traslado: true,
          id_estado_traslado: true,
          id_bodega_origen: true,
          id_bodega_destino: true,
          bodega_traslado_id_bodega_origenTobodega: {
            select: {
              nombre_bodega: true,
            },
          },
          bodega_traslado_id_bodega_destinoTobodega: {
            select: {
              nombre_bodega: true,
            },
          },
          _count: {
            select: {
              detalle_traslado: true,
            },
          },
        },
      }),

      this.prisma.existencias.findMany({
        where: {
          id_bodega: {
            in: scopeBodegas,
          },
        },
        select: {
          id_existencia: true,
          id_producto: true,
          id_bodega: true,
          cantidad: true,
          cantidad_reservada: true,
          fecha_vencimiento: true,
          lote: true,
          producto: {
            select: {
              nombre_producto: true,
              estado: true,
            },
          },
          bodega: {
            select: {
              nombre_bodega: true,
            },
          },
        },
      }),
    ]);

    const alerts: NotificationSeed[] = [];
    alerts.push(...this.buildTrasladoAlerts(traslados));
    alerts.push(...this.buildStockAlerts(existencias));
    alerts.push(...this.buildVencimientoAlerts(existencias));

    const prioridadPeso: Record<NotificationPriority, number> = {
      alta: 3,
      media: 2,
      baja: 1,
    };

    return alerts.sort((a, b) => {
      const diffPrioridad =
        prioridadPeso[b.prioridad] - prioridadPeso[a.prioridad];

      if (diffPrioridad !== 0) {
        return diffPrioridad;
      }

      const fechaA = a.fecha_evento ? new Date(a.fecha_evento).getTime() : 0;
      const fechaB = b.fecha_evento ? new Date(b.fecha_evento).getTime() : 0;

      return fechaB - fechaA;
    });
  }

  private buildTrasladoAlerts(traslados: any[]): NotificationSeed[] {
    const hoy = new Date();

    return traslados.map((traslado) => {
      const diasTranscurridos = this.diffDays(traslado.fecha_traslado, hoy);
      const prioridad =
        diasTranscurridos > 3 ? 'alta' : diasTranscurridos > 1 ? 'media' : 'baja';

      const codigo = traslado.codigo_traslado || `TR-${traslado.id_traslado}`;
      const origen =
        traslado.bodega_traslado_id_bodega_origenTobodega?.nombre_bodega ||
        'Bodega origen';
      const destino =
        traslado.bodega_traslado_id_bodega_destinoTobodega?.nombre_bodega ||
        'Bodega destino';

      const esEnviado =
        Number(traslado.id_estado_traslado) === ESTADOS_TRASLADO.ENVIADO;

      return {
        hash_unico: `traslado:${traslado.id_traslado}`,
        tipo: 'traslado',
        prioridad,
        titulo: esEnviado
          ? `Traslado en tránsito: ${codigo}`
          : `Traslado pendiente: ${codigo}`,
        descripcion: esEnviado
          ? `De ${origen} a ${destino} - ${traslado._count.detalle_traslado} producto(s) - ${diasTranscurridos} día(s) en tránsito`
          : `De ${origen} a ${destino} - ${traslado._count.detalle_traslado} producto(s) - pendiente por enviar`,
        modulo: 'traslados',
        accion: 'detalle',
        entidad_tipo: 'traslado',
        entidad_id: String(traslado.id_traslado),
        ruta: `/app/traslados/${traslado.id_traslado}/ver`,
        id_bodega: traslado.id_bodega_origen,
        id_bodega_relacionada: traslado.id_bodega_destino,
        fecha_evento: traslado.fecha_traslado,
        metadata: {
          id: traslado.id_traslado,
          codigo: codigo,
          bodegaOrigen: origen,
          bodegaDestino: destino,
          items: traslado._count.detalle_traslado,
          fecha: this.toDateOnlyString(traslado.fecha_traslado),
          estado: esEnviado ? 'Enviado' : 'Pendiente',
        },
      };
    });
  }

  private buildStockAlerts(existencias: any[]): NotificationSeed[] {
    const grouped = new Map<
      string,
      {
        id_producto: number;
        id_bodega: number;
        producto: string;
        bodega: string;
        stock: number;
      }
    >();

    for (const row of existencias) {
      if (!row.producto?.estado) continue;

      const disponible = Math.max(
        this.toNumber(row.cantidad) - this.toNumber(row.cantidad_reservada),
        0,
      );

      const key = `${row.id_producto}:${row.id_bodega}`;
      const current = grouped.get(key);

      if (!current) {
        grouped.set(key, {
          id_producto: row.id_producto,
          id_bodega: row.id_bodega,
          producto: row.producto?.nombre_producto || 'Producto',
          bodega: row.bodega?.nombre_bodega || 'Bodega',
          stock: disponible,
        });
        continue;
      }

      current.stock += disponible;
    }

    const alerts: NotificationSeed[] = [];

    for (const item of grouped.values()) {
      if (item.stock <= 0 || item.stock >= UMBRAL_STOCK_BAJO) continue;

      alerts.push({
        hash_unico: `stock-bajo:${item.id_producto}:${item.id_bodega}`,
        tipo: 'stockBajo',
        prioridad: item.stock < 5 ? 'alta' : 'media',
        titulo: `Stock bajo: ${item.producto}`,
        descripcion: `Solo ${item.stock} unidades disponibles en ${item.bodega}`,
        modulo: 'existencias',
        accion: 'detalle',
        entidad_tipo: 'producto',
        entidad_id: String(item.id_producto),
        ruta: `/app/productos/${item.id_producto}/ver`,
        id_bodega: item.id_bodega,
        id_bodega_relacionada: null,
        fecha_evento: new Date(),
        metadata: {
          producto: {
            id: item.id_producto,
            nombre: item.producto,
          },
          bodega: item.bodega,
          stock: item.stock,
          umbral: UMBRAL_STOCK_BAJO,
        },
      });
    }

    return alerts;
  }

  private buildVencimientoAlerts(existencias: any[]): NotificationSeed[] {
    const hoy = new Date();
    const alerts: NotificationSeed[] = [];

    for (const row of existencias) {
      if (!row.producto?.estado) continue;
      if (!row.fecha_vencimiento) continue;

      const disponible = Math.max(
        this.toNumber(row.cantidad) - this.toNumber(row.cantidad_reservada),
        0,
      );

      if (disponible <= 0) continue;

      const diasParaVencer = this.diffDays(hoy, row.fecha_vencimiento);

      if (diasParaVencer > DIAS_VENCIMIENTO_ALERTA) continue;

      const estaVencido = diasParaVencer < 0;
      const producto = row.producto?.nombre_producto || 'Producto';
      const bodega = row.bodega?.nombre_bodega || 'Bodega';
      const lote = row.lote || 'Sin lote';

      alerts.push({
        hash_unico: `vencimiento:${row.id_existencia}`,
        tipo: 'vencimiento',
        prioridad: estaVencido
          ? 'alta'
          : diasParaVencer <= 7
          ? 'alta'
          : diasParaVencer <= 15
          ? 'media'
          : 'baja',
        titulo: estaVencido
          ? `Producto vencido: ${producto}`
          : `Producto próximo a vencer: ${producto}`,
        descripcion: estaVencido
          ? `Lote ${lote} - ${disponible} unidades - vencido hace ${Math.abs(
              diasParaVencer,
            )} día(s) - ${bodega}`
          : `Lote ${lote} - ${disponible} unidades - vence en ${diasParaVencer} día(s) - ${bodega}`,
        modulo: 'existencias',
        accion: 'detalle',
        entidad_tipo: 'existencia',
        entidad_id: String(row.id_existencia),
        ruta: `/app/productos/${row.id_producto}/ver`,
        id_bodega: row.id_bodega,
        id_bodega_relacionada: null,
        fecha_evento: row.fecha_vencimiento,
        metadata: {
          producto: {
            id: row.id_producto,
            nombre: producto,
          },
          lote: lote,
          bodega: bodega,
          cantidadDisponible: disponible,
          fechaVencimiento: this.toDateOnlyString(row.fecha_vencimiento),
          diasParaVencer,
        },
      });
    }

    return alerts;
  }

  private async resolveBodegaScope(user: AuthUser, requestedBodegaId?: number) {
    const rows = await this.prisma.bodegas_por_usuario.findMany({
      where: {
        id_usuario: user.id_usuario,
        estado: true,
      },
      select: {
        id_bodega: true,
      },
    });

    let ids_bodegas = Array.from(
      new Set(
        rows
          .map((row) => Number(row.id_bodega))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );

    if (ids_bodegas.length === 0 && user.id_bodega_activa) {
      ids_bodegas = [Number(user.id_bodega_activa)];
    }

    if (ids_bodegas.length === 0) {
      throw new ForbiddenException(
        'El usuario no tiene bodegas permitidas para consultar notificaciones',
      );
    }

    if (requestedBodegaId !== undefined && requestedBodegaId > 0) {
      if (!ids_bodegas.includes(requestedBodegaId)) {
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
        ids_bodegas,
      };
    }

    if (
      user.id_bodega_activa &&
      ids_bodegas.includes(Number(user.id_bodega_activa))
    ) {
      return {
        ids_bodegas: [Number(user.id_bodega_activa)],
      };
    }

    return {
      ids_bodegas,
    };
  }

  private buildScopeWhere(idsBodegas: number[]) {
    return {
      OR: [
        {
          id_bodega: {
            in: idsBodegas,
          },
        },
        {
          id_bodega_relacionada: {
            in: idsBodegas,
          },
        },
      ],
    };
  }

  private mapNotification(row: any) {
    return {
      id: String(row.id_notificacion_usuario),
      tipo: row.tipo,
      titulo: row.titulo,
      descripcion: row.descripcion,
      fecha: row.fecha_evento
        ? row.fecha_evento.toISOString()
        : row.fecha_generada.toISOString(),
      prioridad: row.prioridad,
      leida: row.leida,
      datos: this.safeParse(row.metadata),
      action: {
        module: row.modulo,
        entityId: row.entidad_id ?? undefined,
        action: row.accion ?? 'detalle',
        route: row.ruta ?? undefined,
      },
      ruta: row.ruta ?? undefined,
      id_bodega: row.id_bodega ?? null,
      id_bodega_relacionada: row.id_bodega_relacionada ?? null,
    };
  }

  private safeParse(value?: string | null) {
    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private toNumber(value: unknown) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toDateOnlyString(value: Date | string) {
    const date = new Date(value);
    return date.toISOString().slice(0, 10);
  }

  private diffDays(from: Date | string, to: Date | string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const fromOnly = new Date(
      fromDate.getFullYear(),
      fromDate.getMonth(),
      fromDate.getDate(),
    );

    const toOnly = new Date(
      toDate.getFullYear(),
      toDate.getMonth(),
      toDate.getDate(),
    );

    return Math.floor(
      (toOnly.getTime() - fromOnly.getTime()) / (1000 * 60 * 60 * 24),
    );
  }
}