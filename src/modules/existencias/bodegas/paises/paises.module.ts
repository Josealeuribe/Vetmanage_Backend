import { Module } from '@nestjs/common';
import { PaisesController } from './paises.controller';
import { PaisesService } from './paises.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [PaisesController],
  providers: [PaisesService, PrismaService],
  exports: [PaisesService],
})
export class PaisesModule {}