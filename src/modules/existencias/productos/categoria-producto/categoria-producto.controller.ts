import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CategoriaProductoService } from './categoria-producto.service';

@Controller('categoria-producto')
export class CategoriaProductoController {
  constructor(private readonly service: CategoriaProductoService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
