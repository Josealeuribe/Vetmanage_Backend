import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TerminoPagoService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.termino_pago.findMany({
      orderBy: {
        nombre_termino: 'asc',
      },
      select: {
        id_termino_pago: true,
        nombre_termino: true,
      },
    });
  }
}
