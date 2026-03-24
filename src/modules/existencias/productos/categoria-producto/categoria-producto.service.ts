import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CategoriaProductoService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.categoria_producto.findMany({
      orderBy: { nombre_categoria: 'asc' },
      select: {
        id_categoria_producto: true,
        nombre_categoria: true,
      },
    });
  }

  async findOne(id: number) {
    const categoria = await this.prisma.categoria_producto.findUnique({
      where: { id_categoria_producto: id },
      select: {
        id_categoria_producto: true,
        nombre_categoria: true,
      },
    });

    if (!categoria) {
      throw new NotFoundException('Categoría de producto no encontrada');
    }

    return categoria;
  }
}
