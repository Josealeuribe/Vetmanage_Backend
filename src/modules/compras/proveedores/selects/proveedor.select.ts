import { Prisma } from '@prisma/client';

export const proveedorSelect = {
  id_proveedor: true,
  codigo_proveedor: true,
  num_documento: true,
  nombre_empresa: true,
  email: true,
  telefono: true,
  direccion: true,
  nombre_contacto: true,
  id_tipo_proveedor: true,
  id_tipo_doc: true,
  id_municipio: true,
  estado: true,

  tipo_documento: {
    select: {
      id_tipo_doc: true,
      nombre_doc: true,
    },
  },
} satisfies Prisma.proveedorSelect;
