import { Prisma } from '@prisma/client';

export const existenciaListSelect =
  Prisma.validator<Prisma.existenciasSelect>()({
    id_existencia: true,
    id_producto: true,
    id_bodega: true,
    nota: true,
    cantidad: true,
    cantidad_reservada: true,
    fecha_vencimiento: true,
    precio_compra_unitario: true,
    lote: true,
    producto: {
      select: {
        id_producto: true,
        nombre_producto: true,
        descripcion: true,
        estado: true,
        iva: {
          select: {
            id_iva: true,
            porcentaje: true,
          },
        },
        categoria_producto: {
          select: {
            id_categoria_producto: true,
            nombre_categoria: true,
          },
        },
      },
    },
    bodega: {
      select: {
        id_bodega: true,
        nombre_bodega: true,
      },
    },
  });

export const existenciaDetailSelect =
  Prisma.validator<Prisma.existenciasSelect>()({
    ...existenciaListSelect,
  });
