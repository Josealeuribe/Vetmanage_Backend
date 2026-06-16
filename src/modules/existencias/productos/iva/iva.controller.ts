import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IvaService } from './iva.service';
import { CreateIvaDto } from './dto/create-iva.dto';
import { Permissions } from 'src/modules/configuracion/permisos/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/modules/configuracion/permisos/guards/permissions.guard';

@Controller('iva')
export class IvaController {
  constructor(private readonly service: IvaService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Permissions('existencias.productos.crear_iva')
  create(@Body() dto: CreateIvaDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}