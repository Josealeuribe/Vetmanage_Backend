import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { CrearContrasenaDto } from './dto/crear-contrasena.dto';
import { hashToken } from 'src/common/utils/password-setup.util';

@Injectable()
export class CrearContrasenaService {
  constructor(private readonly prisma: PrismaService) {}

  async crearContrasena(dto: CrearContrasenaDto) {
    const tokenHash = hashToken(dto.token);

    const registro = await this.prisma.password_setup_token.findFirst({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: {
          gt: new Date(),
        },
      },
    });

    if (!registro) {
      throw new BadRequestException('El enlace no es válido o ya venció');
    }

    const nuevaContrasenaHash = await bcrypt.hash(dto.contrasena, 10);

    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id_usuario: registro.id_usuario },
        data: {
          contrasena: nuevaContrasenaHash,
        },
      }),
      this.prisma.password_setup_token.update({
        where: { id_token: registro.id_token },
        data: {
          used_at: new Date(),
        },
      }),
    ]);

    return {
      message: 'Contraseña creada correctamente',
    };
  }
}
