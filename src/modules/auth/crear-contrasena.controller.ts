import { Body, Controller, Post } from '@nestjs/common';
import { CrearContrasenaService } from './crear-contrasena.service';
import { CrearContrasenaDto } from './dto/crear-contrasena.dto';

@Controller('auth')
export class CrearContrasenaController {
  constructor(private readonly service: CrearContrasenaService) {}

  @Post('crear-contrasena')
  crearContrasena(@Body() dto: CrearContrasenaDto) {
    return this.service.crearContrasena(dto);
  }
}
