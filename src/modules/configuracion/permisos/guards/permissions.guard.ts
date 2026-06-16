import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from 'src/prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permisosRequeridos =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!permisosRequeridos.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    let idRol = Number(user.id_rol ?? user.idRol ?? user.rolId);

    if (!idRol) {
      const idUsuario = Number(user.sub ?? user.id_usuario ?? user.id);

      if (!idUsuario) {
        throw new ForbiddenException('No se pudo validar el rol del usuario');
      }

      const usuario = await this.prisma.usuario.findUnique({
        where: { id_usuario: idUsuario },
        select: { id_rol: true },
      });

      if (!usuario) {
        throw new ForbiddenException('Usuario no encontrado');
      }

      idRol = usuario.id_rol;
    }

    const permisosDelRol = await this.prisma.permisos.findMany({
      where: {
        nombre_permiso: {
          in: permisosRequeridos,
        },
        roles_permisos: {
          some: {
            id_rol: idRol,
          },
        },
      },
      select: {
        nombre_permiso: true,
      },
    });

    const permisosEncontrados = new Set(
      permisosDelRol.map((p) => p.nombre_permiso),
    );

    const tieneTodos = permisosRequeridos.every((permiso) =>
      permisosEncontrados.has(permiso),
    );

    if (!tieneTodos) {
      throw new ForbiddenException('No tienes permiso para realizar esta acción');
    }

    return true;
  }
}