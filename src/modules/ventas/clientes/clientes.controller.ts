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
  UseGuards,
} from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { JwtAuthGuard } from 'src/modules/auth/login/jwt/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly service: ClientesService) { }

  @Post()
  create(@Body() dto: CreateClienteDto) {
    return this.service.create(dto);
  }

  // /clientes?incluirInactivos=true&q=juan
  @Get()
  findAll(
    @Query('incluirInactivos', new ParseBoolPipe({ optional: true }))
    incluirInactivos?: boolean,
    @Query('q') q?: string,
    @Query('id_bodega') id_bodega?: string,
  ) {
    return this.service.findAll({
      incluirInactivos,
      q,
      id_bodega: id_bodega ? Number(id_bodega) : undefined,
    });
  }

  @Get('meta')
  getMeta() {
    return this.service.getMeta();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClienteDto) {
    return this.service.update(id, dto);
  }

  // Soft delete
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}