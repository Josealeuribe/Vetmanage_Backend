import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { SolicitarRestablecimientoDto } from '../dto/solicitar-restablecimiento.dto';
import { RestablecerContrasenaService } from '../restablecer-contrasena.service';
import { ActualizarMiPerfilDto } from '../dto/actualizar-mi-perfil.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly restablecerContrasenaService: RestablecerContrasenaService,
    private readonly cloudinaryService: CloudinaryService,
  ) { }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.service.login(dto.email, dto.contrasena);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async me(@Req() req: any) {
    return this.service.getMe(req.user.id_usuario);
  }

  @Post('solicitar-restablecimiento')
  async solicitarRestablecimiento(
    @Body() dto: SolicitarRestablecimientoDto,
  ) {
    return this.restablecerContrasenaService.solicitarRestablecimiento(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('mi-perfil')
  async miPerfil(@Req() req: any) {
    return this.service.getMe(req.user.id_usuario);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('mi-perfil')
  async actualizarMiPerfil(
    @Req() req: any,
    @Body() dto: ActualizarMiPerfilDto,
  ) {
    return this.service.actualizarMiPerfil(req.user.id_usuario, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('mi-perfil/foto')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];

        if (!allowed.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              'Debes subir una imagen JPG, PNG o WEBP menor a 5MB',
            ),
            false,
          );
          return;
        }

        cb(null, true);
      },
    }),
  )
  async subirFotoPerfil(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Debes subir una imagen JPG, PNG o WEBP menor a 5MB',
      );
    }

    const result = await this.cloudinaryService.subirImagenDesdeBuffer(
      file,
      'vetmanage/perfiles',
    );

    return this.service.actualizarFotoPerfil(
      req.user.id_usuario,
      result.secure_url,
    );
  }
}