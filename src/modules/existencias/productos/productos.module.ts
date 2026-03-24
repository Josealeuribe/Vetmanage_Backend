import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProductosController } from './productos.controller';
import { ProductosService } from './productos.service';
import { CategoriaProductoController } from './categoria-producto/categoria-producto.controller';
import { CategoriaProductoService } from './categoria-producto/categoria-producto.service';
import { IvaController } from './iva/iva.controller';
import { IvaService } from './iva/iva.service';

@Module({
  imports: [],
  controllers: [
    ProductosController,
    CategoriaProductoController,
    IvaController,
  ],
  providers: [
    PrismaService,
    ProductosService,
    CategoriaProductoService,
    IvaService,
  ],
  exports: [ProductosService, CategoriaProductoService, IvaService],
})
export class ProductosModule {}
