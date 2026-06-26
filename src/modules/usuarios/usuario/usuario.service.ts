import { PrismaService } from '../../../prisma/prisma.service';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import * as bcrypt from 'bcrypt';
import { usuarioSelect } from './selects/usuario.select';
import { Prisma } from '@prisma/client';
import { ListUsuarioQueryDto } from './dto/list-usuario.query.dto';
import { MailService } from 'src/modules/auth/mail/mail.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  generarClaveTemporal,
  generarTokenPlano,
  hashToken,
} from 'src/common/utils/password-setup.util';

export type UsuarioPayload = Prisma.usuarioGetPayload<{
  select: typeof usuarioSelect;
}>;

export type UsuariosFindAllResponse =
  | UsuarioPayload[]
  | {
    page: number;
    limit: number;
    total: number;
    pages: number;
    data: UsuarioPayload[];
  };

type PrismaKnownError = { code: string; meta?: unknown };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPrismaKnownError(e: unknown): e is PrismaKnownError {
  return isObject(e) && typeof e['code'] === 'string';
}

@Injectable()
export class UsuarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) { }

  private normalizarTexto(value: string) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\./g, '')
      .trim()
      .toLowerCase();
  }

  private calcularEdad(fechaNacimiento: Date) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const nacimiento = new Date(
      fechaNacimiento.getFullYear(),
      fechaNacimiento.getMonth(),
      fechaNacimiento.getDate(),
    );

    nacimiento.setHours(0, 0, 0, 0);

    let edad = hoy.getFullYear() - nacimiento.getFullYear();

    const noHaCumplidoEsteAnio =
      hoy.getMonth() < nacimiento.getMonth() ||
      (hoy.getMonth() === nacimiento.getMonth() &&
        hoy.getDate() < nacimiento.getDate());

    if (noHaCumplidoEsteAnio) edad--;

    return edad;
  }

  private parseFechaNacimiento(value: string | Date | null | undefined) {
    if (!value) {
      throw new BadRequestException('La fecha de nacimiento es requerida');
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new BadRequestException('La fecha de nacimiento no es válida');
      }

      return value;
    }

    const fechaTexto = String(value).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTexto)) {
      throw new BadRequestException(
        'La fecha de nacimiento debe tener un formato válido',
      );
    }

    const [year, month, day] = fechaTexto.split('-').map(Number);

    const fecha = new Date(year, month - 1, day);
    fecha.setHours(0, 0, 0, 0);

    if (
      fecha.getFullYear() !== year ||
      fecha.getMonth() !== month - 1 ||
      fecha.getDate() !== day
    ) {
      throw new BadRequestException('La fecha de nacimiento no es válida');
    }

    return fecha;
  }

  private async validarTipoDocumentoYFechaNacimiento(
    idTipoDoc: number,
    fechaNacimientoValue: string | Date | null | undefined,
  ) {
    const tipoDocumento = await this.prisma.tipo_documento.findUnique({
      where: { id_tipo_doc: idTipoDoc },
      select: {
        id_tipo_doc: true,
        nombre_doc: true,
      },
    });

    if (!tipoDocumento) {
      throw new BadRequestException('Tipo de documento inválido');
    }

    const tipoNormalizado = this.normalizarTexto(tipoDocumento.nombre_doc);

    if (tipoNormalizado === 'nit' || tipoNormalizado.includes('nit')) {
      throw new BadRequestException('No se permite registrar usuarios con NIT');
    }

    const fechaNacimiento = this.parseFechaNacimiento(fechaNacimientoValue);

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (fechaNacimiento > hoy) {
      throw new BadRequestException(
        'La fecha de nacimiento no puede ser futura',
      );
    }

    const edad = this.calcularEdad(fechaNacimiento);

    if (edad > 120) {
      throw new BadRequestException(
        'La fecha de nacimiento no puede superar los 120 años',
      );
    }

    if (edad < 16) {
      throw new BadRequestException(
        'No se pueden registrar usuarios menores de 16 años',
      );
    }

    const esTarjetaIdentidad =
      tipoNormalizado === 'ti' ||
      tipoNormalizado.includes('tarjeta de identidad');

    const esDocumentoMayorEdad =
      tipoNormalizado === 'cc' ||
      tipoNormalizado === 'ce' ||
      tipoNormalizado === 'pasaporte' ||
      tipoNormalizado.includes('cedula de ciudadania') ||
      tipoNormalizado.includes('cedula extranjeria');

    if (esTarjetaIdentidad && edad >= 18) {
      throw new BadRequestException(
        'Para Tarjeta de Identidad, el usuario debe tener entre 16 y 17 años',
      );
    }

    if (esDocumentoMayorEdad && edad < 18) {
      throw new BadRequestException(
        'Para este tipo de documento, el usuario debe ser mayor de edad',
      );
    }

    return fechaNacimiento;
  }

  async findAll(
    query: ListUsuarioQueryDto = {},
  ): Promise<UsuariosFindAllResponse> {
    const where: Prisma.usuarioWhereInput = {};

    if (query.estado !== undefined) where.estado = query.estado === 'true';

    if (query.q && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { nombre: { contains: q } },
        { apellido: { contains: q } },
        { email: { contains: q } },
        { num_documento: { contains: q } },
      ];
    }

    const hasPagination = query.page !== undefined || query.limit !== undefined;

    if (!hasPagination) {
      return this.prisma.usuario.findMany({
        where,
        orderBy: { id_usuario: 'desc' },
        select: usuarioSelect,
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id_usuario: 'desc' },
        select: usuarioSelect,
      }),
    ]);

    return { page, limit, total, pages: Math.ceil(total / limit), data };
  }

  async findOne(id: number): Promise<UsuarioPayload> {
    const user = await this.prisma.usuario.findUnique({
      where: { id_usuario: id },
      select: usuarioSelect,
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(dto: CrearUsuarioDto) {
    const claveTemporal = generarClaveTemporal();
    const passwordHash = await bcrypt.hash(claveTemporal, 10);

    const fechaNacimiento = await this.validarTipoDocumentoYFechaNacimiento(
      dto.id_tipo_doc,
      dto.fecha_nacimiento,
    );

    const tokenPlano = generarTokenPlano();
    const tokenHash = hashToken(tokenPlano);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    const usuarioCreado = await this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          nombre: dto.nombre,
          apellido: dto.apellido,
          id_tipo_doc: dto.id_tipo_doc,
          num_documento: dto.num_documento,
          email: dto.email,
          contrasena: passwordHash,
          id_rol: dto.id_rol,
          estado: dto.estado ?? true,
          telefono: dto.telefono ?? null,
          fecha_nacimiento: fechaNacimiento,
          img_url: dto.img_url ?? null,
          id_genero: dto.id_genero ?? null,
        },
        select: usuarioSelect,
      });

      await tx.password_setup_token.create({
        data: {
          id_usuario: usuario.id_usuario,
          token_hash: tokenHash,
          expires_at: expiresAt,
        },
      });

      return usuario;
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const enlace = `${frontendUrl}/restablecer-contrasena?token=${tokenPlano}`;

    console.log('==========================================');
    console.log('LINK DE CREACIÓN DE CONTRASEÑA');
    console.log(`Usuario: ${dto.email}`);
    console.log(enlace);
    console.log('==========================================');

    setImmediate(async () => {
      try {
        await this.mailService.enviarCreacionContrasena({
          to: dto.email,
          nombre: dto.nombre,
          enlace,
        });
      } catch (error) {
        console.error(
          'Error enviando correo de creación de contraseña:',
          error,
        );
      }
    });

    return {
      message:
        'Usuario creado correctamente. El correo para definir la contraseña se enviará en breve.',
      usuario: usuarioCreado,
    };
  }

  async update(id: number, dto: ActualizarUsuarioDto) {
    const exists = await this.prisma.usuario.findUnique({
      where: { id_usuario: id },
      select: {
        id_usuario: true,
        id_tipo_doc: true,
        fecha_nacimiento: true,
      },
    });

    if (!exists) throw new NotFoundException('Usuario no encontrado');

    const idTipoDocFinal = dto.id_tipo_doc ?? exists.id_tipo_doc;

    const fechaNacimientoFinal =
      dto.fecha_nacimiento !== undefined
        ? dto.fecha_nacimiento
        : exists.fecha_nacimiento;

    const fechaNacimientoValidada =
      await this.validarTipoDocumentoYFechaNacimiento(
        idTipoDocFinal,
        fechaNacimientoFinal,
      );

    const data: Prisma.usuarioUncheckedUpdateInput = {};

    if (dto.nombre !== undefined) {
      data.nombre = dto.nombre.trim();
    }

    if (dto.apellido !== undefined) {
      data.apellido = dto.apellido.trim();
    }

    if (dto.id_tipo_doc !== undefined) {
      data.id_tipo_doc = dto.id_tipo_doc;
    }

    if (dto.num_documento !== undefined) {
      data.num_documento = dto.num_documento.trim();
    }

    if (dto.email !== undefined) {
      data.email = dto.email.trim().toLowerCase();
    }

    if (dto.id_rol !== undefined) {
      data.id_rol = dto.id_rol;
    }

    if (dto.estado !== undefined) {
      data.estado = dto.estado;
    }

    if (dto.telefono !== undefined) {
      data.telefono = dto.telefono?.trim() || null;
    }

    if (dto.img_url !== undefined) {
      data.img_url = dto.img_url?.trim() || null;
    }

    if (dto.id_genero !== undefined) {
      data.id_genero = dto.id_genero ?? null;
    }

    if (dto.fecha_nacimiento !== undefined) {
      data.fecha_nacimiento = fechaNacimientoValidada;
    }

    return this.prisma.usuario.update({
      where: { id_usuario: id },
      data,
      select: usuarioSelect,
    });
  }

  async remove(id: number) {
    const exists = await this.prisma.usuario.findUnique({
      where: { id_usuario: id },
      select: { id_usuario: true, nombre: true, apellido: true },
    });

    if (!exists) {
      throw new NotFoundException('Usuario no encontrado');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Relaciones "seguras" que sí podemos limpiar antes
        await tx.bodegas_por_usuario.deleteMany({
          where: { id_usuario: id },
        });

        await tx.password_setup_token.deleteMany({
          where: { id_usuario: id },
        });

        // Intentar borrar usuario
        return await tx.usuario.delete({
          where: { id_usuario: id },
          select: usuarioSelect,
        });
      });
    } catch (e: unknown) {
      if (isPrismaKnownError(e) && e.code === 'P2003') {
        throw new BadRequestException(
          'No se puede eliminar el usuario porque tiene registros relacionados. Inactívalo en su lugar.',
        );
      }

      throw e;
    }
  }
}
