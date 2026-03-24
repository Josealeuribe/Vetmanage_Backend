import { Module } from '@nestjs/common';
import { TipoProveedorController } from './tipo-proveedor.controller';
import { TipoProveedorService } from './tipo-proveedor.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [TipoProveedorController],
  providers: [TipoProveedorService, PrismaService],
  exports: [TipoProveedorService],
})
export class TipoProveedorModule {}
