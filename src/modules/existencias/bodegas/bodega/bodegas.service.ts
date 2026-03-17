import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateBodegaDto } from './dto/create-bodega.dto';
import { UpdateBodegaDto } from './dto/update-bodega.dto';
import { ListBodegaQueryDto } from './dto/list-bodega.query.dto';
import { bodegaSelect } from './selects/bodega.select';
import { PrismaService } from 'src/prisma/prisma.service';

export type BodegaPayload = Prisma.bodegaGetPayload<{
  select: typeof bodegaSelect;
}>;

export type BodegaWithMunicipio = Prisma.bodegaGetPayload<{
  include: {
    municipios: {
      include: {
        departamentos: true;
      };
    };
    _count: {
      select: {
        bodegas_por_usuario: true;
      };
    };
  };
}>;

export type BodegasFindAllResponse =
  | BodegaPayload[]
  | {
      page: number;
      limit: number;
      total: number;
      pages: number;
      data: (BodegaPayload | BodegaWithMunicipio)[];
    };

@Injectable()
export class BodegaService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertMunicipioExists(id_municipio: number) {
    const exists = await this.prisma.municipios.findUnique({
      where: { id_municipio },
      select: { id_municipio: true },
    });

    if (!exists) {
      throw new BadRequestException('id_municipio no existe');
    }
  }

  private async assertBodegaExists(id: number) {
    const exists = await this.prisma.bodega.findUnique({
      where: { id_bodega: id },
      select: { id_bodega: true },
    });

    if (!exists) {
      throw new NotFoundException('Bodega no encontrada');
    }
  }

  private async assertCanDisable(id: number) {
    const usuariosAsignados = await this.prisma.bodegas_por_usuario.count({
      where: { id_bodega: id },
    });

    if (usuariosAsignados > 0) {
      throw new BadRequestException(
        'No se puede inactivar la bodega porque está asignada a uno o más usuarios.',
      );
    }
  }

  private async assertCanDelete(id: number) {
    const [
      usuarios,
      compras,
      cotizaciones,
      existencias,
      ordenesVenta,
      remisionesCompra,
      trasladosOrigen,
      trasladosDestino,
    ] = await this.prisma.$transaction([
      this.prisma.bodegas_por_usuario.count({
        where: { id_bodega: id },
      }),
      this.prisma.compras.count({
        where: { id_bodega: id },
      }),
      this.prisma.cotizacion.count({
        where: { id_bodega: id },
      }),
      this.prisma.existencias.count({
        where: { id_bodega: id },
      }),
      this.prisma.orden_venta.count({
        where: { id_bodega: id },
      }),
      this.prisma.remision_compra.count({
        where: { id_bodega: id },
      }),
      this.prisma.traslado.count({
        where: { id_bodega_origen: id },
      }),
      this.prisma.traslado.count({
        where: { id_bodega_destino: id },
      }),
    ]);

    const totalRelaciones =
      usuarios +
      compras +
      cotizaciones +
      existencias +
      ordenesVenta +
      remisionesCompra +
      trasladosOrigen +
      trasladosDestino;

    if (totalRelaciones > 0) {
      throw new BadRequestException(
        'No se puede eliminar la bodega porque tiene registros relacionados. Inactívala en su lugar.',
      );
    }
  }

  async create(dto: CreateBodegaDto): Promise<BodegaPayload> {
    await this.assertMunicipioExists(dto.id_municipio);

    return this.prisma.bodega.create({
      data: {
        nombre_bodega: dto.nombre_bodega.trim(),
        direccion: dto.direccion.trim(),
        id_municipio: dto.id_municipio,
        estado: dto.estado ?? true,
      },
      select: bodegaSelect,
    });
  }

  async findAll(
    query: ListBodegaQueryDto = {},
  ): Promise<BodegasFindAllResponse> {
    const where: Prisma.bodegaWhereInput = {};

    if (query.estado !== undefined) {
      where.estado = query.estado === 'true';
    }

    if (query.id_municipio !== undefined) {
      where.id_municipio = query.id_municipio;
    }

    if (query.q && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { nombre_bodega: { contains: q } },
        { direccion: { contains: q } },
      ];
    }

    const includeMunicipio = query.includeMunicipio === 'true';
    const hasPagination = query.page !== undefined || query.limit !== undefined;

    if (!hasPagination) {
      if (includeMunicipio) {
        return this.prisma.bodega.findMany({
          where,
          orderBy: { id_bodega: 'desc' },
          include: {
            municipios: {
              include: {
                departamentos: true,
              },
            },
            _count: {
              select: {
                bodegas_por_usuario: true,
              },
            },
          },
        });
      }

      return this.prisma.bodega.findMany({
        where,
        orderBy: { id_bodega: 'desc' },
        select: bodegaSelect,
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    if (includeMunicipio) {
      const [total, data] = await this.prisma.$transaction([
        this.prisma.bodega.count({ where }),
        this.prisma.bodega.findMany({
          where,
          skip,
          take: limit,
          orderBy: { id_bodega: 'desc' },
          include: {
            municipios: {
              include: {
                departamentos: true,
              },
            },
            _count: {
              select: {
                bodegas_por_usuario: true,
              },
            },
          },
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
      this.prisma.bodega.count({ where }),
      this.prisma.bodega.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id_bodega: 'desc' },
        select: bodegaSelect,
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

  async findOne(id: number, includeMunicipio = true) {
    if (includeMunicipio) {
      const bodega = await this.prisma.bodega.findUnique({
        where: { id_bodega: id },
        include: {
          municipios: {
            include: {
              departamentos: true,
            },
          },
          _count: {
            select: {
              bodegas_por_usuario: true,
            },
          },
        },
      });

      if (!bodega) {
        throw new NotFoundException('Bodega no encontrada');
      }

      return bodega;
    }

    const bodega = await this.prisma.bodega.findUnique({
      where: { id_bodega: id },
      select: bodegaSelect,
    });

    if (!bodega) {
      throw new NotFoundException('Bodega no encontrada');
    }

    return bodega;
  }

  async update(id: number, dto: UpdateBodegaDto): Promise<BodegaPayload> {
    await this.assertBodegaExists(id);

    if (dto.id_municipio !== undefined) {
      await this.assertMunicipioExists(dto.id_municipio);
    }

    return this.prisma.bodega.update({
      where: { id_bodega: id },
      data: {
        nombre_bodega: dto.nombre_bodega?.trim(),
        direccion: dto.direccion?.trim(),
        id_municipio: dto.id_municipio,
        estado: dto.estado,
      },
      select: bodegaSelect,
    });
  }

  async disable(id: number): Promise<BodegaPayload> {
    await this.assertBodegaExists(id);
    await this.assertCanDisable(id);

    return this.prisma.bodega.update({
      where: { id_bodega: id },
      data: { estado: false },
      select: bodegaSelect,
    });
  }

  async enable(id: number): Promise<BodegaPayload> {
    await this.assertBodegaExists(id);

    return this.prisma.bodega.update({
      where: { id_bodega: id },
      data: { estado: true },
      select: bodegaSelect,
    });
  }

  async remove(id: number): Promise<BodegaPayload> {
    await this.assertBodegaExists(id);
    await this.assertCanDelete(id);

    return this.prisma.bodega.delete({
      where: { id_bodega: id },
      select: bodegaSelect,
    });
  }
}
