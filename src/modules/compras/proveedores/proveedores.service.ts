import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { ListProveedorQueryDto } from './dto/list-proveedor.query.dto';
import { proveedorSelect } from './selects/proveedor.select';

export type ProveedorPayload = Prisma.proveedorGetPayload<{
  select: typeof proveedorSelect;
}>;

export type ProveedorWithRefs = Prisma.proveedorGetPayload<{
  include: { municipios: true; tipo_documento: true; tipo_proveedor: true };
}>;

export type ProveedoresFindAllResponse =
  | ProveedorPayload[]
  | {
      page: number;
      limit: number;
      total: number;
      pages: number;
      data: (ProveedorPayload | ProveedorWithRefs)[];
    };

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeStr(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  }

  private nextCodigoFrom(
    prev: string | null,
    prefix = 'PV-',
    width = 4,
  ): string {
    if (!prev || !prev.startsWith(prefix)) {
      return `${prefix}${String(1).padStart(width, '0')}`;
    }

    const part = prev.slice(prefix.length);
    const n = Number.parseInt(part, 10);
    const next = Number.isFinite(n) ? n + 1 : 1;

    return `${prefix}${String(next).padStart(width, '0')}`;
  }

  private async generarCodigoProveedor(): Promise<string> {
    const ultimo = await this.prisma.proveedor.findFirst({
      where: {
        codigo_proveedor: {
          startsWith: 'PV-',
        },
      },
      orderBy: { id_proveedor: 'desc' },
      select: { codigo_proveedor: true },
    });

    return this.nextCodigoFrom(ultimo?.codigo_proveedor ?? null, 'PV-', 4);
  }

  private async assertMunicipioExists(id_municipio: number) {
    const exists = await this.prisma.municipios.findUnique({
      where: { id_municipio },
      select: { id_municipio: true },
    });
    if (!exists) throw new BadRequestException('id_municipio no existe');
  }

  private async assertTipoDocExists(id_tipo_doc: number) {
    const exists = await this.prisma.tipo_documento.findUnique({
      where: { id_tipo_doc },
      select: { id_tipo_doc: true },
    });
    if (!exists) throw new BadRequestException('id_tipo_doc no existe');
  }

  private async assertTipoProveedorExists(id_tipo_proveedor: number) {
    const exists = await this.prisma.tipo_proveedor.findUnique({
      where: { id_tipo_proveedor },
      select: { id_tipo_proveedor: true },
    });
    if (!exists) throw new BadRequestException('id_tipo_proveedor no existe');
  }

  async create(dto: CreateProveedorDto): Promise<ProveedorPayload> {
    await this.assertMunicipioExists(dto.id_municipio);
    await this.assertTipoDocExists(dto.id_tipo_doc);
    await this.assertTipoProveedorExists(dto.id_tipo_proveedor);

    const codigo_proveedor =
      this.normalizeStr(dto.codigo_proveedor) ??
      (await this.generarCodigoProveedor());

    return this.prisma.proveedor.create({
      data: {
        codigo_proveedor,
        num_documento: dto.num_documento.trim(),
        nombre_empresa: dto.nombre_empresa.trim(),
        email: this.normalizeStr(dto.email),
        telefono: this.normalizeStr(dto.telefono),
        direccion: this.normalizeStr(dto.direccion),
        nombre_contacto: this.normalizeStr(dto.nombre_contacto),
        id_tipo_proveedor: dto.id_tipo_proveedor,
        id_tipo_doc: dto.id_tipo_doc,
        id_municipio: dto.id_municipio,
        estado: dto.estado ?? true,
      },
      select: proveedorSelect,
    });
  }

  async findAll(
    query: ListProveedorQueryDto = {},
  ): Promise<ProveedoresFindAllResponse> {
    const where: Prisma.proveedorWhereInput = {};

    if (query.estado !== undefined) where.estado = query.estado === 'true';
    if (query.id_tipo_proveedor !== undefined)
      where.id_tipo_proveedor = query.id_tipo_proveedor;
    if (query.id_tipo_doc !== undefined) where.id_tipo_doc = query.id_tipo_doc;
    if (query.id_municipio !== undefined)
      where.id_municipio = query.id_municipio;

    if (query.q && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { nombre_empresa: { contains: q } },
        { num_documento: { contains: q } },
        { email: { contains: q } },
        { telefono: { contains: q } },
        { nombre_contacto: { contains: q } },
        { codigo_proveedor: { contains: q } },
      ];
    }

    const includeRefs = query.includeRefs === 'true';
    const hasPagination = query.page !== undefined || query.limit !== undefined;

    if (!hasPagination) {
      if (includeRefs) {
        return this.prisma.proveedor.findMany({
          where,
          orderBy: { id_proveedor: 'desc' },
          include: {
            municipios: true,
            tipo_documento: true,
            tipo_proveedor: true,
          },
        });
      }

      return this.prisma.proveedor.findMany({
        where,
        orderBy: { id_proveedor: 'desc' },
        select: proveedorSelect,
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    if (includeRefs) {
      const [total, data] = await this.prisma.$transaction([
        this.prisma.proveedor.count({ where }),
        this.prisma.proveedor.findMany({
          where,
          skip,
          take: limit,
          orderBy: { id_proveedor: 'desc' },
          include: {
            municipios: true,
            tipo_documento: true,
            tipo_proveedor: true,
          },
        }),
      ]);

      return { page, limit, total, pages: Math.ceil(total / limit), data };
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.proveedor.count({ where }),
      this.prisma.proveedor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id_proveedor: 'desc' },
        select: proveedorSelect,
      }),
    ]);

    return { page, limit, total, pages: Math.ceil(total / limit), data };
  }

  async findOne(id: number, includeRefs = true) {
    if (includeRefs) {
      const proveedor = await this.prisma.proveedor.findUnique({
        where: { id_proveedor: id },
        include: {
          municipios: true,
          tipo_documento: true,
          tipo_proveedor: true,
        },
      });
      if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
      return proveedor;
    }

    const proveedor = await this.prisma.proveedor.findUnique({
      where: { id_proveedor: id },
      select: proveedorSelect,
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
    return proveedor;
  }

  async update(id: number, dto: UpdateProveedorDto): Promise<ProveedorPayload> {
    const exists = await this.prisma.proveedor.findUnique({
      where: { id_proveedor: id },
      select: { id_proveedor: true },
    });
    if (!exists) throw new NotFoundException('Proveedor no encontrado');

    if (dto.id_municipio !== undefined)
      await this.assertMunicipioExists(dto.id_municipio);
    if (dto.id_tipo_doc !== undefined)
      await this.assertTipoDocExists(dto.id_tipo_doc);
    if (dto.id_tipo_proveedor !== undefined)
      await this.assertTipoProveedorExists(dto.id_tipo_proveedor);

    return this.prisma.proveedor.update({
      where: { id_proveedor: id },
      data: {
        codigo_proveedor: dto.codigo_proveedor?.trim() ?? undefined,
        num_documento: dto.num_documento?.trim() ?? undefined,
        nombre_empresa: dto.nombre_empresa?.trim() ?? undefined,
        email: dto.email?.trim() ?? undefined,
        telefono: dto.telefono?.trim() ?? undefined,
        direccion: dto.direccion?.trim() ?? undefined,
        nombre_contacto: dto.nombre_contacto?.trim() ?? undefined,
        id_tipo_proveedor: dto.id_tipo_proveedor,
        id_tipo_doc: dto.id_tipo_doc,
        id_municipio: dto.id_municipio,
        estado: dto.estado,
      },
      select: proveedorSelect,
    });
  }

  async disable(id: number): Promise<ProveedorPayload> {
    return this.prisma.proveedor.update({
      where: { id_proveedor: id },
      data: { estado: false },
      select: proveedorSelect,
    });
  }

  async enable(id: number): Promise<ProveedorPayload> {
    return this.prisma.proveedor.update({
      where: { id_proveedor: id },
      data: { estado: true },
      select: proveedorSelect,
    });
  }
}