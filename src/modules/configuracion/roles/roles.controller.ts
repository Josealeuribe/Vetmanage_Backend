import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { AsignarPermisosRolDto } from './dto/asignar-permiso-rol.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Post()
  create(@Body() dto: CreateRolDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('incluirInactivos', new ParseBoolPipe({ optional: true }))
    incluirInactivos?: boolean,
  ) {
    return this.service.findAll({ incluirInactivos });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRolDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/permisos')
  asignarPermisos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarPermisosRolDto,
  ) {
    return this.service.asignarPermisos(id, dto.ids_permisos);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
