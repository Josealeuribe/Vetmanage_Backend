import { Module } from '@nestjs/common';
import { TerminoPagoController } from './termino-pago.controller';
import { TerminoPagoService } from './termino-pago.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [TerminoPagoController],
  providers: [TerminoPagoService, PrismaService],
  exports: [TerminoPagoService],
})
export class TerminoPagoModule {}
