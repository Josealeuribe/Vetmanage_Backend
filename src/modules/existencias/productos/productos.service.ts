import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateProductoDto } from './dto/crear-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { ListProductoQueryDto } from './dto/list-producto.query.dto';
import { productoSelect } from './iva/selects/producto.select';

export type ProductoPayload = Prisma.productoGetPayload<{
  select: typeof productoSelect;
}>;

export type ProductoWithRefs = Prisma.productoGetPayload<{
  include: { categoria_producto: true; iva: true };
}>;

export type ProductosFindAllResponse =
  | ProductoPayload[]
  | {
      page: number;
      limit: number;
      total: number;
      pages: number;
      data: (ProductoPayload | ProductoWithRefs)[];
    };

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCategoriaExists(id_categoria_producto: number) {
    const exists = await this.prisma.categoria_producto.findUnique({
      where: { id_categoria_producto },
      select: { id_categoria_producto: true },
    });

    if (!exists) {
      throw new BadRequestException('id_categoria_producto no existe');
    }
  }

  private async assertIvaExists(id_iva: number) {
    const exists = await this.prisma.iva.findUnique({
      where: { id_iva },
      select: { id_iva: true },
    });

    if (!exists) {
      throw new BadRequestException('id_iva no existe');
    }
  }

  async create(dto: CreateProductoDto): Promise<ProductoPayload> {
    await this.assertCategoriaExists(dto.id_categoria_producto);
    await this.assertIvaExists(dto.id_iva);

    return this.prisma.producto.create({
      data: {
        nombre_producto: dto.nombre_producto.trim(),
        descripcion: dto.descripcion?.trim() || null,
        id_categoria_producto: dto.id_categoria_producto,
        id_iva: dto.id_iva,
        estado: dto.estado ?? true,
      },
      select: productoSelect,
    });
  }

  async findAll(
    query: ListProductoQueryDto = {},
  ): Promise<ProductosFindAllResponse> {
    const where: Prisma.productoWhereInput = {};

    if (query.estado !== undefined) where.estado = query.estado === 'true';
    if (query.id_categoria_producto !== undefined) {
      where.id_categoria_producto = query.id_categoria_producto;
    }
    if (query.id_iva !== undefined) {
      where.id_iva = query.id_iva;
    }

    if (query.q && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { nombre_producto: { contains: q } },
        { descripcion: { contains: q } },
      ];
    }

    const includeRefs = query.includeRefs === 'true';
    const hasPagination = query.page !== undefined || query.limit !== undefined;

    if (!hasPagination) {
      if (includeRefs) {
        return this.prisma.producto.findMany({
          where,
          orderBy: { id_producto: 'desc' },
          include: { categoria_producto: true, iva: true },
        });
      }

      return this.prisma.producto.findMany({
        where,
        orderBy: { id_producto: 'desc' },
        select: productoSelect,
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    if (includeRefs) {
      const [total, data] = await this.prisma.$transaction([
        this.prisma.producto.count({ where }),
        this.prisma.producto.findMany({
          where,
          skip,
          take: limit,
          orderBy: { id_producto: 'desc' },
          include: { categoria_producto: true, iva: true },
        }),
      ]);

      return {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        data,
      };
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.producto.count({ where }),
      this.prisma.producto.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id_producto: 'desc' },
        select: productoSelect,
      }),
    ]);

    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      data,
    };
  }

  async findOne(id: number, includeRefs = true) {
    if (includeRefs) {
      const prod = await this.prisma.producto.findUnique({
        where: { id_producto: id },
        include: { categoria_producto: true, iva: true },
      });

      if (!prod) {
        throw new NotFoundException('Producto no encontrado');
      }

      return prod;
    }

    const prod = await this.prisma.producto.findUnique({
      where: { id_producto: id },
      select: productoSelect,
    });

    if (!prod) {
      throw new NotFoundException('Producto no encontrado');
    }

    return prod;
  }

  async update(id: number, dto: UpdateProductoDto): Promise<ProductoPayload> {
    const exists = await this.prisma.producto.findUnique({
      where: { id_producto: id },
      select: { id_producto: true },
    });

    if (!exists) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (dto.id_categoria_producto !== undefined) {
      await this.assertCategoriaExists(dto.id_categoria_producto);
    }

    if (dto.id_iva !== undefined) {
      await this.assertIvaExists(dto.id_iva);
    }

    return this.prisma.producto.update({
      where: { id_producto: id },
      data: {
        nombre_producto: dto.nombre_producto?.trim() ?? undefined,
        descripcion: dto.descripcion?.trim() ?? undefined,
        id_categoria_producto: dto.id_categoria_producto,
        id_iva: dto.id_iva,
        estado: dto.estado,
      },
      select: productoSelect,
    });
  }

  async disable(id: number): Promise<ProductoPayload> {
    return this.prisma.producto.update({
      where: { id_producto: id },
      data: { estado: false },
      select: productoSelect,
    });
  }

  async enable(id: number): Promise<ProductoPayload> {
    return this.prisma.producto.update({
      where: { id_producto: id },
      data: { estado: true },
      select: productoSelect,
    });
  }
}
