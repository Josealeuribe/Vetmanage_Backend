import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, roles } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';

type PrismaKnownError = { code: string; meta?: unknown };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPrismaKnownError(e: unknown): e is PrismaKnownError {
  return isObject(e) && typeof e['code'] === 'string';
}

function getMetaTarget(meta: unknown): string[] | string | undefined {
  if (!isObject(meta)) return undefined;
  const target = meta['target'];
  if (typeof target === 'string') return target;
  if (Array.isArray(target) && target.every((x) => typeof x === 'string')) {
    return target;
  }
  return undefined;
}

function isUniqueConstraintError(e: unknown, field?: string): boolean {
  if (!isPrismaKnownError(e)) return false;
  if (e.code !== 'P2002') return false;

  if (!field) return true;

  const target = getMetaTarget(e.meta);
  if (!target) return true;

  return Array.isArray(target)
    ? target.includes(field)
    : target.includes(field);
}

const rolSelect = {
  id_rol: true,
  nombre_rol: true,
  descripcion: true,
  estado: true,
  _count: {
    select: {
      usuario: true,
    },
  },
  roles_permisos: {
    select: {
      permisos: {
        select: {
          id_permiso: true,
          nombre_permiso: true,
        },
      },
    },
  },
} satisfies Prisma.rolesSelect;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) { }

  private esRolAdministrador(rol: {
    id_rol: number;
    nombre_rol: string;
  }): boolean {
    return (
      rol.id_rol === 1 ||
      rol.nombre_rol.trim().toLowerCase() === 'administrador'
    );
  }

  private validarRolProtegido(rol: {
    id_rol: number;
    nombre_rol: string;
  }) {
    if (this.esRolAdministrador(rol)) {
      throw new BadRequestException(
        'El rol Administrador es un rol protegido del sistema y no se puede modificar',
      );
    }
  }

  private async validarPermisos(idsPermisos: number[]) {
    if (!idsPermisos?.length) return;

    const idsUnicos = [...new Set(idsPermisos)];
    const permisos = await this.prisma.permisos.findMany({
      where: { id_permiso: { in: idsUnicos } },
      select: { id_permiso: true },
    });

    const encontrados = new Set(permisos.map((p) => p.id_permiso));
    const faltantes = idsUnicos.filter((id) => !encontrados.has(id));

    if (faltantes.length) {
      throw new BadRequestException(
        `Permiso(s) inválido(s): ${faltantes.join(', ')}`,
      );
    }
  }

  async create(dto: CreateRolDto) {
    const idsPermisos = dto.ids_permisos ? [...new Set(dto.ids_permisos)] : [];

    await this.validarPermisos(idsPermisos);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const rol = await tx.roles.create({
          data: {
            nombre_rol: dto.nombre_rol.trim(),
            descripcion: dto.descripcion.trim(),
            estado: dto.estado ?? true,
            ...(idsPermisos.length
              ? {
                roles_permisos: {
                  create: idsPermisos.map((id_permiso) => ({
                    id_permiso,
                  })),
                },
              }
              : {}),
          },
          select: rolSelect,
        });

        return rol;
      });
    } catch (e: unknown) {
      if (isUniqueConstraintError(e, 'nombre_rol')) {
        throw new BadRequestException('Ya existe un rol con ese nombre');
      }
      throw e;
    }
  }

  async findAll(params?: { incluirInactivos?: boolean }) {
    const incluirInactivos = params?.incluirInactivos ?? false;

    return this.prisma.roles.findMany({
      where: incluirInactivos ? {} : { estado: true },
      orderBy: { id_rol: 'asc' },
      select: rolSelect,
    });
  }

  async findOne(id_rol: number) {
    const rol = await this.prisma.roles.findUnique({
      where: { id_rol },
      select: rolSelect,
    });

    if (!rol) {
      throw new NotFoundException('Rol no encontrado');
    }

    return rol;
  }

  async asignarPermisos(id_rol: number, idsPermisos: number[]) {
    const rol = await this.findOne(id_rol);
    this.validarRolProtegido(rol);

    const idsUnicos = [...new Set(idsPermisos)];
    await this.validarPermisos(idsUnicos);

    return this.prisma.$transaction(async (tx) => {
      await tx.roles_permisos.deleteMany({
        where: { id_rol },
      });

      if (idsUnicos.length) {
        await tx.roles_permisos.createMany({
          data: idsUnicos.map((id_permiso) => ({
            id_rol,
            id_permiso,
          })),
          skipDuplicates: true,
        });
      }

      return tx.roles.findUnique({
        where: { id_rol },
        select: rolSelect,
      });
    });
  }

  async update(id_rol: number, dto: UpdateRolDto) {
    const rol = await this.findOne(id_rol);
    this.validarRolProtegido(rol);

    const idsPermisos =
      dto.ids_permisos !== undefined
        ? [...new Set(dto.ids_permisos)]
        : undefined;

    if (idsPermisos !== undefined) {
      await this.validarPermisos(idsPermisos);
    }

    if (dto.estado === false) {
      const totalUsuarios = await this.prisma.usuario.count({
        where: { id_rol },
      });

      if (totalUsuarios > 0) {
        throw new BadRequestException(
          'No se puede desactivar el rol porque tiene usuarios asignados',
        );
      }
    }

    const data: Prisma.rolesUpdateInput = {};

    if (dto.nombre_rol !== undefined) {
      data.nombre_rol = dto.nombre_rol.trim();
    }

    if (dto.descripcion !== undefined) {
      data.descripcion = dto.descripcion.trim();
    }

    if (dto.estado !== undefined) {
      data.estado = dto.estado;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.roles.update({
          where: { id_rol },
          data,
        });

        if (idsPermisos !== undefined) {
          await tx.roles_permisos.deleteMany({
            where: { id_rol },
          });

          if (idsPermisos.length > 0) {
            await tx.roles_permisos.createMany({
              data: idsPermisos.map((id_permiso) => ({
                id_rol,
                id_permiso,
              })),
              skipDuplicates: true,
            });
          }
        }

        return tx.roles.findUnique({
          where: { id_rol },
          select: rolSelect,
        });
      });
    } catch (e: unknown) {
      if (isUniqueConstraintError(e, 'nombre_rol')) {
        throw new BadRequestException('Ya existe un rol con ese nombre');
      }

      throw e;
    }
  }

  async remove(id_rol: number): Promise<roles> {
    const rol = await this.findOne(id_rol);
    this.validarRolProtegido(rol);

    const totalUsuarios = await this.prisma.usuario.count({
      where: { id_rol },
    });

    if (totalUsuarios > 0) {
      throw new BadRequestException(
        'No se puede eliminar el rol porque tiene usuarios asignados',
      );
    }

    return this.prisma.roles.delete({
      where: { id_rol },
    });
  }
}
