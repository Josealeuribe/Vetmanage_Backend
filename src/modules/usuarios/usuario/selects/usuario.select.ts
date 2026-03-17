import { Prisma } from '@prisma/client';

export const usuarioSelect = {
  id_usuario: true,
  nombre: true,
  apellido: true,
  id_tipo_doc: true,
  num_documento: true,
  email: true,
  id_rol: true,
  estado: true,
  telefono: true,
  fecha_nacimiento: true,
  img_url: true,
  id_genero: true,

  tipo_documento: {
    select: {
      id_tipo_doc: true,
      nombre_doc: true,
    },
  },

  roles: {
    select: {
      id_rol: true,
      nombre_rol: true,
    },
  },

  genero: {
    select: {
      id_genero: true,
      nombre_genero: true,
    },
  },

  bodegas_por_usuario: {
    where: {
      estado: true,
    },
    select: {
      id_bodega: true,
      estado: true,
      bodega: {
        select: {
          id_bodega: true,
          nombre_bodega: true,
          direccion: true,
          id_municipio: true,
          estado: true,
        },
      },
    },
  },
} satisfies Prisma.usuarioSelect;
