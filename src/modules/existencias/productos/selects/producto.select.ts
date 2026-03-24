import { Prisma } from '@prisma/client';

export const productoSelect = Prisma.validator<Prisma.productoSelect>()({
  id_producto: true,
  nombre_producto: true,
  descripcion: true,
  id_categoria_producto: true,
  id_iva: true,
  estado: true,
});
