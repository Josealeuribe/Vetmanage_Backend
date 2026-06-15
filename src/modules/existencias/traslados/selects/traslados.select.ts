import { Prisma } from '@prisma/client';

const usuarioGestionSelect = {
  id_usuario: true,
  nombre: true,
  apellido: true,
  email: true,
};

export const trasladoListSelect = Prisma.validator<Prisma.trasladoSelect>()({
  id_traslado: true,
  codigo_traslado: true,
  id_bodega_origen: true,
  id_bodega_destino: true,
  fecha_traslado: true,
  nota: true,
  id_estado_traslado: true,
  id_responsable: true,

  fecha_envio: true,
  id_usuario_envio: true,
  fecha_recepcion: true,
  id_usuario_recibio: true,
  fecha_anulacion: true,
  id_usuario_anulo: true,

  estado_traslado: {
    select: {
      id_estado_traslado: true,
      nombre_estado: true,
    },
  },

  bodega_traslado_id_bodega_origenTobodega: {
    select: {
      id_bodega: true,
      nombre_bodega: true,
    },
  },

  bodega_traslado_id_bodega_destinoTobodega: {
    select: {
      id_bodega: true,
      nombre_bodega: true,
    },
  },

  usuario: {
    select: usuarioGestionSelect,
  },

  usuario_envio: {
    select: usuarioGestionSelect,
  },

  usuario_recibio: {
    select: usuarioGestionSelect,
  },

  usuario_anulo: {
    select: usuarioGestionSelect,
  },
});

export const trasladoDetailSelect = Prisma.validator<Prisma.trasladoSelect>()({
  ...trasladoListSelect,
  detalle_traslado: {
    select: {
      id_detalle: true,
      id_existencia: true,
      cantidad: true,
      precio_compra_unitario: true,

      existencias: {
        select: {
          id_existencia: true,
          id_producto: true,
          id_bodega: true,
          cantidad: true,
          cantidad_reservada: true,
          precio_compra_unitario: true,
          lote: true,
          fecha_vencimiento: true,
          codigo_barras: true,
          nota: true,

          producto: {
            select: {
              id_producto: true,
              nombre_producto: true,
              iva: {
                select: {
                  id_iva: true,
                  porcentaje: true,
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
        },
      },
    },
  },
});