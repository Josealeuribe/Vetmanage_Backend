import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RemisionesVentaService } from './remisiones-venta.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateRemisionVentaDto } from './dto/create-remision-venta.dto';

describe('RemisionesVentaService', () => {
  let service: RemisionesVentaService;

  let tx: any;
  let prismaMock: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn(),

      orden_venta: {
        findUnique: jest.fn(),
      },

      estado_remision_venta: {
        findUnique: jest.fn(),
      },

      usuario: {
        findUnique: jest.fn(),
      },

      existencias: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },

      remision_venta: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },

      detalle_remision_venta: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },

      remision_compra: {
        findFirst: jest.fn(),
      },
    };

    prismaMock = {
      $transaction: jest.fn(async (callback) => callback(tx)),

      bodega: {
        findUnique: jest.fn(),
      },

      estado_remision_venta: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },

      orden_venta: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },

      existencias: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },

      remision_venta: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemisionesVentaService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<RemisionesVentaService>(RemisionesVentaService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debería crear una remisión de venta correctamente y reservar la existencia', async () => {
    const dto: CreateRemisionVentaDto = {
      fecha_creacion: '2026-06-15',
      fecha_vencimiento: '2026-06-30',
      observaciones: 'Remisión de prueba',
      id_orden_venta: 1,
      id_estado_remision_venta: 1,
      id_usuario_creador: 1,
      detalle: [
        {
          id_producto: 10,
          lotes: [
            {
              id_existencia: 100,
              cantidad: 2,
            },
          ],
        },
      ],
    };

    const ordenAprobada = {
      id_orden_venta: 1,
      id_cliente: 5,
      id_bodega: 3,
      estado_orden_venta: {
        nombre_estado: 'Aprobada',
      },
      detalle_orden_venta: [
        {
          id_producto: 10,
          cantidad: 5,
          precio_unitario: 20000,
          producto: {
            iva: {
              porcentaje: 19,
            },
            categoria_producto: {},
          },
        },
      ],
      remision_venta: [],
      cliente: {},
      bodega: {},
    };

    const estadoRemision = {
      id_estado_remision_venta: 1,
      nombre_estado: 'Pendiente',
    };

    const usuario = {
      id_usuario: 1,
    };

    const existencia = {
      id_existencia: 100,
      id_producto: 10,
      id_bodega: 3,
      cantidad: 10,
      cantidad_reservada: 1,
      producto: {
        iva: {
          porcentaje: 19,
        },
      },
      bodega: {},
    };

    const remisionCreada = {
      id_remision_venta: 7,
    };

    const remisionFinal = {
      id_remision_venta: 7,
      codigo_remision_venta: 'RV-0007',
      id_orden_venta: 1,
      id_cliente: 5,
      id_estado_remision_venta: 1,
      id_usuario_creador: 1,
    };

    tx.orden_venta.findUnique.mockResolvedValue(ordenAprobada);
    tx.estado_remision_venta.findUnique.mockResolvedValue(estadoRemision);
    tx.usuario.findUnique.mockResolvedValue(usuario);
    tx.existencias.findUnique.mockResolvedValue(existencia);
    tx.remision_venta.create.mockResolvedValue(remisionCreada);
    tx.detalle_remision_venta.create.mockResolvedValue({});
    tx.$queryRaw.mockResolvedValue([
      {
        id_existencia: 100,
        cantidad: 10,
        cantidad_reservada: 1,
        lote: 'L-001',
      },
    ]);
    tx.existencias.update.mockResolvedValue({});
    tx.remision_venta.update.mockResolvedValue(remisionFinal);

    const result = await service.create(dto);

    expect(result).toEqual(remisionFinal);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.orden_venta.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.estado_remision_venta.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.usuario.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.existencias.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.remision_venta.create).toHaveBeenCalledTimes(1);
    expect(tx.detalle_remision_venta.create).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);

    expect(tx.existencias.update).toHaveBeenCalledWith({
      where: {
        id_existencia: 100,
      },
      data: {
        cantidad_reservada: {
          increment: 2,
        },
      },
    });

    expect(tx.remision_venta.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_remision_venta: 7,
        },
        data: {
          codigo_remision_venta: 'RV-0007',
        },
      }),
    );
  });

  it('debería lanzar NotFoundException si la orden de venta no existe', async () => {
    const dto: CreateRemisionVentaDto = {
      fecha_creacion: '2026-06-15',
      fecha_vencimiento: null,
      observaciones: null,
      id_orden_venta: 999,
      id_estado_remision_venta: 1,
      id_usuario_creador: 1,
      detalle: [
        {
          id_producto: 10,
          lotes: [
            {
              id_existencia: 100,
              cantidad: 2,
            },
          ],
        },
      ],
    };

    tx.orden_venta.findUnique.mockResolvedValue(null);

    const result = service.create(dto);

    await expect(result).rejects.toBeInstanceOf(NotFoundException);
    await expect(result).rejects.toThrow('Orden de venta no existe');
  });

  it('debería lanzar BadRequestException si la orden no está aprobada', async () => {
    const dto: CreateRemisionVentaDto = {
      fecha_creacion: '2026-06-15',
      fecha_vencimiento: null,
      observaciones: null,
      id_orden_venta: 1,
      id_estado_remision_venta: 1,
      id_usuario_creador: 1,
      detalle: [
        {
          id_producto: 10,
          lotes: [
            {
              id_existencia: 100,
              cantidad: 2,
            },
          ],
        },
      ],
    };

    tx.orden_venta.findUnique.mockResolvedValue({
      id_orden_venta: 1,
      id_cliente: 5,
      id_bodega: 3,
      estado_orden_venta: {
        nombre_estado: 'Pendiente',
      },
      detalle_orden_venta: [],
      remision_venta: [],
    });

    const result = service.create(dto);

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow(
      'Solo se pueden crear o editar remisiones desde órdenes aprobadas',
    );
  });

  it('debería lanzar BadRequestException si la existencia no tiene cantidad suficiente disponible', async () => {
    const dto: CreateRemisionVentaDto = {
      fecha_creacion: '2026-06-15',
      fecha_vencimiento: null,
      observaciones: null,
      id_orden_venta: 1,
      id_estado_remision_venta: 1,
      id_usuario_creador: 1,
      detalle: [
        {
          id_producto: 10,
          lotes: [
            {
              id_existencia: 100,
              cantidad: 20,
            },
          ],
        },
      ],
    };

    tx.orden_venta.findUnique.mockResolvedValue({
      id_orden_venta: 1,
      id_cliente: 5,
      id_bodega: 3,
      estado_orden_venta: {
        nombre_estado: 'Aprobada',
      },
      detalle_orden_venta: [
        {
          id_producto: 10,
          cantidad: 30,
          precio_unitario: 20000,
          producto: {
            iva: {
              porcentaje: 19,
            },
            categoria_producto: {},
          },
        },
      ],
      remision_venta: [],
    });

    tx.estado_remision_venta.findUnique.mockResolvedValue({
      id_estado_remision_venta: 1,
      nombre_estado: 'Pendiente',
    });

    tx.usuario.findUnique.mockResolvedValue({
      id_usuario: 1,
    });

    tx.existencias.findUnique.mockResolvedValue({
      id_existencia: 100,
      id_producto: 10,
      id_bodega: 3,
      cantidad: 5,
      cantidad_reservada: 2,
      producto: {
        iva: {
          porcentaje: 19,
        },
      },
      bodega: {},
    });

    const result = service.create(dto);

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow(
      'La existencia 100 no tiene cantidad suficiente. Disponible: 3',
    );
  });

  it('debería cambiar una remisión pendiente a despachada y registrar el usuario de despacho', async () => {
    const idRemision = 7;
    const idUsuarioGestion = 4;

    tx.remision_venta.findUnique.mockResolvedValue({
      id_remision_venta: idRemision,
      id_factura: null,
      cliente: {
        nombre_cliente: 'Cliente prueba',
      },
      estado_remision_venta: {
        nombre_estado: 'Pendiente',
      },
      detalle_remision_venta: [],
    });

    tx.usuario.findUnique.mockResolvedValue({
      id_usuario: idUsuarioGestion,
    });

    tx.estado_remision_venta.findUnique.mockResolvedValue({
      id_estado_remision_venta: 2,
      nombre_estado: 'Despachado',
    });

    tx.remision_venta.update.mockResolvedValue({
      id_remision_venta: idRemision,
      id_estado_remision_venta: 2,
      id_usuario_despacho: idUsuarioGestion,
      firma_digital: null,
    });

    const result = await service.updateEstado(
      idRemision,
      {
        id_estado_remision_venta: 2,
      } as any,
      idUsuarioGestion,
    );

    expect(result).toEqual({
      id_remision_venta: idRemision,
      id_estado_remision_venta: 2,
      id_usuario_despacho: idUsuarioGestion,
      firma_digital: null,
    });

    expect(tx.usuario.findUnique).toHaveBeenCalledWith({
      where: {
        id_usuario: idUsuarioGestion,
      },
      select: {
        id_usuario: true,
      },
    });

    expect(tx.remision_venta.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_remision_venta: idRemision,
        },
        data: expect.objectContaining({
          id_estado_remision_venta: 2,
          id_usuario_despacho: idUsuarioGestion,
          fecha_despacho: expect.any(Date),
        }),
      }),
    );
  });

  it('debería lanzar BadRequestException si se intenta entregar sin nombre del firmante', async () => {
    const idRemision = 7;
    const idUsuarioGestion = 4;

    tx.remision_venta.findUnique.mockResolvedValue({
      id_remision_venta: idRemision,
      id_factura: null,
      cliente: {
        nombre_cliente: 'Cliente prueba',
      },
      estado_remision_venta: {
        nombre_estado: 'Despachado',
      },
      detalle_remision_venta: [],
    });

    tx.usuario.findUnique.mockResolvedValue({
      id_usuario: idUsuarioGestion,
    });

    tx.estado_remision_venta.findUnique.mockResolvedValue({
      id_estado_remision_venta: 3,
      nombre_estado: 'Entregado',
    });

    const result = service.updateEstado(
      idRemision,
      {
        id_estado_remision_venta: 3,
        firma_digital: 'data:image/png;base64,dGVzdA==',
        nombre_firmante: '',
      } as any,
      idUsuarioGestion,
    );

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow(
      'Debes ingresar el nombre de la persona que recibe la remisión',
    );

    expect(tx.remision_venta.update).not.toHaveBeenCalled();
  });

  it('debería entregar una remisión despachada, guardar firma y descontar reserva/inventario', async () => {
    const idRemision = 7;
    const idUsuarioGestion = 4;

    tx.remision_venta.findUnique.mockResolvedValue({
      id_remision_venta: idRemision,
      id_factura: null,
      cliente: {
        nombre_cliente: 'Cliente prueba',
      },
      estado_remision_venta: {
        nombre_estado: 'Despachado',
      },
      detalle_remision_venta: [
        {
          id_existencia: 100,
          cantidad: 2,
          existencias: {
            cantidad: 10,
            cantidad_reservada: 2,
          },
        },
      ],
    });

    tx.usuario.findUnique.mockResolvedValue({
      id_usuario: idUsuarioGestion,
    });

    tx.estado_remision_venta.findUnique.mockResolvedValue({
      id_estado_remision_venta: 3,
      nombre_estado: 'Entregado',
    });

    tx.detalle_remision_venta.findMany.mockResolvedValue([
      {
        id_existencia: 100,
        cantidad: 2,
      },
    ]);

    tx.$queryRaw.mockResolvedValue([
      {
        id_existencia: 100,
        cantidad: 10,
        cantidad_reservada: 2,
      },
    ]);

    tx.existencias.update.mockResolvedValue({});

    tx.remision_venta.update.mockResolvedValue({
      id_remision_venta: idRemision,
      id_estado_remision_venta: 3,
      firma_digital: Buffer.from('test'),
      nombre_firmante: 'Juan Pérez',
    });

    const result = await service.updateEstado(
      idRemision,
      {
        id_estado_remision_venta: 3,
        firma_digital: 'data:image/png;base64,dGVzdA==',
        nombre_firmante: 'Juan Pérez',
      } as any,
      idUsuarioGestion,
    );

    expect(result.firma_digital).toBe('data:image/png;base64,dGVzdA==');

    expect(tx.existencias.update).toHaveBeenCalledWith({
      where: {
        id_existencia: 100,
      },
      data: {
        cantidad: {
          decrement: 2,
        },
        cantidad_reservada: {
          decrement: 2,
        },
      },
    });

    expect(tx.remision_venta.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id_estado_remision_venta: 3,
          firma_digital: expect.any(Buffer),
          nombre_firmante: 'Juan Pérez',
          fecha_firma: expect.any(Date),
        }),
      }),
    );
  });
});
