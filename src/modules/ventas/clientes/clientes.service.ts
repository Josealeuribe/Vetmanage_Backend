
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

const clienteIncludeRefs = Prisma.validator<Prisma.clienteInclude>()({
  tipo_documento: true,
  tipo_cliente: true,
  bodega: {
    select: {
      id_bodega: true,
      nombre_bodega: true,
    },
  },
  municipios: {
    select: {
      id_municipio: true,
      nombre_municipio: true,
      id_departamento: true,
      departamentos: {
        select: {
          id_departamento: true,
          nombre_departamento: true,
        },
      },
    },
  },
});

// --------- Prisma error helpers (compatibles con cualquier versión) ----------
type PrismaErrorLike = { code?: unknown; meta?: unknown };

function isPrismaErrorLike(e: unknown): e is PrismaErrorLike {
  return typeof e === 'object' && e !== null && 'code' in e;
}

function isP2002(e: unknown): boolean {
  return isPrismaErrorLike(e) && e.code === 'P2002';
}
// ---------------------------------------------------------------------------

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) { }

  // ---------- helpers ----------
  private normalizeStr(v?: string): string | null {
    const s = v?.trim();
    return s && s.length > 0 ? s : null;
  }

  private nextCodigoFrom(
    prev: string | null,
    prefix = 'CL-',
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

  private async generarCodigoCliente(): Promise<string> {
    const ultimo = await this.prisma.cliente.findFirst({
      orderBy: { id_cliente: 'desc' },
      select: { codigo_cliente: true },
    });

    return this.nextCodigoFrom(ultimo?.codigo_cliente ?? null, 'CL-', 4);
  }

  private async assertFks(params: {
    id_tipo_cliente?: number;
    id_municipio?: number;
    id_tipo_doc?: number;
    id_bodega?: number;
  }) {
    const { id_tipo_cliente, id_municipio, id_tipo_doc, id_bodega } = params;

    const [tc, mun, td, bod] = await Promise.all([
      id_tipo_cliente
        ? this.prisma.tipo_cliente.findUnique({ where: { id_tipo_cliente } })
        : Promise.resolve(null),

      id_municipio
        ? this.prisma.municipios.findUnique({ where: { id_municipio } })
        : Promise.resolve(null),

      id_tipo_doc
        ? this.prisma.tipo_documento.findUnique({ where: { id_tipo_doc } })
        : Promise.resolve(null),

      id_bodega
        ? this.prisma.bodega.findFirst({
          where: {
            id_bodega,
            estado: true,
          },
        })
        : Promise.resolve(null),
    ]);

    if (
      (id_tipo_cliente && !tc) ||
      (id_municipio && !mun) ||
      (id_tipo_doc && !td) ||
      (id_bodega && !bod)
    ) {
      throw new BadRequestException(
        'tipo_cliente, municipio, tipo_documento o bodega inválida',
      );
    }
  }
  // ----------------------------

  // ✅ CREATE
  async create(dto: CreateClienteDto) {
    await this.assertFks({
      id_tipo_cliente: dto.id_tipo_cliente,
      id_municipio: dto.id_municipio,
      id_tipo_doc: dto.id_tipo_doc,
      id_bodega: dto.id_bodega,
    });

    const maxRetries = 5;
    let codigo = this.normalizeStr(dto.codigo_cliente);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (!codigo) codigo = await this.generarCodigoCliente();

      try {
        return await this.prisma.cliente.create({
          data: {
            codigo_cliente: codigo,
            nombre_cliente: dto.nombre_cliente.trim(),
            email: this.normalizeStr(dto.email),
            telefono: this.normalizeStr(dto.telefono),
            direccion: this.normalizeStr(dto.direccion),
            num_documento: dto.num_documento.trim(),
            id_tipo_cliente: dto.id_tipo_cliente,
            id_municipio: dto.id_municipio,
            id_tipo_doc: dto.id_tipo_doc,
            id_bodega: dto.id_bodega,
            estado: dto.estado ?? true,
          },
          include: clienteIncludeRefs,
        });
      } catch (e: unknown) {
        if (isP2002(e)) {
          // Puede ser choque por codigo/email/num_documento.
          // Si fue por codigo generado en concurrencia, reintenta con otro.
          if (!dto.codigo_cliente && attempt < maxRetries) {
            codigo = null; // fuerza regeneración
            continue;
          }
          throw new BadRequestException(
            'Ya existe un cliente con ese código, email o número de documento',
          );
        }
        throw e;
      }
    }
  }

  // ✅ LIST
  async findAll(params?: {
    incluirInactivos?: boolean;
    q?: string;
    id_bodega?: number;
  }) {
    const incluirInactivos = params?.incluirInactivos ?? false;
    const q = params?.q?.trim();
    const id_bodega = params?.id_bodega;

    const where: Prisma.clienteWhereInput = {
      ...(incluirInactivos ? {} : { estado: true }),

      ...(id_bodega && id_bodega > 0 ? { id_bodega } : {}),

      ...(q
        ? {
          OR: [
            { nombre_cliente: { contains: q } },
            { num_documento: { contains: q } },
            { codigo_cliente: { contains: q } },
            { email: { contains: q } },
          ],
        }
        : {}),
    };

    return this.prisma.cliente.findMany({
      where,
      orderBy: { id_cliente: 'desc' },
      include: clienteIncludeRefs,
    });
  }

  // ✅ GET ONE
  async findOne(id_cliente: number) {
    const c = await this.prisma.cliente.findUnique({
      where: { id_cliente },
      include: clienteIncludeRefs,
    });

    if (!c) throw new NotFoundException('Cliente no encontrado');
    return c;
  }

  // ✅ UPDATE
  async update(id_cliente: number, dto: UpdateClienteDto) {
    await this.findOne(id_cliente);

    // valida FK solo si vienen en el update
    await this.assertFks({
      id_tipo_cliente: dto.id_tipo_cliente,
      id_municipio: dto.id_municipio,
      id_tipo_doc: dto.id_tipo_doc,
      id_bodega: dto.id_bodega,
    });

    const data: Prisma.clienteUpdateInput = {
      ...(dto.codigo_cliente !== undefined
        ? { codigo_cliente: this.normalizeStr(dto.codigo_cliente) }
        : {}),
      ...(dto.nombre_cliente !== undefined
        ? { nombre_cliente: dto.nombre_cliente.trim() }
        : {}),
      ...(dto.email !== undefined
        ? { email: this.normalizeStr(dto.email) }
        : {}),
      ...(dto.telefono !== undefined
        ? { telefono: this.normalizeStr(dto.telefono) }
        : {}),
      ...(dto.direccion !== undefined
        ? { direccion: this.normalizeStr(dto.direccion) }
        : {}),
      ...(dto.num_documento !== undefined
        ? { num_documento: dto.num_documento.trim() }
        : {}),
      ...(dto.id_tipo_cliente !== undefined
        ? { id_tipo_cliente: dto.id_tipo_cliente }
        : {}),
      ...(dto.id_municipio !== undefined
        ? { id_municipio: dto.id_municipio }
        : {}),
      ...(dto.id_tipo_doc !== undefined
        ? { id_tipo_doc: dto.id_tipo_doc }
        : {}),
      ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
      ...(dto.id_bodega !== undefined
        ? { id_bodega: dto.id_bodega }
        : {}),
    };

    try {
      return await this.prisma.cliente.update({
        where: { id_cliente },
        data,
        include: clienteIncludeRefs,
      });
    } catch (e: unknown) {
      if (isP2002(e)) {
        throw new BadRequestException(
          'Ya existe un cliente con ese código, email o número de documento',
        );
      }
      throw e;
    }
  }

  async getMeta() {
    const [tiposDocumento, tiposCliente, municipios, bodegas] = await Promise.all([
      this.prisma.tipo_documento.findMany({
        orderBy: { id_tipo_doc: 'asc' },
      }),

      this.prisma.tipo_cliente.findMany({
        orderBy: { id_tipo_cliente: 'asc' },
      }),

      this.prisma.municipios.findMany({
        include: {
          departamentos: true,
        },
        orderBy: { id_municipio: 'asc' },
      }),

      this.prisma.bodega.findMany({
        where: {
          estado: true,
        },
        orderBy: {
          nombre_bodega: 'asc',
        },
      }),
    ]);

    return {
      tiposDocumento,
      tiposCliente,
      municipios,
      bodegas,
    };
  }

  // ✅ SOFT DELETE
  async remove(id_cliente: number) {
    await this.findOne(id_cliente);
    return this.prisma.cliente.update({
      where: { id_cliente },
      data: { estado: false },
    });
  }
}
