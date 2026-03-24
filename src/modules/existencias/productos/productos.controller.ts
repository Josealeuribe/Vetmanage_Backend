import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ProductosService,
  ProductosFindAllResponse,
  ProductoPayload,
} from './productos.service';
import { CreateProductoDto } from './dto/crear-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { ListProductoQueryDto } from './dto/list-producto.query.dto';

@Controller('producto')
export class ProductosController {
  constructor(private readonly service: ProductosService) {}

  @Post()
  create(@Body() dto: CreateProductoDto): Promise<ProductoPayload> {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query() query: ListProductoQueryDto,
  ): Promise<ProductosFindAllResponse> {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('includeRefs') includeRefs?: 'true' | 'false',
  ) {
    return this.service.findOne(id, includeRefs !== 'false');
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductoDto,
  ): Promise<ProductoPayload> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  disable(@Param('id', ParseIntPipe) id: number): Promise<ProductoPayload> {
    return this.service.disable(id);
  }

  @Patch(':id/enable')
  enable(@Param('id', ParseIntPipe) id: number): Promise<ProductoPayload> {
    return this.service.enable(id);
  }
}
